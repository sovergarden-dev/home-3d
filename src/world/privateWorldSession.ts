import { SYNTHETIC_NEIGHBORHOOD } from "./fixtures/syntheticNeighborhood";
import { applyWorldOverrides } from "./overrides";
import { parseWorldPackage } from "./package";
import type { CenterConfirmation, WorldData, WorldOverrideDocument } from "./schema";
import { validateWorld } from "./validate";

export type WorldSessionSnapshot =
  | {
      mode: "fixture";
      revision: number;
      packageEpoch: number;
      world: WorldData;
      centerConfirmation?: undefined;
      overrides?: WorldOverrideDocument | undefined;
      lastError?: string | null;
    }
  | {
      mode: "private";
      revision: number;
      packageEpoch: number;
      world: WorldData;
      centerConfirmation?: CenterConfirmation | undefined;
      overrides?: WorldOverrideDocument | undefined;
      lastError?: string | null;
    }
  | {
      mode: "private-error";
      revision: number;
      packageEpoch: number;
      errorCode: string;
      centerConfirmation?: undefined;
    };

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
  applyOverrides: (document: WorldOverrideDocument | undefined) => boolean;
  resetFixture: () => void;
}

export function createWorldDataProvider(fixture: WorldData): WorldDataProvider {
  let revision = 0;
  let packageEpoch = 0;
  let snapshot: WorldSessionSnapshot = { mode: "fixture", revision, packageEpoch, world: fixture };
  let basePrivateWorld: WorldData | null = null;
  const listeners = new Set<SessionListener>();

  const publish = (next: WorldSessionSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener(snapshot));
  };

  const openText = (text: string) => {
    revision += 1;
    packageEpoch += 1;
    const parsed = parseWorldPackage(text);
    if (parsed.ok) {
      basePrivateWorld = structuredClone(parsed.package.world) as WorldData;
      publish({
        mode: "private",
        revision,
        packageEpoch,
        world: parsed.world,
        centerConfirmation: parsed.package.centerConfirmation,
        overrides: parsed.package.overrides,
      });
    } else {
      basePrivateWorld = null;
      publish({ mode: "private-error", revision, packageEpoch, errorCode: parsed.errorCode });
    }
  };

  const publishFileReadFailure = () => {
    revision += 1;
    packageEpoch += 1;
    basePrivateWorld = null;
    publish({
      mode: "private-error",
      revision,
      packageEpoch,
      errorCode: "WORLD_PACKAGE_FILE_READ_FAILED",
    });
  };

  const applyOverrides = (doc: WorldOverrideDocument | undefined) => {
    if (snapshot.mode === "private-error") return false;
    const mode = snapshot.mode;
    const base = mode === "private" && basePrivateWorld ? basePrivateWorld : fixture;
    if (!doc || doc.overrides.length === 0) {
      revision += 1;
      if (mode === "private") {
        publish({
          mode,
          revision,
          packageEpoch,
          world: structuredClone(base) as WorldData,
          centerConfirmation: snapshot.centerConfirmation,
          lastError: null,
        });
      } else {
        publish({
          mode,
          revision,
          packageEpoch,
          world: structuredClone(base) as WorldData,
          lastError: null,
        });
      }
      return true;
    }
    const res = applyWorldOverrides(base, doc);
    if (res.issues.length > 0) {
      // Keep the last valid world visible; surface the failing code instead of
      // publishing a broken mutation or silently dropping the edit.
      publish({ ...snapshot, lastError: res.issues[0] ?? "OVERRIDE_APPLICATION_FAILED" });
      return false;
    }
    const validation = validateWorld(res.world);
    if (!validation.valid) {
      publish({
        ...snapshot,
        lastError: validation.issues[0]?.code ?? "MUTATION_VALIDATION_FAILED",
      });
      return false;
    }
    revision += 1;
    if (mode === "private") {
      publish({
        mode,
        revision,
        packageEpoch,
        world: res.world,
        centerConfirmation: snapshot.centerConfirmation,
        overrides: doc,
        lastError: null,
      });
    } else {
      publish({ mode, revision, packageEpoch, world: res.world, overrides: doc, lastError: null });
    }
    return true;
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
      packageEpoch += 1;
      basePrivateWorld = null;
      publish({ mode: "fixture", revision, packageEpoch, world: fixture });
    },
  };
}

export const worldDataProvider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
