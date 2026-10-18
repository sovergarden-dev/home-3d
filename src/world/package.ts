import { applyWorldOverrides, isProvenance } from "./overrides";
import { WORLD_SCHEMA_VERSION, type WorldData, type WorldPackage } from "./schema";
import { validateWorld } from "./validate";

/** Generous browser-side guard; packages are intentionally local-only. */
export const MAX_WORLD_PACKAGE_BYTES = 100 * 1024 * 1024;

export type WorldPackageParseResult =
  { ok: true; world: WorldData; package: WorldPackage } | { ok: false; errorCode: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasManifestShape(value: unknown) {
  if (!isRecord(value)) return false;
  const coverage = value["coverage"];
  return (
    typeof value["schemaVersion"] === "string" &&
    typeof value["datasetRevision"] === "string" &&
    value["datasetRevision"].trim().length > 0 &&
    value["units"] === "metres" &&
    value["frameConvention"] === "ENU_X_EAST_Y_UP_NEG_Z_NORTH" &&
    typeof value["isSynthetic"] === "boolean" &&
    Array.isArray(value["chunks"]) &&
    value["chunks"].every(
      (chunk) =>
        isRecord(chunk) &&
        typeof chunk["localId"] === "string" &&
        Array.isArray(chunk["bounds"]) &&
        chunk["bounds"].length === 4 &&
        chunk["bounds"].every((bound) => typeof bound === "number" && Number.isFinite(bound)) &&
        typeof chunk["tier"] === "string" &&
        ["core", "context", "periphery"].includes(chunk["tier"]),
    ) &&
    isRecord(value["assetHashes"]) &&
    Object.values(value["assetHashes"]).every((hash) => typeof hash === "string") &&
    Array.isArray(value["licences"]) &&
    value["licences"].every((licence) => typeof licence === "string") &&
    isRecord(coverage) &&
    typeof coverage["quality"] === "string" &&
    ["synthetic", "verified", "source_only", "inferred", "unknown", "conflict"].includes(
      coverage["quality"],
    ) &&
    typeof coverage["sourceCount"] === "number" &&
    Number.isSafeInteger(coverage["sourceCount"]) &&
    coverage["sourceCount"] >= 0
  );
}
function isCenterConfirmation(value: unknown) {
  if (!isRecord(value)) return false;
  const provenance = value["provenance"];
  if (!isRecord(provenance)) return false;
  return (
    (value["status"] === "confirmed" || value["status"] === "provisionally-accepted") &&
    Object.keys(value).length === 2 &&
    provenance["source"] === "owner" &&
    provenance["method"] === "explicit-user-confirmation" &&
    Object.keys(provenance).length === 2
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

function hasFeatureProvenance(value: unknown, allowParts = true): boolean {
  if (!isRecord(value) || !isProvenance(value["provenance"])) return false;
  const attributes = value["attributes"];
  if (
    attributes !== undefined &&
    (!isRecord(attributes) || !Object.values(attributes).every(isProvenance))
  )
    return false;
  const parts = value["parts"];
  if (
    parts !== undefined &&
    (!allowParts ||
      !Array.isArray(parts) ||
      !parts.every((part) => hasFeatureProvenance(part, false)))
  )
    return false;
  return ["frontageCandidates", "frontage"].every(
    (field) =>
      value[field] === undefined ||
      (Array.isArray(value[field]) &&
        value[field].every((entry) => isRecord(entry) && isProvenance(entry["provenance"]))),
  );
}

function hasWorldProvenance(value: WorldData) {
  return [value.buildings, value.roads, value.lots, value.trees ?? [], value.props ?? []].every(
    (collection) =>
      Array.isArray(collection) && collection.every((feature) => hasFeatureProvenance(feature)),
  );
}

export function parseWorldPackage(text: string): WorldPackageParseResult {
  if (!text.trim()) return { ok: false, errorCode: "WORLD_PACKAGE_EMPTY" };
  if (new TextEncoder().encode(text).byteLength > MAX_WORLD_PACKAGE_BYTES)
    return { ok: false, errorCode: "WORLD_PACKAGE_TOO_LARGE" };
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
  if (!hasWorldProvenance(candidate.world))
    return { ok: false, errorCode: "WORLD_PACKAGE_PROVENANCE_INVALID" };
  if (
    candidate.centerConfirmation !== undefined &&
    !isCenterConfirmation(candidate.centerConfirmation)
  )
    return { ok: false, errorCode: "WORLD_PACKAGE_CENTER_CONFIRMATION_INVALID" };
  if (
    candidate.manifest.schemaVersion !== WORLD_SCHEMA_VERSION ||
    candidate.world.manifest?.schemaVersion !== WORLD_SCHEMA_VERSION
  ) {
    return { ok: false, errorCode: "WORLD_PACKAGE_SCHEMA_UNSUPPORTED" };
  }
  if (
    candidate.manifest.datasetRevision !== candidate.world.manifest.datasetRevision ||
    candidate.manifest.isSynthetic !== candidate.world.manifest.isSynthetic
  ) {
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
