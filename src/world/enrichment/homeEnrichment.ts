/**
 * Loads the committed surroundings layer for the fixed home world. Bound to the canonical package
 * by G1: a foreign or invalid layer fails closed (null) and the scene renders the base only.
 * Static import only — no network access at runtime.
 */
import enrichmentDocument from "../data/homeNeighborhood.enrichment.json";
import { HOME_GEOREFERENCE, HOME_NEIGHBORHOOD } from "../homeNeighborhood";
import type { WorldData } from "../schema";
import { parseEnrichmentLayer, type EnrichmentBase, type EnrichmentParseResult } from "./parse";
import { G1_PACKAGE_SHA256, type EnrichmentLayer } from "./schema";

/** Package extent plus a margin, in ENU metres. Facts outside it are rejected. */
export function enrichmentBounds(world: WorldData, margin = 50): EnrichmentBase["bounds"] {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  const visit = ([x, z]: [number, number]) => {
    minX = Math.min(minX, x);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxZ = Math.max(maxZ, z);
  };
  world.roads.forEach((road) => road.polylineENU.forEach(visit));
  world.buildings.forEach((building) => {
    const polygons =
      building.geometry.type === "Polygon"
        ? [building.geometry.coordinates]
        : building.geometry.coordinates;
    polygons.forEach((rings) => rings.forEach((ring) => ring.forEach(visit)));
  });
  return [minX - margin, minZ - margin, maxX + margin, maxZ + margin];
}

export function homeEnrichmentBase(): EnrichmentBase {
  return {
    // The georef companion is pinned to G1 (src/test/g1-pin.test.ts); both must agree.
    sha256: HOME_GEOREFERENCE.packageSha256 === G1_PACKAGE_SHA256 ? G1_PACKAGE_SHA256 : "unbound",
    buildingIds: new Set(HOME_NEIGHBORHOOD.buildings.map((building) => building.localId)),
    bounds: enrichmentBounds(HOME_NEIGHBORHOOD),
  };
}

export const HOME_ENRICHMENT_RESULT: EnrichmentParseResult = parseEnrichmentLayer(
  enrichmentDocument as unknown,
  homeEnrichmentBase(),
);

export const HOME_ENRICHMENT: EnrichmentLayer | null = HOME_ENRICHMENT_RESULT.ok
  ? HOME_ENRICHMENT_RESULT.layer
  : null;
