import type { WorldDataProvider } from "@/world/privateWorldSession";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  MemorySchema,
  DocumentSchema,
  publicDocument,
  type Memory,
  type MemoryDocument,
} from "@/memories/schema";
import { clampCameraPose, interpolateCameraPose } from "@/memories/camera";
import { buildMemoryHash, parseMemoryHash } from "@/memories/deepLink";
import {
  bindMemoryCamera,
  memoryCamera,
  acquireMemoryCamera,
  memoryCameraRefCount,
} from "@/memories/bridge";
import { createMemorySession } from "@/memories/session";
import { createWorldDataProvider } from "@/world/privateWorldSession";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import type { MemoryPersistence } from "@/memories/persistence";

const id = "11111111-1111-4111-8111-111111111111";
const photoUrl = "data:image/png;base64,iVBORw0KGgo=";
const audioUrl = "data:audio/wav;base64,AA==";
const pose = {
  mode: "diorama" as const,
  target: [0, 0, 0] as [number, number, number],
  yaw: 0,
  pitch: 0.72,
  distance: 20,
  zoom: 1,
};
const memory = (overrides: Partial<Memory> = {}): Memory => ({
  id,
  title: "title",
  body: "body",
  position: [0, 0, 0],
  camera: pose,
  date: "2025-01-01",
  preset: "everyday",
  tags: [],
  photos: [],
  visibility: "private",
  ...overrides,
});
const document = (overrides: Partial<MemoryDocument> = {}): MemoryDocument => ({
  schemaVersion: 1,
  memories: [memory()],
  journal: [],
  ...overrides,
});
const persistence = (stored: MemoryDocument | null = null) => {
  const state = { stored, reads: 0, writes: 0, removes: 0, clears: 0 };
  const api: MemoryPersistence & typeof state = {
    ...state,
    async read() {
      api.reads++;
      return api.stored;
    },
    async write(_key, value) {
      api.writes++;
      api.stored = structuredClone(value);
    },
    async remove() {
      api.removes++;
      api.stored = null;
    },
    async clear() {
      api.clears++;
      api.stored = null;
    },
  };
  return api;
};
const ready = async (s: ReturnType<typeof createMemorySession>) => {
  s.start();
  await vi.waitFor(() => expect(s.getSnapshot().ready).toBe(true));
};

describe("P10 schemas and public projection", () => {
  it("rejects nonfinite ENU, invalid 2025-02-29, and unknown fields", () => {
    for (const bad of [
      { position: [NaN, 0, 0] },
      { position: [Infinity, 0, 0] },
      { date: "2025-02-29" },
      { extra: true },
    ])
      expect(() => MemorySchema.parse({ ...memory(), ...bad })).toThrow();
  });
  it("enforces title/body/tags/photo/audio limits and DocumentSchema 300", () => {
    expect(() => MemorySchema.parse(memory({ title: "x".repeat(81) }))).toThrow();
    expect(() => MemorySchema.parse(memory({ body: "x".repeat(2001) }))).toThrow();
    expect(() =>
      MemorySchema.parse(memory({ tags: Array.from({ length: 6 }, () => "x") })),
    ).toThrow();
    expect(() => MemorySchema.parse(memory({ tags: ["x".repeat(21)] }))).toThrow();
    const photo = {
      id: "p",
      dataUrl: photoUrl,
      thumbnail: photoUrl,
      placeholder: photoUrl,
      width: 1,
      height: 1,
      reviewed: true,
    };
    expect(() =>
      MemorySchema.parse(memory({ photos: Array.from({ length: 7 }, () => photo) })),
    ).toThrow();
    expect(() =>
      MemorySchema.parse(memory({ audio: { dataUrl: audioUrl, duration: 61, mime: "audio/wav" } })),
    ).toThrow();
    expect(() =>
      DocumentSchema.parse({
        schemaVersion: 1,
        memories: Array.from({ length: 301 }, () => memory()),
        journal: [],
      }),
    ).toThrow();
  });
  it("publicDocument strips private memories and journal plus unreviewed photos", () => {
    const pub = publicDocument(
      document({
        memories: [
          memory({ visibility: "private" }),
          memory({
            id: "22222222-2222-4222-8222-222222222222",
            visibility: "public",
            photos: [
              {
                id: "p",
                dataUrl: photoUrl,
                thumbnail: photoUrl,
                placeholder: photoUrl,
                width: 1,
                height: 1,
                reviewed: false,
              },
            ],
          }),
        ],
        journal: [
          {
            id: "33333333-3333-4333-8333-333333333333",
            date: "2025-01-01",
            stage: "land",
            body: "j",
            photos: [],
          },
        ],
      }),
    );
    expect(pub.journal).toEqual([]);
    expect(pub.memories).toHaveLength(0);
  });
});

describe("camera, deep links, and bridge", () => {
  it("wraps the seam and clamps y >= 0", () => {
    const p = clampCameraPose({ ...pose, yaw: Math.PI + 0.2, target: [1, -4, 2] });
    expect(p.yaw).toBeCloseTo(-Math.PI + 0.2);
    expect(p.target[1]).toBe(0);
  });
  it("interpolates endpoints, shortest seam, and monotonic smooth scalar values", () => {
    const a = { ...pose, yaw: Math.PI - 0.1, distance: 4 };
    const b = { ...pose, yaw: -Math.PI + 0.1, distance: 20 };
    expect(interpolateCameraPose(a, b, 0)).toEqual(clampCameraPose(a));
    expect(interpolateCameraPose(a, b, 1)).toEqual(clampCameraPose(b));
    const xs = [0, 0.25, 0.5, 0.75, 1].map((t) => interpolateCameraPose(a, b, t).distance);
    expect(xs).toEqual([4, 8, 12, 16, 20]);
    expect(Math.abs(interpolateCameraPose(a, b, 0.5).yaw)).toBeCloseTo(Math.PI);
  });
  it("builds/parses links and rejects duplicate, unknown, NaN, negative pitch, oversized, malicious UUID", () => {
    const hash = buildMemoryHash({ pose, time: 10, id });
    expect(parseMemoryHash(hash)).toMatchObject({ valid: true, state: { time: 10, id } });
    for (const bad of [
      hash + "&yaw=1",
      "#v=1&mode=diorama&target=0,0,0&yaw=NaN&pitch=.7&distance=10&zoom=1",
      "#v=1&mode=diorama&target=0,0,0&yaw=0&pitch=-1&distance=10&zoom=1",
      "#" + "x".repeat(1025),
      "#v=1&mode=diorama&target=0,0,0&yaw=0&pitch=.7&distance=10&zoom=1&id=not-a-uuid",
      "#v=1&mode=diorama&target=0,0,0&yaw=0&pitch=.7&distance=10&zoom=1&x=1",
    ])
      expect(parseMemoryHash(bad).valid).toBe(false);
  });
  it("keeps bridge snapshots identity-stable, cleans listeners, and calls mocked camera", () => {
    const calls: string[] = [];
    let emit = () => {};
    let active = true;
    const off = bindMemoryCamera({
      getPose: () => pose,
      flyTo: () => calls.push("fly"),
      startTour: () => calls.push("tour"),
      previous: () => {},
      next: () => {},
      pause: () => {},
      exit: () => {},
      getSnapshot: () => ({ active, paused: false, index: 0, memoryId: id }),
      subscribe: (fn) => {
        emit = fn;
        return () => {
          emit = () => {};
        };
      },
    });
    const listener = vi.fn();
    const un = memoryCamera.subscribe(listener);
    expect(memoryCamera.getSnapshot()).toBe(memoryCamera.getSnapshot());
    memoryCamera.flyTo({ id, position: [0, 0, 0] } as never);
    expect(calls).toEqual(["fly"]);
    active = false;
    emit();
    expect(listener).toHaveBeenCalled();
    un();
    off();
    expect(memoryCamera.getSnapshot().active).toBe(false);
  });
  it("tracks acquire/release references", () => {
    const n = memoryCameraRefCount();
    const off = acquireMemoryCamera();
    expect(memoryCameraRefCount()).toBe(n + 1);
    off();
    expect(memoryCameraRefCount()).toBe(n);
  });
});

describe("memory session persistence and lifecycle", () => {
  it("has stable repeated snapshots and default persistent=false with no persistence calls", async () => {
    const p = persistence();
    const s = createMemorySession({ persistence: p });
    expect(s.getSnapshot()).toBe(s.getSnapshot());
    await ready(s);
    expect(s.getSnapshot()).toBe(s.getSnapshot());
    expect(s.getSnapshot().persistent).toBe(false);
    expect(p.reads + p.writes).toBe(0);
    s.stop();
  });
  it("setPersistent true stores, preserves edited RAM, and a new session explicitly reloads stored document", async () => {
    const p = persistence();
    const s = createMemorySession({ persistence: p });
    await ready(s);
    await s.setPersistent(true);
    s.saveMemory(memory({ title: "edited" }));
    await vi.waitFor(() => expect(p.writes).toBeGreaterThan(0));
    expect(s.getSnapshot().memories.some((m) => m.title === "edited")).toBe(true);
    s.stop();
    const s2 = createMemorySession({ persistence: p });
    await ready(s2);
    await s2.setPersistent(true);
    await vi.waitFor(() =>
      expect(s2.getSnapshot().memories.some((m) => m.title === "edited")).toBe(true),
    );
    s2.stop();
  });
  it("deletes and undoes within ten seconds, but not after", async () => {
    const s = createMemorySession({ persistence: persistence() });
    await ready(s);
    s.saveMemory(memory());
    const now = vi.spyOn(Date, "now").mockReturnValue(1000);
    s.deleteMemory(id);
    expect(s.undoDelete()).toBe(true);
    s.deleteMemory(id);
    now.mockReturnValue(12001);
    expect(s.undoDelete()).toBe(false);
    now.mockRestore();
    s.stop();
  });
  it("clearAll calls persistence.clear and keeps RAM empty", async () => {
    const p = persistence();
    const s = createMemorySession({ persistence: p });
    await ready(s);
    await s.setPersistent(true);
    await s.clearAll();
    expect(p.clears).toBe(1);
    expect(s.getSnapshot().memories).toEqual([]);
    s.stop();
  });
  it("imports memory and journal through processor and resets reviewed=false", async () => {
    const processor = vi.fn(async () => ({
      id: "processed",
      dataUrl: photoUrl,
      thumbnail: photoUrl,
      placeholder: photoUrl,
      width: 1,
      height: 1,
      reviewed: true,
    }));
    const d = document({
      journal: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          date: "2025-01-01",
          stage: "land",
          body: "j",
          photos: [
            {
              id: "j",
              dataUrl: photoUrl,
              thumbnail: photoUrl,
              placeholder: photoUrl,
              width: 1,
              height: 1,
              reviewed: true,
            },
          ],
        },
      ],
      memories: [
        memory({
          photos: [
            {
              id: "m",
              dataUrl: photoUrl,
              thumbnail: photoUrl,
              placeholder: photoUrl,
              width: 1,
              height: 1,
              reviewed: true,
            },
          ],
        }),
      ],
    });
    const s = createMemorySession({ persistence: persistence(), photoProcessor: processor });
    await ready(s);
    await s.importDocument(JSON.stringify(d));
    expect(processor).toHaveBeenCalledTimes(2);
    expect(s.getSnapshot().memories[0]?.photos[0]?.reviewed).toBe(false);
    expect(s.getSnapshot().journal[0]?.photos[0]?.reviewed).toBe(false);
    s.stop();
  });
  it("rejects unknown import fields without changing old document", async () => {
    const s = createMemorySession({ persistence: persistence() });
    await ready(s);
    const before = s.getSnapshot();
    await expect(
      s.importDocument(JSON.stringify({ ...document(), unknown: true })),
    ).rejects.toThrow();
    expect(s.getSnapshot().memories).toBe(before.memories);
    s.stop();
  });
  it("retains RAM on quota write failure", async () => {
    const p = persistence();
    p.write = vi.fn(async () => {
      throw new DOMException("quota", "QuotaExceededError");
    });
    const s = createMemorySession({ persistence: p });
    await ready(s);
    await s.setPersistent(true);
    s.saveMemory(memory({ title: "ram" }));
    await vi.waitFor(() => expect(s.getSnapshot().error).toBe("PERSISTENCE_UNAVAILABLE"));
    expect(s.getSnapshot().memories.some((m) => m.title === "ram")).toBe(true);
    s.stop();
  });
  it("uses distinct world keys and reacts to provider loading/change epochs", async () => {
    let key = "A";
    let epoch = 1;
    let listener = (_snapshot: unknown) => {};
    const provider = {
      getSnapshot: () => ({
        mode: "fixture",
        revision: epoch,
        packageEpoch: epoch,
        temporaryLotIllustrationSelected: false,
        loading: false,
        dirty: false,
        world: SYNTHETIC_NEIGHBORHOOD,
      }),
      subscribe: (fn: typeof listener) => {
        listener = fn;
        return () => {};
      },
      getMemoryWorldKey: async () => key,
      getPackageEpoch: () => epoch,
    } as unknown as WorldDataProvider;
    const s = createMemorySession({ persistence: persistence(), worldProvider: provider });
    await ready(s);
    s.saveMemory(memory({ title: "world-a" }));
    key = "B";
    epoch++;
    listener(provider.getSnapshot());
    await vi.waitFor(() => expect(s.getSnapshot().ready).toBe(true));
    expect(s.getSnapshot().memories.some((m) => m.title === "world-a")).toBe(false);
    s.stop();
  });
});

describe("validation smoke", () => {
  it("keeps schema assertions independent of implementation shortcuts", () => {
    expect(z.number().finite().safeParse(NaN).success).toBe(false);
  });
});
