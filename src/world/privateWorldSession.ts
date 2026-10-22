import { SYNTHETIC_NEIGHBORHOOD } from "./fixtures/syntheticNeighborhood";
import { applyWorldOverrides } from "./overrides";
import { MAX_WORLD_PACKAGE_BYTES, parseWorldPackage } from "./package";
import type { CenterConfirmation, WorldData, WorldOverrideDocument, WorldPackage } from "./schema";
import { validateWorld } from "./validate";
import {
  parsePackageGeoreference,
  sha256Text,
  type PackageGeoreference,
} from "./packageGeoreference";

export type WorldSessionSnapshot =
  | {
      mode: "fixture";
      revision: number;
      packageEpoch: number;
      temporaryLotIllustrationSelected: boolean;
      loading: boolean;
      dirty: false;
      world: WorldData;
      centerConfirmation?: undefined;
      overrides?: WorldOverrideDocument | undefined;
      lastError?: string | null;
      georeferenceReady?: boolean;
    }
  | {
      mode: "private";
      revision: number;
      packageEpoch: number;
      temporaryLotIllustrationSelected: boolean;
      loading: boolean;
      dirty: boolean;
      world: WorldData;
      centerConfirmation?: CenterConfirmation | undefined;
      overrides?: WorldOverrideDocument | undefined;
      lastError?: string | null;
      georeferenceReady?: boolean;
    }
  | {
      mode: "private-error";
      revision: number;
      packageEpoch: number;
      temporaryLotIllustrationSelected: boolean;
      loading: boolean;
      dirty: false;
      errorCode: string;
      centerConfirmation?: undefined;
      georeferenceReady?: boolean;
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
  openGeoreferenceText: (text: string) => Promise<boolean>;
  getGeoreference: () => { origin: PackageGeoreference["origin"] } | null;
  getPackageEpoch: () => number;
  openFile: (file: File) => Promise<void>;
  applyOverrides: (document: WorldOverrideDocument | undefined) => boolean;
  /** Returns the current base world plus current overrides, never an already-applied world twice. */
  exportWorkingPackage: () => WorldPackage | null;
  /** A UI acknowledgement after a successful download/save; does not mutate package data. */
  markExported: () => boolean;
  toggleTemporaryLotIllustration: () => void;
  resetFixture: () => void;
  getMemoryWorldKey: () => Promise<string | null>;
}

export function createWorldDataProvider(fixture: WorldData): WorldDataProvider {
  let revision = 0;
  let packageEpoch = 0;
  let requestId = 0;
  let georeferenceRequestId = 0;
  let packageText: string | null = null;
  let georeference: PackageGeoreference | null = null;
  let snapshot: WorldSessionSnapshot = {
    mode: "fixture",
    revision,
    packageEpoch,
    temporaryLotIllustrationSelected: false,
    loading: false,
    dirty: false,
    world: fixture,
  };
  let basePrivateWorld: WorldData | null = null;
  let workingPackage: WorldPackage | null = null;
  const documentSignature = (doc: WorldOverrideDocument | undefined) =>
    JSON.stringify(doc?.overrides.length ? doc : { schemaVersion: "1.0", overrides: [] });
  let exportedDocumentSignature = documentSignature(undefined);
  const listeners = new Set<SessionListener>();

  const publish = (next: WorldSessionSnapshot) => {
    snapshot = next;
    listeners.forEach((listener) => listener(snapshot));
  };

  const openText = (text: string) => {
    requestId += 1;
    georeferenceRequestId += 1;
    georeference = null;
    packageText = null;
    revision += 1;
    packageEpoch += 1;
    const parsed = parseWorldPackage(text);
    if (parsed.ok) {
      packageText = text;
      basePrivateWorld = structuredClone(parsed.package.world) as WorldData;
      workingPackage = structuredClone(parsed.package) as WorldPackage;
      exportedDocumentSignature = documentSignature(parsed.package.overrides);
      publish({
        mode: "private",
        revision,
        packageEpoch,
        temporaryLotIllustrationSelected: false,
        loading: false,
        dirty: false,
        world: parsed.world,
        centerConfirmation: parsed.package.centerConfirmation,
        overrides: parsed.package.overrides,
        lastError: null,
        georeferenceReady: false,
      });
    } else {
      basePrivateWorld = null;
      workingPackage = null;
      publish({
        mode: "private-error",
        revision,
        packageEpoch,
        temporaryLotIllustrationSelected: false,
        loading: false,
        dirty: false,
        errorCode: parsed.errorCode,
        georeferenceReady: false,
      });
    }
  };

  const publishFileFailure = (errorCode: string) => {
    revision += 1;
    packageEpoch += 1;
    basePrivateWorld = null;
    workingPackage = null;
    packageText = null;
    georeferenceRequestId += 1;
    georeference = null;
    publish({
      mode: "private-error",
      revision,
      packageEpoch,
      temporaryLotIllustrationSelected: false,
      loading: false,
      dirty: false,
      errorCode,
      georeferenceReady: false,
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
          temporaryLotIllustrationSelected: snapshot.temporaryLotIllustrationSelected,
          loading: false,
          dirty: documentSignature(undefined) !== exportedDocumentSignature,
          world: structuredClone(base) as WorldData,
          centerConfirmation: snapshot.centerConfirmation,
          overrides: undefined,
          lastError: null,
          georeferenceReady: georeference !== null,
        });
      } else {
        publish({
          mode,
          revision,
          packageEpoch,
          temporaryLotIllustrationSelected: snapshot.temporaryLotIllustrationSelected,
          loading: false,
          dirty: false,
          world: structuredClone(base) as WorldData,
          lastError: null,
        });
      }
      return true;
    }
    const res = applyWorldOverrides(base, doc);
    if (res.issues.length > 0) {
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
        temporaryLotIllustrationSelected: snapshot.temporaryLotIllustrationSelected,
        loading: false,
        dirty: documentSignature(doc) !== exportedDocumentSignature,
        world: res.world,
        centerConfirmation: snapshot.centerConfirmation,
        overrides: structuredClone(doc),
        lastError: null,
        georeferenceReady: georeference !== null,
      });
    } else {
      publish({
        mode,
        revision,
        packageEpoch,
        temporaryLotIllustrationSelected: snapshot.temporaryLotIllustrationSelected,
        loading: false,
        dirty: false,
        world: res.world,
        overrides: doc,
        lastError: null,
      });
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
      const currentRequest = ++requestId;
      georeferenceRequestId += 1;
      georeference = null;
      packageText = null;
      if (file.size > MAX_WORLD_PACKAGE_BYTES) {
        if (currentRequest !== requestId) return;
        publishFileFailure("WORLD_PACKAGE_TOO_LARGE");
        return;
      }
      publish({ ...snapshot, loading: true, georeferenceReady: false });
      try {
        const text = await readLocalFile(file);
        if (currentRequest !== requestId) return;
        if (!text.trim()) publishFileFailure("WORLD_PACKAGE_EMPTY");
        else if (new TextEncoder().encode(text).byteLength > MAX_WORLD_PACKAGE_BYTES)
          publishFileFailure("WORLD_PACKAGE_TOO_LARGE");
        else openText(text);
      } catch {
        if (currentRequest === requestId) publishFileFailure("WORLD_PACKAGE_FILE_READ_FAILED");
      }
    },
    async openGeoreferenceText(text) {
      const candidate = parsePackageGeoreference(text);
      const currentRequest = ++georeferenceRequestId;
      georeference = null;
      publish({ ...snapshot, georeferenceReady: false });
      if (!candidate || packageText === null || snapshot.mode !== "private") return false;
      const epoch = packageEpoch;
      const openedText = packageText;
      try {
        const hash = await sha256Text(openedText);
        if (
          currentRequest !== georeferenceRequestId ||
          epoch !== packageEpoch ||
          packageText !== openedText ||
          hash !== candidate.packageSha256
        )
          return false;
        georeference = candidate;
        publish({ ...snapshot, georeferenceReady: true });
        return true;
      } catch {
        return false;
      }
    },
    getGeoreference() {
      return georeference ? { origin: structuredClone(georeference.origin) } : null;
    },
    getPackageEpoch: () => packageEpoch,
    applyOverrides,
    exportWorkingPackage() {
      if (snapshot.mode !== "private" || !workingPackage || !basePrivateWorld) return null;
      return structuredClone({
        ...workingPackage,
        world: basePrivateWorld,
        overrides: snapshot.overrides,
        centerConfirmation: snapshot.centerConfirmation,
      }) as WorldPackage;
    },
    markExported() {
      if (snapshot.mode !== "private" || !snapshot.dirty) return false;
      exportedDocumentSignature = documentSignature(snapshot.overrides);
      publish({ ...snapshot, dirty: false });
      return true;
    },
    toggleTemporaryLotIllustration() {
      if (snapshot.mode !== "private") return;
      publish({
        ...snapshot,
        temporaryLotIllustrationSelected: !snapshot.temporaryLotIllustrationSelected,
      });
    },
    resetFixture() {
      requestId += 1;
      revision += 1;
      packageEpoch += 1;
      basePrivateWorld = null;
      workingPackage = null;
      packageText = null;
      georeferenceRequestId += 1;
      georeference = null;
      publish({
        mode: "fixture",
        revision,
        packageEpoch,
        temporaryLotIllustrationSelected: false,
        loading: false,
        dirty: false,
        world: fixture,
        georeferenceReady: false,
      });
    },
    async getMemoryWorldKey() {
      if (snapshot.loading || snapshot.mode === "private-error") return null;
      if (snapshot.mode === "fixture") return "synthetic-fixture-p10";
      if (!packageText || typeof globalThis.crypto?.subtle?.digest !== "function") return null;
      try {
        return await sha256Text(packageText);
      } catch {
        return null;
      }
    },
  };
}

export const worldDataProvider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);

export async function getMemoryWorldKey(): Promise<string | null> {
  return worldDataProvider.getMemoryWorldKey();
}
