import { useSyncExternalStore } from "react";
import {
  worldDataProvider,
  type WorldDataProvider,
  type WorldSessionSnapshot,
} from "@/world/privateWorldSession";
import { processAudio, stopMemoryAudio, type ProcessedAudio } from "./audio";
import { processPhoto } from "./imagePipeline";
import {
  createIndexedDbPersistence,
  unavailablePersistence,
  type MemoryPersistence,
} from "./persistence";
import {
  JournalEntrySchema,
  MemorySchema,
  parseMemoryDocument,
  serializeDocument,
  type Memory,
  type JournalEntry,
  type MemoryDocument,
  type Photo,
} from "./schema";

export interface MemorySessionSnapshot {
  memories: Memory[];
  journal: JournalEntry[];
  guest: boolean;
  persistent: boolean;
  error: string | null;
  ready: boolean;
}
export type PhotoProcessor = (blob: Blob, rects?: unknown) => Promise<Photo>;
export type AudioProcessor = (blob: Blob) => Promise<ProcessedAudio>;
const id = (seed: string) => `00000000-0000-4000-8000-${seed.padStart(12, "0")}`;
const fixtureMemory = (n: number): Memory => ({
  id: id(String(n)),
  title: "Ví dụ tổng hợp",
  body: "Ví dụ tổng hợp",
  position: [n * 15 - 30, 0, 18],
  camera: {
    mode: "diorama",
    target: [n * 15 - 30, 0, 18],
    yaw: 0,
    pitch: 0.8,
    distance: 80,
    zoom: 1,
  },
  date: "2025-01-01",
  preset: "everyday",
  tags: ["fixture"],
  photos: [],
  visibility: "public",
});
const fixture: MemoryDocument = {
  schemaVersion: 1,
  memories: [fixtureMemory(1), fixtureMemory(2), fixtureMemory(3)],
  journal: ["land", "foundation", "frame"].map((stage, n) => ({
    id: id(String(101 + n)),
    date: "2025-01-01",
    stage: stage as JournalEntry["stage"],
    body: "Ví dụ tổng hợp",
    photos: [],
  })),
};
const empty = (): MemoryDocument => ({ schemaVersion: 1, memories: [], journal: [] });
type Bounds = {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
};
function bounds(snapshot: WorldSessionSnapshot): Bounds {
  const b = {
    minX: Infinity,
    maxX: -Infinity,
    minY: 0,
    maxY: 100,
    minZ: Infinity,
    maxZ: -Infinity,
  };
  if (!("world" in snapshot)) return b;
  const world = snapshot.world;
  const points: readonly number[][] = [
    ...world.roads.flatMap((road) => road.polylineENU),
    ...[...world.buildings, ...world.lots].flatMap((item) =>
      item.geometry.type === "Polygon"
        ? item.geometry.coordinates.flat()
        : item.geometry.coordinates.flat(2),
    ),
  ];
  for (const p of points) {
    b.minX = Math.min(b.minX, p[0] ?? 0);
    b.maxX = Math.max(b.maxX, p[0] ?? 0);
    b.minZ = Math.min(b.minZ, p[1] ?? 0);
    b.maxZ = Math.max(b.maxZ, p[1] ?? 0);
  }
  if (!Number.isFinite(b.minX)) return { minX: 0, maxX: 0, minY: 0, maxY: 100, minZ: 0, maxZ: 0 };
  return b;
}
const clamp = (n: number, low: number, high: number) => Math.max(low, Math.min(high, n));
function clampMemory(memory: Memory, world: WorldSessionSnapshot): Memory {
  const b = bounds(world);
  return {
    ...memory,
    position: [
      clamp(memory.position[0], b.minX, b.maxX),
      clamp(memory.position[1], b.minY, b.maxY),
      clamp(memory.position[2], b.minZ, b.maxZ),
    ],
    camera: {
      ...memory.camera,
      target: [
        clamp(memory.camera.target[0], b.minX, b.maxX),
        clamp(memory.camera.target[1], b.minY, b.maxY),
        clamp(memory.camera.target[2], b.minZ, b.maxZ),
      ],
    },
  };
}
function dataUrlBlob(dataUrl: string): Blob {
  const comma = dataUrl.indexOf(",");
  const header = dataUrl.slice(0, comma);
  const encoded = dataUrl.slice(comma + 1);
  const binary =
    typeof atob === "function" ? atob(encoded) : Buffer.from(encoded, "base64").toString("binary");
  return new Blob([Uint8Array.from(binary, (c) => c.charCodeAt(0))], {
    type: header.slice(5, header.indexOf(";")),
  });
}

export function createMemorySession(
  options: {
    persistence?: MemoryPersistence;
    worldProvider?: WorldDataProvider;
    photoProcessor?: PhotoProcessor;
    audioProcessor?: AudioProcessor;
  } = {},
) {
  const persistence = options.persistence ?? createIndexedDbPersistence();
  const provider = options.worldProvider ?? worldDataProvider;
  const initial = provider.getSnapshot();
  let current: MemoryDocument = initial.mode === "fixture" ? structuredClone(fixture) : empty();
  let worldKey: string | null = initial.mode === "fixture" ? "synthetic-fixture-p10" : null;
  let persistent = false,
    guest = false,
    ready = false,
    references = 0,
    generation = 0,
    error: string | null = null;
  let undo: { memory: Memory; at: number } | null = null;
  let observedEpoch = initial.packageEpoch;
  let observedMode = initial.mode;
  let observedLoading = initial.loading;
  let observedError = initial.mode === "private-error";
  let photoProcessor = options.photoProcessor ?? processPhoto;
  let audioProcessor = options.audioProcessor ?? processAudio;
  let worldUnsubscribe: (() => void) | null = null;
  const ram = new Map<string, MemoryDocument>();
  const modified = new Set<string>();
  let ramOnly = false;
  const listeners = new Set<() => void>();
  let cached: MemorySessionSnapshot = {
    memories: current.memories,
    journal: current.journal,
    guest,
    persistent,
    error,
    ready,
  };
  const emit = () => {
    cached = {
      memories: current.memories,
      journal: current.journal,
      guest,
      persistent,
      error,
      ready,
    };
    listeners.forEach((listener) => listener());
  };
  const reset = (nextReady = false) => {
    current = empty();
    ready = nextReady;
    emit();
  };
  const load = async () => {
    const token = ++generation;
    const beforeKey = worldKey;
    if (beforeKey && ready) ram.set(beforeKey, structuredClone(current));
    ready = false;
    error = null;
    reset(false);
    let key = await provider.getMemoryWorldKey();
    ramOnly = !key && provider.getSnapshot().mode === "private" && !provider.getSnapshot().loading;
    if (ramOnly) {
      key = `ram-session-${provider.getPackageEpoch()}`;
      error = "CRYPTO_UNAVAILABLE_RAM_ONLY";
    }
    if (token !== generation || !key) {
      if (token === generation) emit();
      return;
    }
    worldKey = key;
    const inMemory = ram.get(key);
    if (!persistent || ramOnly) {
      current = inMemory
        ? structuredClone(inMemory)
        : key === "synthetic-fixture-p10"
          ? structuredClone(fixture)
          : empty();
      current.memories = current.memories.map((m) =>
        m.visibility === "public" && m.photos.some((p) => !p.reviewed)
          ? { ...m, visibility: "private" }
          : m,
      );
      ram.set(key, structuredClone(current));
      ready = true;
      emit();
      return;
    }
    try {
      const stored = await persistence.read(key);
      if (token !== generation) return;
      current =
        inMemory && modified.has(key)
          ? structuredClone(inMemory)
          : (stored ?? (key === "synthetic-fixture-p10" ? structuredClone(fixture) : empty()));
      current.memories = current.memories.map((m) =>
        m.visibility === "public" && m.photos.some((p) => !p.reviewed)
          ? { ...m, visibility: "private" }
          : m,
      );
      ram.set(key, structuredClone(current));
      ready = true;
      emit();
    } catch {
      if (token === generation) {
        current =
          inMemory ?? (key === "synthetic-fixture-p10" ? structuredClone(fixture) : empty());
        ram.set(key, structuredClone(current));
        error = "PERSISTENCE_UNAVAILABLE";
        ready = true;
        emit();
      }
    }
  };
  const onWorld = (next: WorldSessionSnapshot) => {
    const identityChanged = next.packageEpoch !== observedEpoch || next.mode !== observedMode;
    const loadingTransition = observedLoading !== next.loading;
    const errorTransition = observedError !== (next.mode === "private-error");
    observedEpoch = next.packageEpoch;
    observedMode = next.mode;
    observedLoading = next.loading;
    observedError = next.mode === "private-error";
    if (!identityChanged && !loadingTransition && !errorTransition) return;
    if (next.loading || next.mode === "private-error") {
      if (worldKey && ready) ram.set(worldKey, structuredClone(current));
      generation++;
      worldKey = null;
      undo = null;
      stopMemoryAudio();
      reset(false);
      return;
    }
    undo = null;
    stopMemoryAudio();
    void load();
  };
  let persistenceTail: Promise<void> = Promise.resolve();
  const enqueuePersistence = (action: () => Promise<void>) => {
    const pending = persistenceTail.then(action, action);
    persistenceTail = pending.catch(() => {});
    return pending;
  };
  const write = async () => {
    if (!ready || !worldKey) return;
    const key = worldKey;
    const document = structuredClone(current);
    ram.set(key, document);
    modified.add(key);
    if (!persistent || ramOnly) return;
    const token = generation;
    try {
      await enqueuePersistence(() => persistence.write(key, document));
    } catch {
      if (token === generation) {
        error = "PERSISTENCE_UNAVAILABLE";
        emit();
      }
    }
  };
  const ensureReady = () => {
    if (!ready || !worldKey) throw new Error("WORLD_NOT_READY");
  };
  const api = {
    getSnapshot: () => cached,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    start() {
      references++;
      if (references === 1) {
        worldUnsubscribe = provider.subscribe(onWorld);
        void load();
      }
    },
    stop() {
      references = Math.max(0, references - 1);
      if (!references) {
        worldUnsubscribe?.();
        worldUnsubscribe = null;
        generation++;
        stopMemoryAudio();
      }
    },
    saveMemory(memory: Memory) {
      ensureReady();
      const value = clampMemory(MemorySchema.parse(memory), provider.getSnapshot());
      if (current.memories.length >= 300 && !current.memories.some((m) => m.id === value.id))
        throw new Error("MEMORY_LIMIT");
      if (value.visibility === "public" && value.photos.some((photo) => !photo.reviewed))
        throw new Error("PUBLIC_PHOTOS_MUST_BE_REVIEWED");
      current = {
        ...current,
        memories: [...current.memories.filter((x) => x.id !== value.id), value],
      };
      undo = null;
      emit();
      void write();
      return value.id;
    },
    deleteMemory(memoryId: string) {
      ensureReady();
      const found = current.memories.find((x) => x.id === memoryId);
      if (!found) return false;
      undo = { memory: found, at: Date.now() };
      current = { ...current, memories: current.memories.filter((x) => x.id !== memoryId) };
      emit();
      void write();
      return true;
    },
    undoDelete() {
      ensureReady();
      if (!undo || Date.now() - undo.at > 10_000) {
        undo = null;
        return false;
      }
      if (current.memories.length >= 300) return false;
      current = { ...current, memories: [...current.memories, undo.memory] };
      undo = null;
      emit();
      void write();
      return true;
    },
    saveJournal(entry: JournalEntry) {
      ensureReady();
      const value = JournalEntrySchema.parse(entry);
      if (current.journal.length >= 300 && !current.journal.some((m) => m.id === value.id))
        throw new Error("JOURNAL_LIMIT");
      current = {
        ...current,
        journal: [...current.journal.filter((x) => x.id !== value.id), value],
      };
      emit();
      void write();
      return value.id;
    },
    deleteJournal(entryId: string) {
      ensureReady();
      current = { ...current, journal: current.journal.filter((x) => x.id !== entryId) };
      emit();
      void write();
    },
    setGuest(value: boolean) {
      guest = value;
      emit();
    },
    async setPersistent(value: boolean) {
      if (value && ramOnly) {
        error = "CRYPTO_UNAVAILABLE_RAM_ONLY";
        persistent = false;
        emit();
        return;
      }
      persistent = value;
      emit();
      if (value) {
        await load();
        await write();
      }
    },
    async clearAll() {
      ensureReady();
      generation++;
      current = empty();
      ram.clear();
      modified.clear();
      if (worldKey) ram.set(worldKey, structuredClone(current));
      undo = null;
      emit();
      try {
        const key = worldKey;
        await enqueuePersistence(async () => {
          if (persistence.clear) await persistence.clear();
          else if (key) await persistence.remove(key);
        });
      } catch {
        error = "PERSISTENCE_UNAVAILABLE";
        emit();
      }
    },
    exportDocument(publicOnly = false) {
      return serializeDocument(current, publicOnly || guest);
    },
    async importDocument(text: string, options: { isCancelled?: () => boolean } = {}) {
      ensureReady();
      const token = ++generation;
      const snapshot = provider.getSnapshot();
      const cancelled = () => token !== generation || options.isCancelled?.() === true;
      const parsed = parseMemoryDocument(text);
      const next: MemoryDocument = { schemaVersion: 1, memories: [], journal: [] };
      for (const memory of parsed.memories) {
        if (cancelled()) return;
        const value = clampMemory(memory, snapshot);
        const photos = [];
        for (const photo of value.photos) {
          if (cancelled()) return;
          photos.push({ ...(await photoProcessor(dataUrlBlob(photo.dataUrl))), reviewed: false });
        }
        const nextMemory = { ...value, photos };
        if (value.audio) {
          if (cancelled()) return;
          const audio = await audioProcessor(dataUrlBlob(value.audio.dataUrl));
          nextMemory.audio = { ...audio } as Memory["audio"];
        }
        next.memories.push(nextMemory);
      }
      for (const entry of parsed.journal) {
        if (cancelled()) return;
        const photos = [];
        for (const photo of entry.photos) {
          if (cancelled()) return;
          photos.push({ ...(await photoProcessor(dataUrlBlob(photo.dataUrl))), reviewed: false });
        }
        next.journal.push({ ...entry, photos });
      }
      if (cancelled()) return;
      current = parseMemoryDocument(next);
      current.memories = current.memories.map((m) =>
        m.photos.some((p) => !p.reviewed) ? { ...m, visibility: "private" } : m,
      );
      error = null;
      emit();
      await write();
    },
    setPhotoProcessor(next: PhotoProcessor) {
      photoProcessor = next;
    },
    setAudioProcessor(next: AudioProcessor) {
      audioProcessor = next;
    },
    diagnostics() {
      return persistence.diagnostics?.() ?? { connections: 0, opens: 0 };
    },
    use: () => useSyncExternalStore(api.subscribe, api.getSnapshot, api.getSnapshot),
    _persistence: persistence === unavailablePersistence ? "unavailable" : "available",
  };
  return api;
}
export const memorySession = createMemorySession();
export const getMemorySession = () => memorySession;
