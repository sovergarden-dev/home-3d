/**
 * Hand-written validator for the enrichment layer (no new dependency, same approach as
 * world/validate.ts). Fails closed: any unknown key, forbidden key, foreign hash or out-of-range
 * value rejects the whole layer and the scene renders the canonical base only.
 */
import {
  ENRICHMENT_SCHEMA_VERSION,
  FORBIDDEN_KEY_PATTERN,
  OSM_ATTRIBUTION,
  type EnrichmentLayer,
} from "./schema";

export interface EnrichmentBase {
  sha256: string;
  buildingIds: ReadonlySet<string>;
  /** [minX, minZ, maxX, maxZ] in package ENU metres. */
  bounds: [number, number, number, number];
}

export type EnrichmentParseResult =
  { ok: true; layer: EnrichmentLayer } | { ok: false; errorCode: string };

type Json = Record<string, unknown>;

class LayerError extends Error {}
const fail = (code: string): never => {
  throw new LayerError(code);
};

const isObject = (value: unknown): value is Json =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function exactKeys(value: unknown, required: string[], optional: string[], code: string): Json {
  if (!isObject(value)) return fail(`${code}_NOT_OBJECT`);
  for (const key of required) if (!(key in value)) fail(`${code}_MISSING_${key}`);
  for (const key of Object.keys(value))
    if (!required.includes(key) && !optional.includes(key)) fail(`${code}_UNKNOWN_KEY`);
  return value;
}

function finite(value: unknown, min: number, max: number, code: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max)
    fail(code);
  return value as number;
}

function string(value: unknown, pattern: RegExp, code: string): string {
  if (typeof value !== "string" || !pattern.test(value)) fail(code);
  return value as string;
}

function scanForbidden(value: unknown) {
  if (typeof value === "string") {
    if (/google|street\s*view|maps\.app\.goo/i.test(value)) fail("LAYER_FORBIDDEN_SOURCE");
    return;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) fail("LAYER_NON_FINITE_NUMBER");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(scanForbidden);
    return;
  }
  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (FORBIDDEN_KEY_PATTERN.test(key)) fail("LAYER_FORBIDDEN_KEY");
      scanForbidden(child);
    }
  }
}

function provenance(value: unknown, namespaces: ReadonlySet<string>, sourcedOnly: boolean) {
  const p = exactKeys(value, ["origin", "estimated"], ["sourceNamespace"], "PROVENANCE");
  if (!["osm", "owner_observation", "estimated_procedural"].includes(p["origin"] as string))
    fail("PROVENANCE_UNKNOWN_ORIGIN");
  if (typeof p["estimated"] !== "boolean") fail("PROVENANCE_ESTIMATED_NOT_BOOLEAN");
  if (p["origin"] === "estimated_procedural") {
    if (sourcedOnly) fail("PROVENANCE_ESTIMATED_NOT_ALLOWED");
    if (p["estimated"] !== true) fail("PROVENANCE_ESTIMATED_FLAG_REQUIRED");
  } else {
    if (p["estimated"] !== false) fail("PROVENANCE_SOURCED_MARKED_ESTIMATED");
    if (!namespaces.has(p["sourceNamespace"] as string)) fail("PROVENANCE_UNKNOWN_NAMESPACE");
  }
}

export const ENRICHMENT_REQUIRED_KEYS = [
  "schemaVersion",
  "layerRevision",
  "basePackageSha256",
  "verificationStatus",
  "licence",
  "attribution",
  "sources",
  "snapshot",
  "buildingFacts",
  "pointFacts",
  "generator",
];

function validate(value: unknown, base: EnrichmentBase): EnrichmentLayer {
  scanForbidden(value);
  const layer = exactKeys(value, ENRICHMENT_REQUIRED_KEYS, [], "LAYER");
  if (layer["schemaVersion"] !== ENRICHMENT_SCHEMA_VERSION) fail("LAYER_SCHEMA_VERSION");
  string(layer["layerRevision"], /^[a-z0-9][a-z0-9.-]{2,63}$/, "LAYER_REVISION");
  if (layer["basePackageSha256"] !== base.sha256) fail("LAYER_BASE_HASH_MISMATCH");
  if (layer["verificationStatus"] !== "REAL_WORLD_NOT_VERIFIED") fail("LAYER_VERIFICATION_STATUS");
  if (layer["licence"] !== "ODbL-1.0") fail("LAYER_LICENCE");
  const attribution = layer["attribution"];
  if (!Array.isArray(attribution) || !attribution.includes(OSM_ATTRIBUTION))
    fail("LAYER_ATTRIBUTION_MISSING");

  const namespaces = new Set<string>();
  if (!Array.isArray(layer["sources"])) fail("LAYER_SOURCES");
  for (const raw of layer["sources"] as unknown[]) {
    const source = exactKeys(
      raw,
      ["namespace", "kind", "revision", "licence"],
      ["observedAt"],
      "SOURCE",
    );
    namespaces.add(string(source["namespace"], /^[a-z0-9][a-z0-9-]{2,63}$/, "SOURCE_NAMESPACE"));
    if (!["osm", "mapillary", "owner_observation"].includes(source["kind"] as string))
      fail("SOURCE_KIND");
    string(source["revision"], /^.{1,80}$/, "SOURCE_REVISION");
    if (source["licence"] !== "ODbL-1.0") fail("SOURCE_LICENCE");
  }

  const snapshot = exactKeys(
    layer["snapshot"],
    [
      "source",
      "endpoint",
      "fetchedAt",
      "osmBaseTimestamp",
      "queryTemplate",
      "querySha256",
      "bbox",
      "tagAllowlist",
      "attribution",
      "generatedBy",
    ],
    [],
    "SNAPSHOT",
  );
  string(snapshot["endpoint"], /^https:\/\/[a-z0-9.-]+\/[\w/.-]*$/, "SNAPSHOT_ENDPOINT");
  string(snapshot["querySha256"], /^[0-9a-f]{64}$/, "SNAPSHOT_QUERY_SHA");
  const template = string(snapshot["queryTemplate"], /\{\{bbox\}\}/, "SNAPSHOT_QUERY_TEMPLATE");
  // The template must carry a placeholder, never a literal bbox (Aegis condition 1).
  if (/\d+\.\d{4,}/.test(template)) fail("SNAPSHOT_QUERY_HAS_COORDINATES");
  if (!String(snapshot["attribution"]).includes(OSM_ATTRIBUTION)) fail("SNAPSHOT_ATTRIBUTION");
  exactKeys(snapshot["bbox"], ["frame", "originRef", "halfSizeMetres"], [], "SNAPSHOT_BBOX");

  const [minX, minZ, maxX, maxZ] = base.bounds;
  if (!Array.isArray(layer["pointFacts"])) fail("LAYER_POINT_FACTS");
  const ids = new Set<string>();
  for (const raw of layer["pointFacts"] as unknown[]) {
    const fact = exactKeys(
      raw,
      ["localId", "kind", "position", "provenance"],
      ["height", "archetype"],
      "POINT",
    );
    const id = string(fact["localId"], /^(tree|pole|light|bench)-[a-z0-9-]+$/, "POINT_ID");
    if (ids.has(id)) fail("POINT_DUPLICATE_ID");
    ids.add(id);
    if (!["tree", "electric_pole", "street_light", "bench"].includes(fact["kind"] as string))
      fail("POINT_KIND");
    const position = fact["position"];
    if (!Array.isArray(position) || position.length !== 2) fail("POINT_POSITION");
    const [x, z] = position as unknown[];
    finite(x, minX, maxX, "POINT_OUTSIDE_PACKAGE_BOUNDS");
    finite(z, minZ, maxZ, "POINT_OUTSIDE_PACKAGE_BOUNDS");
    provenance(fact["provenance"], namespaces, true);
    if (fact["height"] !== undefined) {
      const height = exactKeys(fact["height"], ["value", "provenance"], [], "POINT_HEIGHT");
      finite(height["value"], 0.01, 40, "POINT_HEIGHT_RANGE");
      provenance(height["provenance"], namespaces, false);
    }
    if (
      fact["archetype"] !== undefined &&
      !["broadleaf", "round", "conifer", "palm", "flowering"].includes(fact["archetype"] as string)
    )
      fail("POINT_ARCHETYPE");
  }

  if (!Array.isArray(layer["buildingFacts"])) fail("LAYER_BUILDING_FACTS");
  for (const raw of layer["buildingFacts"] as unknown[]) {
    const fact = exactKeys(raw, ["buildingId"], ["levels", "roofType"], "BUILDING_FACT");
    if (!base.buildingIds.has(fact["buildingId"] as string)) fail("BUILDING_FACT_UNKNOWN_BUILDING");
    if (fact["levels"] !== undefined) {
      const levels = exactKeys(fact["levels"], ["value", "provenance"], [], "BUILDING_LEVELS");
      if (!Number.isInteger(levels["value"])) fail("BUILDING_LEVELS_NOT_INTEGER");
      finite(levels["value"], 1, 30, "BUILDING_LEVELS_RANGE");
      provenance(levels["provenance"], namespaces, false);
    }
    if (fact["roofType"] !== undefined) {
      const roof = exactKeys(fact["roofType"], ["value", "provenance"], [], "BUILDING_ROOF");
      if (
        !["flat", "terrace_tum", "gabled", "hipped", "corrugated"].includes(roof["value"] as string)
      )
        fail("BUILDING_ROOF_VALUE");
      provenance(roof["provenance"], namespaces, false);
    }
  }

  const generator = exactKeys(
    layer["generator"],
    [
      "seed",
      "homeExclusionRadius",
      "homeDominanceRadius",
      "homeMaxNeighbourLevels",
      "density",
      "streetTreeSpacing",
      "poleSpacing",
      "vendorCartsPer100m",
      "parkedMotorbikesPer100m",
      "massing",
    ],
    ["life"],
    "GENERATOR",
  );
  if (!Number.isInteger(generator["seed"])) fail("GENERATOR_SEED");
  finite(generator["seed"], 0, 4294967295, "GENERATOR_SEED");
  finite(generator["homeExclusionRadius"], 0, 100, "GENERATOR_HOME_EXCLUSION");
  finite(generator["homeDominanceRadius"], 0, 200, "GENERATOR_HOME_DOMINANCE");
  finite(generator["homeMaxNeighbourLevels"], 1, 10, "GENERATOR_HOME_LEVELS");
  const density = exactKeys(
    generator["density"],
    ["denseRadius", "midRadius", "midFactor", "farFactor"],
    [],
    "GENERATOR_DENSITY",
  );
  const dense = finite(density["denseRadius"], 10, 1000, "GENERATOR_DENSITY_RADIUS");
  finite(density["midRadius"], dense, 2000, "GENERATOR_DENSITY_RADIUS");
  finite(density["midFactor"], 0, 1, "GENERATOR_DENSITY_FACTOR");
  finite(density["farFactor"], 0, density["midFactor"] as number, "GENERATOR_DENSITY_FACTOR");
  const spacing = generator["streetTreeSpacing"];
  if (!isObject(spacing)) fail("GENERATOR_TREE_SPACING");
  for (const [key, value] of Object.entries(spacing as Json)) {
    if (!["primary", "secondary", "residential", "alley", "service", "unknown"].includes(key))
      fail("GENERATOR_TREE_SPACING_CLASS");
    if (value !== 0) finite(value, 5, 200, "GENERATOR_TREE_SPACING_RANGE");
  }
  finite(generator["poleSpacing"], 5, 200, "GENERATOR_POLE_SPACING");
  finite(generator["vendorCartsPer100m"], 0, 10, "GENERATOR_CARTS");
  finite(generator["parkedMotorbikesPer100m"], 0, 40, "GENERATOR_MOTORBIKES");
  if (!isObject(generator["massing"])) fail("GENERATOR_MASSING");
  if (generator["life"] !== undefined && !isObject(generator["life"])) fail("GENERATOR_LIFE");
  return value as EnrichmentLayer;
}

export function parseEnrichmentLayer(value: unknown, base: EnrichmentBase): EnrichmentParseResult {
  try {
    return { ok: true, layer: validate(value, base) };
  } catch (error) {
    if (error instanceof LayerError) return { ok: false, errorCode: error.message };
    throw error;
  }
}
