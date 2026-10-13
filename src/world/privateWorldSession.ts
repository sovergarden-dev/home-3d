import { SYNTHETIC_NEIGHBORHOOD } from "./fixtures/syntheticNeighborhood";
import { parseWorldPackage } from "./package";
import type { WorldData } from "./schema";

export type WorldSessionSnapshot =
  | { mode: "fixture"; revision: number; world: WorldData }
  | { mode: "private"; revision: number; world: WorldData }
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
  resetFixture: () => void;
}

export function createWorldDataProvider(fixture: WorldData): WorldDataProvider {
  let revision = 0;
  let snapshot: WorldSessionSnapshot = { mode: "fixture", revision, world: fixture };
  const listeners = new Set<SessionListener>();

  const publish = (next: WorldSessionSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener(snapshot));
  };

  const openText = (text: string) => {
    revision += 1;
    const parsed = parseWorldPackage(text);
    publish(
      parsed.ok
        ? { mode: "private", revision, world: parsed.world }
        : { mode: "private-error", revision, errorCode: parsed.errorCode },
    );
  };

  const publishFileReadFailure = () => {
    revision += 1;
    publish({ mode: "private-error", revision, errorCode: "WORLD_PACKAGE_FILE_READ_FAILED" });
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
    resetFixture() {
      revision += 1;
      publish({ mode: "fixture", revision, world: fixture });
    },
  };
}

export const worldDataProvider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
