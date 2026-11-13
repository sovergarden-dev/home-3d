/**
 * Surroundings enrichment layer (ADR "Surroundings enrichment layer", PR-2 scope).
 *
 * The layer is a separate ODbL companion of the canonical package. It is bound to the package by
 * G1 and holds only sourced OSM facts plus generator parameters, never generated positions.
 * Positions are local ENU metres in the package frame ([east, -north]); there are no lat/lon,
 * names, addresses or contact fields anywhere in the layer.
 */
import type { Position2, RoadClass } from "../schema";

export const ENRICHMENT_SCHEMA_VERSION = "1.0" as const;

/** G1: sha256(JSON.stringify(JSON.parse(homeNeighborhood.json))). */
export const G1_PACKAGE_SHA256 =
  "cd4f0146fd3399d0995111bd19a46751c86e0347a56d3e2a770a4832852a7ce3" as const;

export const OSM_ATTRIBUTION = "© OpenStreetMap contributors" as const;
export const OSM_ODBL_LINE =
  "© OpenStreetMap contributors. Data available under the Open Database License (ODbL 1.0), https://www.openstreetmap.org/copyright" as const;

/** Where a value came from. There is deliberately no google/streetview member. */
export type EnrichmentOrigin = "osm" | "owner_observation" | "estimated_procedural";
export type EnrichmentSourceKind = "osm" | "mapillary" | "owner_observation";

export interface EnrichmentSource {
  namespace: string;
  kind: EnrichmentSourceKind;
  revision: string;
  licence: "ODbL-1.0";
  observedAt?: string;
}

export interface ValueProvenance {
  origin: EnrichmentOrigin;
  sourceNamespace?: string;
  estimated: boolean;
}

export type TreeArchetype = "broadleaf" | "round" | "conifer" | "palm" | "flowering";
export type PointFactKind = "tree" | "electric_pole" | "street_light" | "bench";
export type FactRoofType = "flat" | "terrace_tum" | "gabled" | "hipped" | "corrugated";

/** Sourced fact about an existing canonical building, keyed by its localId (no geometry). */
export interface BuildingFact {
  buildingId: string;
  levels?: { value: number; provenance: ValueProvenance };
  roofType?: { value: FactRoofType; provenance: ValueProvenance };
}

/** Sourced OSM point feature in local ENU metres. */
export interface PointFact {
  localId: string;
  kind: PointFactKind;
  position: Position2;
  height?: { value: number; provenance: ValueProvenance };
  archetype?: TreeArchetype;
  provenance: ValueProvenance;
}

/**
 * How the snapshot was taken. The exact Overpass query is stored as a template: the bbox literal
 * is replaced by `{{bbox}}` so no geographic coordinate is ever written to the repository. The
 * bbox is defined in local ENU metres around the georef origin and `querySha256` pins the exact
 * request body that was sent.
 */
export interface SnapshotHeader {
  source: "OpenStreetMap via Overpass API";
  endpoint: string;
  /** UTC time the snapshot run started (before any endpoint retries). */
  fetchedAt: string;
  /** OSM data revision (`osm3s.timestamp_osm_base`) reported by the endpoint that answered. */
  osmBaseTimestamp: string;
  queryTemplate: string;
  querySha256: string;
  bbox: {
    frame: "ENU_METRES_FROM_GEOREF_ORIGIN";
    originRef: "src/world/data/homeNeighborhood.georef.json#origin";
    halfSizeMetres: number;
  };
  tagAllowlist: string[];
  attribution: typeof OSM_ODBL_LINE;
  generatedBy: "scripts/osm-surroundings-snapshot.ts";
}

export type SpacedRoadClass = RoadClass;

export interface DensityParams {
  /** Full density inside this radius from the home centre (m). */
  denseRadius: number;
  /** Between denseRadius and midRadius candidates are kept with probability midFactor. */
  midRadius: number;
  midFactor: number;
  /** Beyond midRadius candidates are kept with probability farFactor. */
  farFactor: number;
}

export interface GeneratorParams {
  seed: number;
  homeExclusionRadius: number;
  homeDominanceRadius: number;
  homeMaxNeighbourLevels: number;
  density: DensityParams;
  streetTreeSpacing: Partial<Record<SpacedRoadClass, number>>;
  poleSpacing: number;
  vendorCartsPer100m: number;
  parkedMotorbikesPer100m: number;
  /** Reserved for the estimated-massing PR (PR-3); not read by PR-2. */
  massing: {
    levelsWeights: [number, number, number, number];
    roofWeights: Partial<Record<"corrugated" | "flat" | "terrace_tum", number>>;
    balconyProbability: number;
    shopProbabilityOnPrimary: number;
    floorHeight: number;
  };
  /** Reserved for the life-density PR (PR-4); not read by PR-2. */
  life?: { motorbikeToCarRatio: number; pedestriansPer100m: number };
}

export interface EnrichmentLayer {
  schemaVersion: typeof ENRICHMENT_SCHEMA_VERSION;
  layerRevision: string;
  basePackageSha256: typeof G1_PACKAGE_SHA256;
  verificationStatus: "REAL_WORLD_NOT_VERIFIED";
  licence: "ODbL-1.0";
  attribution: string[];
  sources: EnrichmentSource[];
  snapshot: SnapshotHeader;
  buildingFacts: BuildingFact[];
  pointFacts: PointFact[];
  generator: GeneratorParams;
}

/** Keys that must never appear anywhere in the committed layer (checked by tests). */
export const FORBIDDEN_KEY_PATTERN =
  /^(name|name:.*|.*_name|addr:.*|address|phone|fax|mobile|contact:.*|website|url|email|e-mail|operator.*|brand.*|ref|opening_hours|note|fixme|description|lat|lon|lng|latitude|longitude|exif|gps.*|image|wikidata|wikipedia)$/i;

export type DetailTier = "low" | "mid" | "high";

/** Per-tier caps (ADR §5.6 initial values; Pulse tunes after baseline). */
export const SURROUNDINGS_TIER_CAPS: Record<DetailTier, { trees: number; props: number }> = {
  low: { trees: 150, props: 80 },
  mid: { trees: 400, props: 200 },
  high: { trees: 800, props: 400 },
};
