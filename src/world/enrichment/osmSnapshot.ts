/**
 * Pure conversion of an Overpass API response into enrichment-layer facts. Used only by the
 * offline script `scripts/osm-surroundings-snapshot.ts` and by tests; runtime code never imports
 * it and never talks to the network.
 *
 * Privacy rule (Aegis condition 2): only tags in OSM_TAG_ALLOWLIST are ever read. Names,
 * addresses, contact details, operators, brands and free-text notes are dropped before any
 * mapping, and the raw response is never written to disk.
 */
import { geodeticToEnu, type GeodeticPoint } from "../../geo/enu";
import type { Position2 } from "../schema";
import type {
  BuildingFact,
  FactRoofType,
  PointFact,
  PointFactKind,
  TreeArchetype,
  ValueProvenance,
} from "./schema";

export const OSM_ENRICHMENT_NAMESPACE = "osm-300m-enrichment" as const;
export const SNAPSHOT_HALF_SIZE_METRES = 300;

export const OSM_TAG_ALLOWLIST = [
  "amenity",
  "building",
  "building:levels",
  "height",
  "highway",
  "leaf_type",
  "natural",
  "power",
  "roof:shape",
] as const;

/**
 * Overpass QL template. `{{bbox}}` is replaced in memory by south,west,north,east computed from
 * the georef origin; the expanded query is never logged or written.
 */
export const OVERPASS_QUERY_TEMPLATE = [
  "[out:json][timeout:90][bbox:{{bbox}}];",
  "(",
  '  node["natural"="tree"];',
  '  node["power"="pole"];',
  '  node["highway"="street_lamp"];',
  '  node["amenity"="bench"];',
  ");",
  "out body qt;",
  "(",
  '  way["building"]["building:levels"];',
  '  way["building"]["roof:shape"];',
  ");",
  "out tags qt;",
].join("\n");

export interface OverpassElement {
  type: string;
  id: number;
  lat?: number;
  lon?: number;
  tags?: Record<string, string>;
}

export interface OverpassResponse {
  osm3s?: { timestamp_osm_base?: string };
  elements: OverpassElement[];
}

export function filterAllowedTags(tags: Record<string, string> | undefined) {
  const allowed: Record<string, string> = {};
  if (!tags) return allowed;
  for (const key of OSM_TAG_ALLOWLIST) {
    const value = tags[key];
    if (typeof value === "string") allowed[key] = value;
  }
  return allowed;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

function pointKind(tags: Record<string, string>): PointFactKind | null {
  if (tags["natural"] === "tree") return "tree";
  if (tags["power"] === "pole") return "electric_pole";
  if (tags["highway"] === "street_lamp") return "street_light";
  if (tags["amenity"] === "bench") return "bench";
  return null;
}

const ID_PREFIX: Record<PointFactKind, string> = {
  tree: "tree",
  electric_pole: "pole",
  street_light: "light",
  bench: "bench",
};

function parseHeight(raw: string | undefined) {
  if (!raw) return undefined;
  const match = /^\s*(\d+(?:\.\d+)?)\s*(m)?\s*$/.exec(raw);
  if (!match) return undefined;
  const value = Number(match[1]);
  return Number.isFinite(value) && value > 0 && value <= 40 ? round2(value) : undefined;
}

function treeArchetype(tags: Record<string, string>): TreeArchetype | undefined {
  if (tags["leaf_type"] === "needleleaved") return "conifer";
  if (tags["leaf_type"] === "broadleaved") return "broadleaf";
  return undefined;
}

const ROOF_SHAPES: Record<string, FactRoofType> = {
  flat: "flat",
  gabled: "gabled",
  hipped: "hipped",
};

export function buildingWayId(localId: string) {
  const match = /-way-(\d+)-/.exec(localId);
  return match ? Number(match[1]) : null;
}

export interface SnapshotConversion {
  pointFacts: PointFact[];
  buildingFacts: BuildingFact[];
  stats: {
    elementsReceived: number;
    pointFactsByKind: Record<PointFactKind, number>;
    pointsOutsideBbox: number;
    buildingFacts: number;
    buildingWaysWithoutCanonicalMatch: number;
  };
}

/**
 * Converts allowlisted tags into facts. `origin` comes only from the georef companion and is used
 * in memory for the ENU conversion; it is not part of the output.
 */
export function convertOverpassResponse(
  response: OverpassResponse,
  origin: GeodeticPoint,
  canonicalBuildingIds: readonly string[],
  halfSizeMetres = SNAPSHOT_HALF_SIZE_METRES,
): SnapshotConversion {
  const provenance: ValueProvenance = {
    origin: "osm",
    sourceNamespace: OSM_ENRICHMENT_NAMESPACE,
    estimated: false,
  };
  const buildingByWay = new Map<number, string>();
  for (const id of canonicalBuildingIds) {
    const way = buildingWayId(id);
    if (way !== null) buildingByWay.set(way, id);
  }
  const pointFacts: PointFact[] = [];
  const buildingFacts: BuildingFact[] = [];
  const pointFactsByKind: Record<PointFactKind, number> = {
    tree: 0,
    electric_pole: 0,
    street_light: 0,
    bench: 0,
  };
  let pointsOutsideBbox = 0;
  let buildingWaysWithoutCanonicalMatch = 0;
  const seen = new Set<string>();

  for (const element of response.elements) {
    if (!Number.isSafeInteger(element.id) || element.id <= 0) continue;
    const tags = filterAllowedTags(element.tags);
    if (element.type === "node") {
      const kind = pointKind(tags);
      if (!kind || !Number.isFinite(element.lat) || !Number.isFinite(element.lon)) continue;
      const enu = geodeticToEnu({ latitude: element.lat!, longitude: element.lon! }, origin);
      const position: Position2 = [round2(enu.east), round2(-enu.north)];
      if (Math.abs(position[0]) > halfSizeMetres || Math.abs(position[1]) > halfSizeMetres) {
        pointsOutsideBbox += 1;
        continue;
      }
      const localId = `${ID_PREFIX[kind]}-osm-node-${element.id}`;
      if (seen.has(localId)) continue;
      seen.add(localId);
      const fact: PointFact = { localId, kind, position, provenance: { ...provenance } };
      const height = parseHeight(tags["height"]);
      if (height !== undefined) fact.height = { value: height, provenance: { ...provenance } };
      if (kind === "tree") {
        const archetype = treeArchetype(tags);
        if (archetype) fact.archetype = archetype;
      }
      pointFacts.push(fact);
      pointFactsByKind[kind] += 1;
    } else if (element.type === "way" && tags["building"]) {
      const buildingId = buildingByWay.get(element.id);
      if (!buildingId) {
        buildingWaysWithoutCanonicalMatch += 1;
        continue;
      }
      if (seen.has(buildingId)) continue;
      const fact: BuildingFact = { buildingId };
      const levelsRaw = tags["building:levels"];
      const levels = levelsRaw && /^\d{1,2}$/.test(levelsRaw.trim()) ? Number(levelsRaw) : NaN;
      if (Number.isInteger(levels) && levels >= 1 && levels <= 30)
        fact.levels = { value: levels, provenance: { ...provenance } };
      const roof = ROOF_SHAPES[tags["roof:shape"] ?? ""];
      if (roof) fact.roofType = { value: roof, provenance: { ...provenance } };
      if (!fact.levels && !fact.roofType) continue;
      seen.add(buildingId);
      buildingFacts.push(fact);
    }
  }
  pointFacts.sort((a, b) => a.localId.localeCompare(b.localId));
  buildingFacts.sort((a, b) => a.buildingId.localeCompare(b.buildingId));
  return {
    pointFacts,
    buildingFacts,
    stats: {
      elementsReceived: response.elements.length,
      pointFactsByKind,
      pointsOutsideBbox,
      buildingFacts: buildingFacts.length,
      buildingWaysWithoutCanonicalMatch,
    },
  };
}
