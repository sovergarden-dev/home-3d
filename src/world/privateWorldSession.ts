import { SYNTHETIC_NEIGHBORHOOD } from "./fixtures/syntheticNeighborhood";
import { applyWorldOverrides } from "./overrides";
import { parseWorldPackage } from "./package";
import type { WorldData, WorldOverrideDocument } from "./schema";

export type WorldSessionSnapshot =
  | {
      mode: "fixture";
      revision: number;
      world: WorldData;
      overrides?: WorldOverrideDocument | undefined;
    }
  | {
      mode: "private";
      revision: number;
      world: WorldData;
      overrides?: WorldOverrideDocument | undefined;
    }
  | { mode: "private-error"; revision: number; errorCode: string };

type SessionListener = (snapshot: WorldSessionSnapshot) => void;

async function readLocalFile(file: File) {
  if (typeof file.text === "function") return file.text();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("WORLD_PACKAGE_FILE_READ_FAILED"));
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.readAsText(file);
  });
}

export interface WorldDataProvider {
  getSnapshot: () => WorldSessionSnapshot;
  subscribe: (listener: SessionListener) => () => void;
  openText: (text: string) => void;
  openFile: (file: File) => Promise<void>;
  applyOverrides: (document: WorldOverrideDocument | undefined) => void;
  resetFixture: () => void;
}

export function createWorldDataProvider(fixture: WorldData): WorldDataProvider {
  let revision = 0;
  let snapshot: WorldSessionSnapshot = { mode: "fixture", revision, world: fixture };
  let basePrivateWorld: WorldData | null = null;
  const listeners = new Set<SessionListener>();

  const publish = (next: WorldSessionSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener(snapshot));
  };

  const openText = (text: string) => {
    revision += 1;
    const parsed = parseWorldPackage(text);
    if (parsed.ok) {
      basePrivateWorld = structuredClone(parsed.world) as WorldData;
      publish({ mode: "private", revision, world: parsed.world });
    } else {
      basePrivateWorld = null;
      publish({ mode: "private-error", revision, errorCode: parsed.errorCode });
    }
  };

  const publishFileReadFailure = () => {
    revision += 1;
    basePrivateWorld = null;
    publish({ mode: "private-error", revision, errorCode: "WORLD_PACKAGE_FILE_READ_FAILED" });
  };

  const applyOverrides = (doc: WorldOverrideDocument | undefined) => {
    if (snapshot.mode === "private-error") return;
    const base = snapshot.mode === "private" && basePrivateWorld ? basePrivateWorld : fixture;
    revision += 1;
    if (!doc || doc.overrides.length === 0) {
      publish({ mode: snapshot.mode, revision, world: structuredClone(base) as WorldData });
      return;
    }
    const res = applyWorldOverrides(base, doc);
    publish({ mode: snapshot.mode, revision, world: res.world, overrides: doc });
  };

  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    openText,
    async openFile(file) {
      try {
        openText(await readLocalFile(file));
      } catch {
        publishFileReadFailure();
      }
    },
    applyOverrides,
    resetFixture() {
      revision += 1;
      basePrivateWorld = null;
      publish({ mode: "fixture", revision, world: fixture });
    },
  };
}

export const worldDataProvider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
