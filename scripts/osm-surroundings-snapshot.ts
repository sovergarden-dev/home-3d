// One-time, offline OSM snapshot for the surroundings enrichment layer (PR-2).
//
//   bun scripts/osm-surroundings-snapshot.ts            # fetch and write the snapshot
//   bun scripts/osm-surroundings-snapshot.ts --dry-run  # fetch and print counts only
//
// Security rules (Aegis): the bbox is computed only from `origin` in
// src/world/data/homeNeighborhood.georef.json as a local ENU square; no coordinate, bbox or map
// link is accepted on the command line, printed, or written. Only allowlisted tags are kept, the
// raw Overpass response stays in memory, and runtime web code never calls Overpass.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { enuToGeodetic } from "../src/geo/enu";
import { DEFAULT_GENERATOR_PARAMS } from "../src/world/enrichment/defaults";
import {
  convertOverpassResponse,
  OSM_ENRICHMENT_NAMESPACE,
  OSM_TAG_ALLOWLIST,
  OVERPASS_QUERY_TEMPLATE,
  SNAPSHOT_HALF_SIZE_METRES,
  type OverpassResponse,
} from "../src/world/enrichment/osmSnapshot";
import {
  ENRICHMENT_SCHEMA_VERSION,
  G1_PACKAGE_SHA256,
  OSM_ATTRIBUTION,
  OSM_ODBL_LINE,
  type EnrichmentLayer,
} from "../src/world/enrichment/schema";

const ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
];
const MAX_OSM_BASE_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const USER_AGENT =
  "home-3d-osm-surroundings-snapshot/1.0 (+https://github.com/sovergarden-dev/home-3d)";

const args = new Set(process.argv.slice(2));
for (const arg of args)
  if (arg !== "--dry-run") throw new Error("SNAPSHOT_UNKNOWN_ARGUMENT (no coordinates accepted)");
const dryRun = args.has("--dry-run");

const dataDir = path.resolve(import.meta.dir, "../src/world/data");
const packageText = readFileSync(path.join(dataDir, "homeNeighborhood.json"), "utf8");
const g1 = createHash("sha256")
  .update(JSON.stringify(JSON.parse(packageText)))
  .digest("hex");
if (g1 !== G1_PACKAGE_SHA256) throw new Error("SNAPSHOT_G1_MISMATCH");
const georef = JSON.parse(readFileSync(path.join(dataDir, "homeNeighborhood.georef.json"), "utf8"));
if (georef.packageSha256 !== G1_PACKAGE_SHA256) throw new Error("SNAPSHOT_GEOREF_NOT_BOUND_TO_G1");
const origin = { latitude: georef.origin.latitude, longitude: georef.origin.longitude };
const canonicalBuildingIds: string[] = JSON.parse(packageText).world.buildings.map(
  (building: { localId: string }) => building.localId,
);

const h = SNAPSHOT_HALF_SIZE_METRES;
const sw = enuToGeodetic({ east: -h, north: -h, up: 0 }, origin);
const ne = enuToGeodetic({ east: h, north: h, up: 0 }, origin);
const bboxLiteral = [sw.latitude, sw.longitude, ne.latitude, ne.longitude]
  .map((value) => value.toFixed(7))
  .join(",");
const query = OVERPASS_QUERY_TEMPLATE.replace("{{bbox}}", bboxLiteral);
const querySha256 = createHash("sha256").update(query).digest("hex");

async function fetchOverpass(): Promise<{ endpoint: string; response: OverpassResponse }> {
  const failures: string[] = [];
  for (const endpoint of ENDPOINTS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/x-www-form-urlencoded",
            "user-agent": USER_AGENT,
            accept: "application/json",
          },
          body: new URLSearchParams({ data: query }).toString(),
          signal: AbortSignal.timeout(120_000),
        });
        if (!res.ok) {
          failures.push(`${new URL(endpoint).host}#${attempt}:HTTP_${res.status}`);
          if (res.status === 429 || res.status >= 500) await Bun.sleep(5000 * attempt);
          continue;
        }
        const response = (await res.json()) as OverpassResponse;
        if (!Array.isArray(response.elements)) throw new Error("SNAPSHOT_RESPONSE_INVALID");
        const base = Date.parse(response.osm3s?.timestamp_osm_base ?? "");
        if (!Number.isFinite(base) || Date.now() - base > MAX_OSM_BASE_AGE_MS) {
          // A lagging mirror would record a stale revision; try the next endpoint instead.
          failures.push(`${new URL(endpoint).host}#${attempt}:STALE_OSM_BASE`);
          break;
        }
        return { endpoint, response };
      } catch (error) {
        const code = error instanceof Error ? error.name : "ERROR";
        failures.push(`${new URL(endpoint).host}#${attempt}:${code}`);
      }
    }
  }
  throw new Error(`SNAPSHOT_ALL_ENDPOINTS_FAILED ${failures.join(" ")}`);
}

const fetchedAt = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
const { endpoint, response } = await fetchOverpass();
const osmBaseTimestamp = response.osm3s?.timestamp_osm_base ?? "unknown";
const conversion = convertOverpassResponse(response, origin, canonicalBuildingIds);

const layer: EnrichmentLayer = {
  schemaVersion: ENRICHMENT_SCHEMA_VERSION,
  layerRevision: `osm-surroundings-${osmBaseTimestamp.slice(0, 10)}`,
  basePackageSha256: G1_PACKAGE_SHA256,
  verificationStatus: "REAL_WORLD_NOT_VERIFIED",
  licence: "ODbL-1.0",
  attribution: [OSM_ATTRIBUTION],
  sources: [
    {
      namespace: OSM_ENRICHMENT_NAMESPACE,
      kind: "osm",
      revision: `overpass-osm-base-${osmBaseTimestamp}`,
      licence: "ODbL-1.0",
      observedAt: fetchedAt,
    },
  ],
  snapshot: {
    source: "OpenStreetMap via Overpass API",
    endpoint,
    fetchedAt,
    osmBaseTimestamp,
    queryTemplate: OVERPASS_QUERY_TEMPLATE,
    querySha256,
    bbox: {
      frame: "ENU_METRES_FROM_GEOREF_ORIGIN",
      originRef: "src/world/data/homeNeighborhood.georef.json#origin",
      halfSizeMetres: h,
    },
    tagAllowlist: [...OSM_TAG_ALLOWLIST],
    attribution: OSM_ODBL_LINE,
    generatedBy: "scripts/osm-surroundings-snapshot.ts",
  },
  buildingFacts: conversion.buildingFacts,
  pointFacts: conversion.pointFacts,
  generator: DEFAULT_GENERATOR_PARAMS,
};

console.log(
  JSON.stringify({ endpoint: new URL(endpoint).host, osmBaseTimestamp, ...conversion.stats }),
);
if (!dryRun) {
  const target = path.join(dataDir, "homeNeighborhood.enrichment.json");
  writeFileSync(target, `${JSON.stringify(layer, null, 2)}\n`);
  console.log("SNAPSHOT_WRITTEN src/world/data/homeNeighborhood.enrichment.json");
}
