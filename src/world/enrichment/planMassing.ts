import {
  cloneSurfaceGeometry,
  pointInPolygon,
  polygonsOf,
  ringEdges,
  ringWithoutClosure,
  signedRingArea,
  surfaceCentroid,
  surfaceContains,
  surfaceIntersects,
  validateSurfaceGeometry,
} from "../geometry";
import type {
  Building,
  LinearRing,
  Lot,
  PolygonGeometry,
  Position2,
  SurfaceGeometry,
  WorldData,
} from "../schema";
import { assessWallHeight } from "../wallHeight";
import { hash01, surroundingsHomeCentre } from "./planSurroundings";
import type { EnrichmentLayer } from "./schema";

export type EstimatedRoofType = "corrugated" | "flat" | "terrace_tum";

export interface PlannedMassingItem {
  localId: string;
  sourceBuildingId: string;
  footprint: SurfaceGeometry;
  position: [number, number];
  levels: number;
  wallHeight: number;
  roofType: EstimatedRoofType;
  origin: "estimated_procedural";
}

export interface MassingPlan {
  seed: number;
  items: PlannedMassingItem[];
  skippedSourceBuildingIds: string[];
}

const ROOF_ORDER: readonly EstimatedRoofType[] = ["corrugated", "flat", "terrace_tum"];
const FOOTPRINT_INSET_CANDIDATES = [0.08, 0.04, 0.02, 0.005] as const;
const round2 = (value: number) => Math.round(value * 100) / 100;
const round4 = (value: number) => Math.round(value * 10000) / 10000;
const compareCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function offsetSimpleRing(ring: LinearRing, inwardOffset: number): LinearRing | null {
  const raw = ringWithoutClosure(ring);
  if (raw.length < 3) return null;
  const ccw = signedRingArea(raw) >= 0 ? raw : [...raw].reverse();
  const points: Position2[] = [];
  for (const point of ccw) {
    const prev = points.at(-1);
    if (!prev || Math.hypot(point[0] - prev[0], point[1] - prev[1]) > 1e-6) {
      points.push(point);
    }
  }
  if (
    points.length > 2 &&
    Math.hypot(points[0]![0] - points.at(-1)![0], points[0]![1] - points.at(-1)![1]) <= 1e-6
  ) {
    points.pop();
  }
  if (points.length < 3) return null;

  const normals: Position2[] = [];
  for (let index = 0; index < points.length; index++) {
    const a = points[index]!;
    const b = points[(index + 1) % points.length]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length <= 1e-6) return null;
    normals.push([-dz / length, dx / length]);
  }

  const shifted: Position2[] = [];
  for (let index = 0; index < points.length; index++) {
    const point = points[index]!;
    const prevNormal = normals[(index - 1 + normals.length) % normals.length]!;
    const nextNormal = normals[index]!;
    const sumX = prevNormal[0] + nextNormal[0];
    const sumZ = prevNormal[1] + nextNormal[1];
    const sumLen = Math.hypot(sumX, sumZ);
    if (sumLen <= 1e-6) return null;
    const miterX = sumX / sumLen;
    const miterZ = sumZ / sumLen;
    const cosHalf = miterX * nextNormal[0] + miterZ * nextNormal[1];
    const distance =
      Math.abs(cosHalf) > 0.2
        ? Math.max(
            -Math.abs(inwardOffset) * 4,
            Math.min(Math.abs(inwardOffset) * 4, inwardOffset / cosHalf),
          )
        : inwardOffset;
    shifted.push([round4(point[0] + miterX * distance), round4(point[1] + miterZ * distance)]);
  }
  if (signedRingArea(shifted) <= 1e-4) return null;
  return [...shifted, [shifted[0]![0], shifted[0]![1]]];
}

/**
 * Insets a building polygon slightly inside its OSM boundary so shared party walls neither touch
 * adjacent footprints nor z-fight coplanar neighbor walls in WebGL.
 */
function insetBuildingPolygon(polygon: PolygonGeometry): PolygonGeometry {
  const [outer, ...holes] = polygon.coordinates;
  if (!outer) return polygon;
  for (const inset of FOOTPRINT_INSET_CANDIDATES) {
    const nextOuter = offsetSimpleRing(outer, inset);
    if (!nextOuter) continue;
    const nextHoles: LinearRing[] = [];
    let holesValid = true;
    for (const hole of holes) {
      // Expand courtyard holes into the building wall so hole boundaries pull away from inner neighbors.
      const expandedHole = offsetSimpleRing(hole, -inset);
      if (!expandedHole) {
        holesValid = false;
        break;
      }
      nextHoles.push(expandedHole);
    }
    if (!holesValid) continue;
    const candidate: PolygonGeometry = {
      type: "Polygon",
      coordinates: [nextOuter, ...nextHoles],
    };
    if (
      validateSurfaceGeometry(candidate).length === 0 &&
      surfaceContains(polygon, candidate, 1e-3)
    ) {
      return candidate;
    }
  }
  return polygon;
}

function distanceToSegment(point: Position2, a: Position2, b: Position2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSq));
  return Math.hypot(point[0] - (a[0] + t * dx), point[1] - (a[1] + t * dz));
}

export function minDistanceToPolygon(point: Position2, polygon: PolygonGeometry): number {
  if (pointInPolygon(point, polygon)) return 0;
  let minDistance = Infinity;
  for (const ring of polygon.coordinates) {
    for (const [a, b] of ringEdges(ring)) {
      minDistance = Math.min(minDistance, distanceToSegment(point, a, b));
    }
  }
  return minDistance;
}

function touchesHomeSite(
  building: Building,
  homeCentre: Position2,
  homeExclusionRadius: number,
  homeLot: Lot | undefined,
): boolean {
  if (homeLot && surfaceIntersects(building.geometry, homeLot.geometry)) return true;
  if (homeExclusionRadius <= 0) return false;
  return polygonsOf(building.geometry).some(
    (polygon) => minDistanceToPolygon(homeCentre, polygon) < homeExclusionRadius,
  );
}

function pickLevels(weights: readonly [number, number, number, number], sample01: number): number {
  const total = weights[0] + weights[1] + weights[2] + weights[3];
  if (total <= 0) return 1;
  let remaining = sample01 * total;
  for (let index = 0; index < weights.length; index++) {
    remaining -= weights[index]!;
    if (remaining < 0) return index + 1;
  }
  return weights.length;
}

function pickRoofType(
  roofWeights: Partial<Record<EstimatedRoofType, number>>,
  sample01: number,
): EstimatedRoofType {
  let total = 0;
  for (const kind of ROOF_ORDER) total += Math.max(0, roofWeights[kind] ?? 0);
  if (total <= 0) return "flat";
  let remaining = sample01 * total;
  let fallback: EstimatedRoofType = "flat";
  for (const kind of ROOF_ORDER) {
    const weight = Math.max(0, roofWeights[kind] ?? 0);
    if (weight <= 0) continue;
    fallback = kind;
    remaining -= weight;
    if (remaining < 0) return kind;
  }
  return fallback;
}

export function planMassing(world: WorldData, layer: EnrichmentLayer): MassingPlan {
  const { generator } = layer;
  const { seed, homeExclusionRadius, homeDominanceRadius, homeMaxNeighbourLevels, massing } =
    generator;
  const homeCentre = surroundingsHomeCentre(world);
  const homeLot = world.lots.find((lot) => lot.confirmed && lot.status === "empty");
  const sourcedBuildingIds = new Set(
    layer.buildingFacts.filter((fact) => fact.levels !== undefined).map((fact) => fact.buildingId),
  );
  const maxDominanceLevels = Math.max(1, Math.min(4, Math.floor(homeMaxNeighbourLevels)));
  const buildings = [...world.buildings].sort((a, b) => compareCodeUnit(a.localId, b.localId));
  const skippedIds = new Set<string>();
  const items: PlannedMassingItem[] = [];

  for (const building of buildings) {
    if (building.hidden) continue;
    const hasKnownHeight =
      sourcedBuildingIds.has(building.localId) ||
      assessWallHeight(building, world.manifest.isSynthetic).status !== "unknown";
    if (hasKnownHeight || touchesHomeSite(building, homeCentre, homeExclusionRadius, homeLot)) {
      skippedIds.add(building.localId);
      continue;
    }

    const polygons = polygonsOf(cloneSurfaceGeometry(building.geometry));
    polygons.forEach((rawPolygon, index) => {
      const footprint = insetBuildingPolygon(rawPolygon);
      const localId =
        polygons.length === 1
          ? `massing-${building.localId}`
          : `massing-${building.localId}-${index}`;
      const key = `${seed}|${building.localId}|${index}`;
      const centroid = surfaceCentroid(footprint);
      const position: [number, number] = [round2(centroid[0]), round2(centroid[1])];
      const sampledLevels = pickLevels(massing.levelsWeights, hash01(`${key}|levels`));
      const distanceFromHome = Math.hypot(position[0] - homeCentre[0], position[1] - homeCentre[1]);
      const levels =
        distanceFromHome < homeDominanceRadius
          ? Math.min(sampledLevels, maxDominanceLevels)
          : sampledLevels;
      items.push({
        localId,
        sourceBuildingId: building.localId,
        footprint,
        position,
        levels,
        wallHeight: levels * massing.floorHeight,
        roofType: pickRoofType(massing.roofWeights, hash01(`${key}|roof`)),
        origin: "estimated_procedural",
      });
    });
  }

  items.sort((a, b) => compareCodeUnit(a.localId, b.localId));
  return {
    seed,
    items,
    skippedSourceBuildingIds: [...skippedIds].sort(compareCodeUnit),
  };
}
