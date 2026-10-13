import { applyWorldOverrides } from "./overrides";
import { WORLD_SCHEMA_VERSION, type WorldData, type WorldPackage } from "./schema";
import { validateWorld } from "./validate";

export type WorldPackageParseResult =
  { ok: true; world: WorldData; package: WorldPackage } | { ok: false; errorCode: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasManifestShape(value: unknown) {
  return (
    isRecord(value) &&
    Array.isArray(value["chunks"]) &&
    isRecord(value["assetHashes"]) &&
    Array.isArray(value["licences"])
  );
}

function hasCoreWorldCollections(value: unknown) {
  return (
    isRecord(value) &&
    hasManifestShape(value["manifest"]) &&
    Array.isArray(value["roads"]) &&
    Array.isArray(value["buildings"]) &&
    Array.isArray(value["lots"])
  );
}

export function parseWorldPackage(text: string): WorldPackageParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, errorCode: "WORLD_PACKAGE_JSON_INVALID" };
  }
  if (
    !isRecord(parsed) ||
    !hasManifestShape(parsed["manifest"]) ||
    !hasCoreWorldCollections(parsed["world"])
  ) {
    return { ok: false, errorCode: "WORLD_PACKAGE_SHAPE_INVALID" };
  }

  const candidate = parsed as unknown as WorldPackage;
  if (
    candidate.manifest.schemaVersion !== WORLD_SCHEMA_VERSION ||
    candidate.world.manifest?.schemaVersion !== WORLD_SCHEMA_VERSION
  ) {
    return { ok: false, errorCode: "WORLD_PACKAGE_SCHEMA_UNSUPPORTED" };
  }
  if (candidate.manifest.datasetRevision !== candidate.world.manifest.datasetRevision) {
    return { ok: false, errorCode: "WORLD_PACKAGE_MANIFEST_MISMATCH" };
  }

  try {
    const applied = applyWorldOverrides(candidate.world, candidate.overrides);
    if (applied.issues.length > 0)
      return { ok: false, errorCode: "WORLD_PACKAGE_OVERRIDE_INVALID" };
    const validation = validateWorld(applied.world);
    if (!validation.valid) return { ok: false, errorCode: "WORLD_PACKAGE_VALIDATION_FAILED" };

    return { ok: true, package: candidate, world: applied.world };
  } catch {
    return { ok: false, errorCode: "WORLD_PACKAGE_VALIDATION_FAILED" };
  }
}
