import {
  pointInPolygon,
  polygonsOf,
  ringEdges,
  ringWithoutClosure,
  segmentsIntersect,
} from "@/world/geometry";
import type { PolygonGeometry, Position2, RoadClass, RoadSegment, WorldData } from "@/world/schema";

type StreetSurfaceStyleClass =
  | "primary_asphalt"
  | "secondary_asphalt"
  | "residential_asphalt"
  | "service_pavement"
  | "alley_concrete"
  | "surveyed_concrete"
  | "surveyed_paving";

interface RoadSurfaceStyle {
  styleClass: StreetSurfaceStyleClass;
  color: string;
  roughness: number;
  metalness: number;
  polygonOffsetFactor: number;
  polygonOffsetUnits: number;
}

export type ProceduralStreetTrimKind = "inferred_sidewalk" | "curb" | "lane_marking" | "alley_trim";

export interface StreetTrimQuad {
  roadId: string;
  kind: ProceduralStreetTrimKind;
  y: number;
  aLeft: Position2;
  aRight: Position2;
  bLeft: Position2;
  bRight: Position2;
}

export interface ProceduralStreetTrimPlan {
  origin: "estimated_procedural";
  quads: StreetTrimQuad[];
  countsByKind: Record<ProceduralStreetTrimKind, number>;
  styledRoadCounts: Record<StreetSurfaceStyleClass, number>;
}

export const STREET_TRIM_MATERIALS: Record<ProceduralStreetTrimKind, { readonly color: string }> = {
  inferred_sidewalk: { color: "#b8ab96" },
  curb: { color: "#d8d0c1" },
  lane_marking: { color: "#e6dcc5" },
  alley_trim: { color: "#6e6b62" },
};

const ROAD_DOMINANCE_BY_CLASS: Record<RoadClass, number> = {
  primary: 6,
  secondary: 5,
  residential: 4,
  unknown: 3,
  service: 2,
  alley: 1,
};

const ROAD_SURFACE_ELEVATION_OFFSET_BY_CLASS: Record<RoadClass, number> = {
  alley: -0.012,
  service: -0.008,
  unknown: -0.004,
  residential: 0,
  secondary: 0.006,
  primary: 0.012,
};

const SIDEWALK_WIDTH_TIERS: Partial<Record<RoadClass, readonly number[]>> = {
  primary: [1.8, 1.1],
  secondary: [1.5, 0.95],
  residential: [1.2, 0.8],
};

const SPATIAL_CELL_METRES = 24;
const CURB_WIDTH_METRES = 0.18;
const ALLEY_TRIM_WIDTH_METRES = 0.14;
const STEP_TARGET_METRES = 3.0;
const MIN_SIDEWALK_RUN_METRES = 1.8;
const MIN_ALLEY_TRIM_RUN_METRES = 1.5;
const JUNCTION_NODE_RADIUS_METRES = 1.0;
const LANE_MARK_JUNCTION_CLEARANCE_METRES = 3.6;
const LANE_MARK_END_MARGIN_METRES = 2.4;
const SAME_ELEVATION_TOLERANCE_METRES = 0.5;

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const roundPoint = (point: Position2): Position2 => [round3(point[0]), round3(point[1])];

export function roadDominanceRank(road: RoadSegment): number {
  return ROAD_DOMINANCE_BY_CLASS[road.roadClass] ?? 1;
}

export function roadDisplayElevation(road: RoadSegment): number {
  const structuralLayer =
    road.structure === "tunnel"
      ? Math.min(road.elevationLayer, -1)
      : road.structure === "bridge"
        ? Math.max(road.elevationLayer, 1)
        : road.elevationLayer;
  return road.baseElevation ?? 0.02 + structuralLayer * 4.5;
}

export function roadSurfaceRenderElevation(road: RoadSegment): number {
  const base = roadDisplayElevation(road);
  if (road.baseElevation !== undefined) return base;
  return round3(base + (ROAD_SURFACE_ELEVATION_OFFSET_BY_CLASS[road.roadClass] ?? 0));
}

// Residential unknown/asphalt preserves #4c5551 (roughness 0.92, offset -1) required by weather/junction contracts.
export function resolveRoadSurfaceStyle(road: RoadSegment): RoadSurfaceStyle {
  if (road.surface === "concrete") {
    const isAlley = road.roadClass === "alley";
    return {
      styleClass: isAlley ? "alley_concrete" : "surveyed_concrete",
      color: "#8b887e",
      roughness: 0.92,
      metalness: 0,
      polygonOffsetFactor: isAlley ? -0.25 : -1,
      polygonOffsetUnits: isAlley ? -0.25 : -1,
    };
  }
  if (road.surface === "paving") {
    return {
      styleClass: "surveyed_paving",
      color: "#9c846c",
      roughness: 0.92,
      metalness: 0,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    };
  }
  if (road.surface === "asphalt") {
    if (road.roadClass === "primary") {
      return {
        styleClass: "primary_asphalt",
        color: "#3d4542",
        roughness: 0.92,
        metalness: 0,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      };
    }
    if (road.roadClass === "secondary") {
      return {
        styleClass: "secondary_asphalt",
        color: "#444d49",
        roughness: 0.92,
        metalness: 0,
        polygonOffsetFactor: -1.5,
        polygonOffsetUnits: -1.5,
      };
    }
    return {
      styleClass: "residential_asphalt",
      color: "#4c5551",
      roughness: 0.92,
      metalness: 0,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    };
  }

  switch (road.roadClass) {
    case "primary":
      return {
        styleClass: "primary_asphalt",
        color: "#3d4542",
        roughness: 0.92,
        metalness: 0,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      };
    case "secondary":
      return {
        styleClass: "secondary_asphalt",
        color: "#444d49",
        roughness: 0.92,
        metalness: 0,
        polygonOffsetFactor: -1.5,
        polygonOffsetUnits: -1.5,
      };
    case "residential":
    case "unknown":
      return {
        styleClass: "residential_asphalt",
        color: "#4c5551",
        roughness: 0.92,
        metalness: 0,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -1,
      };
    case "service":
      return {
        styleClass: "service_pavement",
        color: "#636862",
        roughness: 0.92,
        metalness: 0,
        polygonOffsetFactor: -0.5,
        polygonOffsetUnits: -0.5,
      };
    case "alley":
      return {
        styleClass: "alley_concrete",
        color: "#8b887e",
        roughness: 0.92,
        metalness: 0,
        polygonOffsetFactor: -0.25,
        polygonOffsetUnits: -0.25,
      };
  }
}

class SpatialGrid<T> {
  private readonly cells = new Map<string, T[]>();

  insert(minX: number, minZ: number, maxX: number, maxZ: number, item: T) {
    const startX = Math.floor(minX / SPATIAL_CELL_METRES);
    const endX = Math.floor(maxX / SPATIAL_CELL_METRES);
    const startZ = Math.floor(minZ / SPATIAL_CELL_METRES);
    const endZ = Math.floor(maxZ / SPATIAL_CELL_METRES);
    for (let x = startX; x <= endX; x += 1) {
      for (let z = startZ; z <= endZ; z += 1) {
        const key = `${x}:${z}`;
        const bucket = this.cells.get(key);
        if (bucket) bucket.push(item);
        else this.cells.set(key, [item]);
      }
    }
  }

  queryPoint(point: Position2): readonly T[] {
    return (
      this.cells.get(
        `${Math.floor(point[0] / SPATIAL_CELL_METRES)}:${Math.floor(point[1] / SPATIAL_CELL_METRES)}`,
      ) ?? []
    );
  }
}

interface BoundedEdge {
  a: Position2;
  b: Position2;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

interface IndexedBuilding {
  polygon: PolygonGeometry;
  edges: BoundedEdge[];
  probe: Position2 | undefined;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

interface IndexedSegment {
  roadId: string;
  structure: "surface" | "bridge" | "tunnel";
  halfWidth: number;
  y: number;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  a: Position2;
  b: Position2;
  ux: number;
  uz: number;
  length: number;
}

interface IndexedJunction {
  point: Position2;
  y: number;
}

function distanceSqToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  const rx = px - (ax + t * dx);
  const rz = pz - (az + t * dz);
  return rx * rx + rz * rz;
}

function closestPointOnSegment(
  point: Position2,
  a: Position2,
  b: Position2,
): { closest: Position2; distance: number; t: number } {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq === 0
      ? 0
      : Math.max(0, Math.min(1, ((point[0] - a[0]) * dx + (point[1] - a[1]) * dz) / lengthSq));
  const closest: Position2 = [a[0] + t * dx, a[1] + t * dz];
  return { closest, distance: Math.hypot(point[0] - closest[0], point[1] - closest[1]), t };
}

function isSmoothContinuation(
  a: Position2,
  b: Position2,
  ux: number,
  uz: number,
  halfWidth: number,
  other: IndexedSegment,
): boolean {
  if (other.halfWidth > halfWidth + 0.25) return false;
  const startSharedA = Math.hypot(a[0] - other.a[0], a[1] - other.a[1]) <= JUNCTION_NODE_TOLERANCE;
  const startSharedB = Math.hypot(a[0] - other.b[0], a[1] - other.b[1]) <= JUNCTION_NODE_TOLERANCE;
  if (startSharedA || startSharedB) {
    const outX = startSharedA ? other.ux : -other.ux;
    const outZ = startSharedA ? other.uz : -other.uz;
    if (ux * outX + uz * outZ < -0.7) return true;
  }
  const endSharedA = Math.hypot(b[0] - other.a[0], b[1] - other.a[1]) <= JUNCTION_NODE_TOLERANCE;
  const endSharedB = Math.hypot(b[0] - other.b[0], b[1] - other.b[1]) <= JUNCTION_NODE_TOLERANCE;
  if (endSharedA || endSharedB) {
    const outX = endSharedA ? other.ux : -other.ux;
    const outZ = endSharedA ? other.uz : -other.uz;
    if (-ux * outX + -uz * outZ < -0.7) return true;
  }
  return false;
}

const JUNCTION_NODE_TOLERANCE = 0.5;

function quadPoints(
  a: Position2,
  ux: number,
  uz: number,
  tStart: number,
  tEnd: number,
  leftOffset: number,
  rightOffset: number,
): { aLeft: Position2; aRight: Position2; bLeft: Position2; bRight: Position2 } {
  const nx = -uz;
  const nz = ux;
  const startX = a[0] + ux * tStart;
  const startZ = a[1] + uz * tStart;
  const endX = a[0] + ux * tEnd;
  const endZ = a[1] + uz * tEnd;
  return {
    aLeft: [startX + nx * leftOffset, startZ + nz * leftOffset],
    aRight: [startX + nx * rightOffset, startZ + nz * rightOffset],
    bLeft: [endX + nx * leftOffset, endZ + nz * leftOffset],
    bRight: [endX + nx * rightOffset, endZ + nz * rightOffset],
  };
}

function emptyStyledCounts(): Record<StreetSurfaceStyleClass, number> {
  return {
    primary_asphalt: 0,
    secondary_asphalt: 0,
    residential_asphalt: 0,
    service_pavement: 0,
    alley_concrete: 0,
    surveyed_concrete: 0,
    surveyed_paving: 0,
  };
}

const compareIds = (first: string, second: string) =>
  first < second ? -1 : first > second ? 1 : 0;

export function planProceduralStreetTrim(world: WorldData): ProceduralStreetTrimPlan {
  const styledRoadCounts = emptyStyledCounts();
  const countsByKind: Record<ProceduralStreetTrimKind, number> = {
    inferred_sidewalk: 0,
    curb: 0,
    lane_marking: 0,
    alley_trim: 0,
  };

  const sortedRoads = [...world.roads].sort((first, second) =>
    compareIds(first.localId, second.localId),
  );
  for (const road of sortedRoads) {
    if (road.polylineENU.length < 2 || !road.carriagewayWidth) continue;
    styledRoadCounts[resolveRoadSurfaceStyle(road).styleClass] += 1;
  }

  const buildingGrid = new SpatialGrid<IndexedBuilding>();
  const sortedBuildings = [...world.buildings].sort((first, second) =>
    compareIds(first.localId, second.localId),
  );
  for (const building of sortedBuildings) {
    if (building.hidden) continue;
    for (const polygon of polygonsOf(building.geometry)) {
      const outer = polygon.coordinates[0];
      if (!outer || outer.length === 0) continue;
      let minX = Infinity;
      let minZ = Infinity;
      let maxX = -Infinity;
      let maxZ = -Infinity;
      for (const [x, z] of outer) {
        if (x < minX) minX = x;
        if (z < minZ) minZ = z;
        if (x > maxX) maxX = x;
        if (z > maxZ) maxZ = z;
      }
      buildingGrid.insert(minX - 2.5, minZ - 2.5, maxX + 2.5, maxZ + 2.5, {
        polygon,
        edges: polygon.coordinates.flatMap(ringEdges).map(([e1, e2]) => ({
          a: e1,
          b: e2,
          minX: Math.min(e1[0], e2[0]),
          minZ: Math.min(e1[1], e2[1]),
          maxX: Math.max(e1[0], e2[0]),
          maxZ: Math.max(e1[1], e2[1]),
        })),
        probe: ringWithoutClosure(outer)[0],
        minX,
        minZ,
        maxX,
        maxZ,
      });
    }
  }

  const segmentGrid = new SpatialGrid<IndexedSegment>();
  const endpoints: Array<{
    roadId: string;
    point: Position2;
    outX: number;
    outZ: number;
    y: number;
  }> = [];

  for (const road of sortedRoads) {
    if (road.polylineENU.length < 2 || !road.carriagewayWidth || road.carriagewayWidth <= 0)
      continue;
    const structure = road.structure ?? "surface";
    const halfWidth = road.carriagewayWidth / 2;
    const y = roadDisplayElevation(road);
    const pts = road.polylineENU;
    for (let index = 0; index < pts.length - 1; index += 1) {
      const a = pts[index]!;
      const b = pts[index + 1]!;
      const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length <= 1e-6) continue;
      const ux = (b[0] - a[0]) / length;
      const uz = (b[1] - a[1]) / length;
      const pad = halfWidth + 4.5;
      const segMinX = Math.min(a[0], b[0]) - pad;
      const segMinZ = Math.min(a[1], b[1]) - pad;
      const segMaxX = Math.max(a[0], b[0]) + pad;
      const segMaxZ = Math.max(a[1], b[1]) + pad;
      segmentGrid.insert(segMinX, segMinZ, segMaxX, segMaxZ, {
        roadId: road.localId,
        structure,
        halfWidth,
        y,
        minX: segMinX,
        minZ: segMinZ,
        maxX: segMaxX,
        maxZ: segMaxZ,
        a,
        b,
        ux,
        uz,
        length,
      });
    }
    const first = pts[0]!;
    const second = pts[1]!;
    const startLen = Math.hypot(second[0] - first[0], second[1] - first[1]);
    if (startLen > 1e-6) {
      endpoints.push({
        roadId: road.localId,
        point: first,
        outX: (second[0] - first[0]) / startLen,
        outZ: (second[1] - first[1]) / startLen,
        y,
      });
    }
    const last = pts[pts.length - 1]!;
    const prev = pts[pts.length - 2]!;
    const endLen = Math.hypot(last[0] - prev[0], last[1] - prev[1]);
    if (endLen > 1e-6) {
      endpoints.push({
        roadId: road.localId,
        point: last,
        outX: (prev[0] - last[0]) / endLen,
        outZ: (prev[1] - last[1]) / endLen,
        y,
      });
    }
  }

  const junctionGrid = new SpatialGrid<IndexedJunction>();
  for (const endpoint of endpoints) {
    const shared = endpoints.filter(
      (other) =>
        Math.abs(other.y - endpoint.y) <= SAME_ELEVATION_TOLERANCE_METRES &&
        Math.hypot(other.point[0] - endpoint.point[0], other.point[1] - endpoint.point[1]) <=
          JUNCTION_NODE_RADIUS_METRES,
    );
    const sharpTurn =
      shared.length === 2 &&
      shared[0]!.outX * shared[1]!.outX + shared[0]!.outZ * shared[1]!.outZ > -0.75;
    const touchesInterior = segmentGrid.queryPoint(endpoint.point).some((seg) => {
      if (seg.roadId === endpoint.roadId) return false;
      if (Math.abs(seg.y - endpoint.y) > SAME_ELEVATION_TOLERANCE_METRES) return false;
      const hit = closestPointOnSegment(endpoint.point, seg.a, seg.b);
      return hit.distance <= JUNCTION_NODE_RADIUS_METRES && hit.t > 0.04 && hit.t < 0.96;
    });
    if (shared.length >= 3 || sharpTurn || touchesInterior) {
      const r = LANE_MARK_JUNCTION_CLEARANCE_METRES;
      junctionGrid.insert(
        endpoint.point[0] - r,
        endpoint.point[1] - r,
        endpoint.point[0] + r,
        endpoint.point[1] + r,
        { point: endpoint.point, y: endpoint.y },
      );
    }
  }

  const quads: StreetTrimQuad[] = [];
  const pushQuad = (
    roadId: string,
    kind: ProceduralStreetTrimKind,
    y: number,
    coords: { aLeft: Position2; aRight: Position2; bLeft: Position2; bRight: Position2 },
  ) => {
    quads.push({
      roadId,
      kind,
      y: round3(y),
      aLeft: roundPoint(coords.aLeft),
      aRight: roundPoint(coords.aRight),
      bLeft: roundPoint(coords.bLeft),
      bRight: roundPoint(coords.bRight),
    });
    countsByKind[kind] += 1;
  };

  for (const road of sortedRoads) {
    const width = road.carriagewayWidth ?? 0;
    if (road.polylineENU.length < 2 || width <= 0) continue;
    const structure = road.structure ?? "surface";
    const half = width / 2;
    const roadY = roadDisplayElevation(road);
    const roadRenderY = roadSurfaceRenderElevation(road);

    const sidewalkTiers =
      structure === "surface" && road.sidewalkWidths === undefined && width >= 5
        ? SIDEWALK_WIDTH_TIERS[road.roadClass]
        : undefined;
    if (sidewalkTiers) {
      for (let segIdx = 0; segIdx < road.polylineENU.length - 1; segIdx += 1) {
        const a = road.polylineENU[segIdx]!;
        const b = road.polylineENU[segIdx + 1]!;
        const segLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (segLength < MIN_SIDEWALK_RUN_METRES) continue;
        const ux = (b[0] - a[0]) / segLength;
        const uz = (b[1] - a[1]) / segLength;
        const stepCount = Math.max(1, Math.ceil(segLength / STEP_TARGET_METRES));
        const stepLen = segLength / stepCount;

        for (const side of [1, -1] as const) {
          const sideNx = -uz * side;
          const sideNz = ux * side;
          let runStart = 0;
          let runWidth = 0;

          const flushSidewalkRun = (runEnd: number) => {
            if (runWidth <= 0 || runEnd - runStart < MIN_SIDEWALK_RUN_METRES) return;
            const curbLeft = side === 1 ? half + CURB_WIDTH_METRES : -half;
            const curbRight = side === 1 ? half : -(half + CURB_WIDTH_METRES);
            const walkLeft = side === 1 ? half + runWidth : -(half + CURB_WIDTH_METRES);
            const walkRight = side === 1 ? half + CURB_WIDTH_METRES : -(half + runWidth);
            pushQuad(
              road.localId,
              "curb",
              roadRenderY + 0.022,
              quadPoints(a, ux, uz, runStart, runEnd, curbLeft, curbRight),
            );
            pushQuad(
              road.localId,
              "inferred_sidewalk",
              roadRenderY + 0.016,
              quadPoints(a, ux, uz, runStart, runEnd, walkLeft, walkRight),
            );
          };

          for (let step = 0; step < stepCount; step += 1) {
            const t0 = step * stepLen;
            const t1 = (step + 1) * stepLen;
            const tMid = (t0 + t1) / 2;
            const centerMid: Position2 = [a[0] + ux * tMid, a[1] + uz * tMid];
            let acceptedWidth = 0;

            for (const candidateWidth of sidewalkTiers) {
              const leftOff = side === 1 ? half + candidateWidth + 0.002 : -(half - 0.002);
              const rightOff = side === 1 ? half - 0.002 : -(half + candidateWidth + 0.002);
              const stepQuad = quadPoints(a, ux, uz, t0, t1, leftOff, rightOff);
              const q0 = stepQuad.aLeft;
              const q1 = stepQuad.bLeft;
              const q2 = stepQuad.bRight;
              const q3 = stepQuad.aRight;
              const quadMid: Position2 = [(q0[0] + q2[0]) * 0.5, (q0[1] + q2[1]) * 0.5];
              const minX = Math.min(q0[0], q1[0], q2[0], q3[0]);
              const maxX = Math.max(q0[0], q1[0], q2[0], q3[0]);
              const minZ = Math.min(q0[1], q1[1], q2[1], q3[1]);
              const maxZ = Math.max(q0[1], q1[1], q2[1], q3[1]);

              let hitsBuilding = false;
              for (const candidateBuilding of buildingGrid.queryPoint(quadMid)) {
                if (
                  maxX < candidateBuilding.minX ||
                  minX > candidateBuilding.maxX ||
                  maxZ < candidateBuilding.minZ ||
                  minZ > candidateBuilding.maxZ
                ) {
                  continue;
                }
                let edgeHit = false;
                for (const edge of candidateBuilding.edges) {
                  if (
                    maxX < edge.minX ||
                    minX > edge.maxX ||
                    maxZ < edge.minZ ||
                    minZ > edge.maxZ
                  ) {
                    continue;
                  }
                  if (
                    segmentsIntersect(q0, q1, edge.a, edge.b) ||
                    segmentsIntersect(q1, q2, edge.a, edge.b) ||
                    segmentsIntersect(q2, q3, edge.a, edge.b) ||
                    segmentsIntersect(q3, q0, edge.a, edge.b)
                  ) {
                    edgeHit = true;
                    break;
                  }
                }
                if (edgeHit) {
                  hitsBuilding = true;
                  break;
                }
                if (
                  q0[0] >= candidateBuilding.minX &&
                  q0[0] <= candidateBuilding.maxX &&
                  q0[1] >= candidateBuilding.minZ &&
                  q0[1] <= candidateBuilding.maxZ &&
                  pointInPolygon(q0, candidateBuilding.polygon)
                ) {
                  hitsBuilding = true;
                  break;
                }
                const probe = candidateBuilding.probe;
                if (
                  probe &&
                  probe[0] >= minX &&
                  probe[0] <= maxX &&
                  probe[1] >= minZ &&
                  probe[1] <= maxZ &&
                  pointInPolygon(probe, {
                    type: "Polygon",
                    coordinates: [[q0, q1, q2, q3, q0]],
                  })
                ) {
                  hitsBuilding = true;
                  break;
                }
              }
              if (hitsBuilding) continue;

              const s0 = Math.min(t1, t0 + 0.15);
              const s2 = Math.max(t0, t1 - 0.15);
              const o0 = half + 0.12;
              const o1 = half + candidateWidth * 0.55;
              const o2 = half + candidateWidth;
              let hitsRoad = false;

              for (const other of segmentGrid.queryPoint(quadMid)) {
                if (other.roadId === road.localId || other.structure !== "surface") continue;
                if (Math.abs(other.y - roadY) > SAME_ELEVATION_TOLERANCE_METRES) continue;
                if (
                  maxX + 2 < other.minX ||
                  minX - 2 > other.maxX ||
                  maxZ + 2 < other.minZ ||
                  minZ - 2 > other.maxZ
                ) {
                  continue;
                }
                const ax = other.a[0];
                const az = other.a[1];
                const bx = other.b[0];
                const bz = other.b[1];
                const maxInfluence = other.halfWidth + candidateWidth * 2 + 3.5;
                if (
                  distanceSqToSegment(quadMid[0], quadMid[1], ax, az, bx, bz) >
                  maxInfluence * maxInfluence
                ) {
                  continue;
                }
                const smooth = isSmoothContinuation(a, b, ux, uz, half, other);
                const clearance = smooth ? other.halfWidth - 0.04 : other.halfWidth + 0.15;
                const clearanceSq = clearance * clearance;

                if (!smooth && Math.abs(ux * other.ux + uz * other.uz) > 0.7) {
                  const midProj = closestPointOnSegment(centerMid, other.a, other.b);
                  const sideDot =
                    (midProj.closest[0] - centerMid[0]) * sideNx +
                    (midProj.closest[1] - centerMid[1]) * sideNz;
                  if (sideDot > 0.2) {
                    const medianGap = midProj.distance - half - other.halfWidth;
                    if (candidateWidth > medianGap * 0.5 - 0.04) {
                      hitsRoad = true;
                      break;
                    }
                  }
                }

                const checkAtT = (sampleT: number) => {
                  const baseX = a[0] + ux * sampleT;
                  const baseZ = a[1] + uz * sampleT;
                  return (
                    distanceSqToSegment(baseX + sideNx * o0, baseZ + sideNz * o0, ax, az, bx, bz) <
                      clearanceSq ||
                    distanceSqToSegment(baseX + sideNx * o1, baseZ + sideNz * o1, ax, az, bx, bz) <
                      clearanceSq ||
                    distanceSqToSegment(baseX + sideNx * o2, baseZ + sideNz * o2, ax, az, bx, bz) <
                      clearanceSq
                  );
                };
                if (checkAtT(s0) || checkAtT(tMid) || checkAtT(s2)) {
                  hitsRoad = true;
                  break;
                }
              }

              if (!hitsRoad) {
                acceptedWidth = candidateWidth;
                break;
              }
            }

            if (acceptedWidth !== runWidth) {
              flushSidewalkRun(t0);
              runStart = t0;
              runWidth = acceptedWidth;
            }
          }
          flushSidewalkRun(segLength);
        }
      }
    }

    if (
      structure !== "tunnel" &&
      width >= 7 &&
      (road.roadClass === "primary" || road.roadClass === "secondary")
    ) {
      const oneWay = road.direction === "forward" || road.direction === "reverse";
      const offsets = oneWay && width >= 11 ? [-width / 6, width / 6] : [0];
      const dashLen = oneWay ? 3.6 : 4.0;
      const gapLen = oneWay ? 5.4 : 5.5;
      const markHalfWidth = oneWay ? 0.08 : 0.09;
      const period = dashLen + gapLen;

      let totalLength = 0;
      for (let i = 0; i < road.polylineENU.length - 1; i += 1) {
        const p0 = road.polylineENU[i]!;
        const p1 = road.polylineENU[i + 1]!;
        totalLength += Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      }

      if (totalLength >= LANE_MARK_END_MARGIN_METRES * 2 + 1.4) {
        let travelled = 0;
        for (let segIdx = 0; segIdx < road.polylineENU.length - 1; segIdx += 1) {
          const a = road.polylineENU[segIdx]!;
          const b = road.polylineENU[segIdx + 1]!;
          const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
          if (segLen < 1.4) {
            travelled += segLen;
            continue;
          }
          const ux = (b[0] - a[0]) / segLen;
          const uz = (b[1] - a[1]) / segLen;
          const segStartGlobal = travelled;
          const segEndGlobal = travelled + segLen;
          const firstCycle = Math.max(
            0,
            Math.floor((segStartGlobal - LANE_MARK_END_MARGIN_METRES) / period),
          );

          for (let cycle = firstCycle; ; cycle += 1) {
            const globalDashStart = LANE_MARK_END_MARGIN_METRES + cycle * period;
            if (
              globalDashStart >= Math.min(segEndGlobal, totalLength - LANE_MARK_END_MARGIN_METRES)
            )
              break;
            const globalDashEnd = Math.min(
              globalDashStart + dashLen,
              totalLength - LANE_MARK_END_MARGIN_METRES,
            );
            const localStart = Math.max(0.35, globalDashStart - segStartGlobal);
            const localEnd = Math.min(segLen - 0.35, globalDashEnd - segStartGlobal);
            if (localEnd - localStart < 1.4) continue;

            const localMid = (localStart + localEnd) / 2;
            const midPoint: Position2 = [a[0] + ux * localMid, a[1] + uz * localMid];
            const nearJunction = junctionGrid
              .queryPoint(midPoint)
              .some(
                (j) =>
                  Math.abs(j.y - roadY) <= SAME_ELEVATION_TOLERANCE_METRES &&
                  Math.hypot(midPoint[0] - j.point[0], midPoint[1] - j.point[1]) <
                    LANE_MARK_JUNCTION_CLEARANCE_METRES,
              );
            if (nearJunction) continue;

            const dashSamples: Position2[] = [
              [a[0] + ux * localStart, a[1] + uz * localStart],
              midPoint,
              [a[0] + ux * localEnd, a[1] + uz * localEnd],
            ];
            const crossesOtherCarriageway = dashSamples.some((sample) =>
              segmentGrid.queryPoint(sample).some((other) => {
                if (other.roadId === road.localId) return false;
                if (Math.abs(other.y - roadY) > SAME_ELEVATION_TOLERANCE_METRES) return false;
                if (isSmoothContinuation(a, b, ux, uz, half, other)) return false;
                return (
                  closestPointOnSegment(sample, other.a, other.b).distance < other.halfWidth + 0.25
                );
              }),
            );
            if (crossesOtherCarriageway) continue;

            for (const offset of offsets) {
              pushQuad(
                road.localId,
                "lane_marking",
                roadRenderY + 0.012,
                quadPoints(
                  a,
                  ux,
                  uz,
                  localStart,
                  localEnd,
                  offset + markHalfWidth,
                  offset - markHalfWidth,
                ),
              );
            }
          }
          travelled += segLen;
        }
      }
    }

    if (
      structure === "surface" &&
      road.roadClass === "alley" &&
      road.surface !== "asphalt" &&
      width >= 2.2
    ) {
      for (let segIdx = 0; segIdx < road.polylineENU.length - 1; segIdx += 1) {
        const a = road.polylineENU[segIdx]!;
        const b = road.polylineENU[segIdx + 1]!;
        const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (segLen < MIN_ALLEY_TRIM_RUN_METRES) continue;
        const ux = (b[0] - a[0]) / segLen;
        const uz = (b[1] - a[1]) / segLen;
        const stepCount = Math.max(1, Math.ceil(segLen / STEP_TARGET_METRES));
        const stepLen = segLen / stepCount;

        for (const side of [1, -1] as const) {
          const leftOff = side === 1 ? half : -(half - ALLEY_TRIM_WIDTH_METRES);
          const rightOff = side === 1 ? half - ALLEY_TRIM_WIDTH_METRES : -half;
          const probeOff =
            side === 1
              ? half - ALLEY_TRIM_WIDTH_METRES * 0.5
              : -(half - ALLEY_TRIM_WIDTH_METRES * 0.5);
          const nx = -uz;
          const nz = ux;
          let runStart = 0;
          let active = false;

          const flushAlleyRun = (runEnd: number) => {
            if (!active || runEnd - runStart < MIN_ALLEY_TRIM_RUN_METRES) return;
            pushQuad(
              road.localId,
              "alley_trim",
              roadRenderY + 0.003,
              quadPoints(a, ux, uz, runStart, runEnd, leftOff, rightOff),
            );
          };

          for (let step = 0; step < stepCount; step += 1) {
            const t0 = step * stepLen;
            const t1 = (step + 1) * stepLen;
            const tMid = (t0 + t1) / 2;
            const probes: Position2[] = [
              Math.min(t1, t0 + 0.15),
              tMid,
              Math.max(t0, t1 - 0.15),
            ].map((sampleT) => [
              a[0] + ux * sampleT + nx * probeOff,
              a[1] + uz * sampleT + nz * probeOff,
            ]);
            const blocked = probes.some((probe) =>
              segmentGrid.queryPoint(probe).some((other) => {
                if (other.roadId === road.localId || other.structure !== "surface") return false;
                if (Math.abs(other.y - roadY) > SAME_ELEVATION_TOLERANCE_METRES) return false;
                if (isSmoothContinuation(a, b, ux, uz, half, other)) return false;
                return (
                  closestPointOnSegment(probe, other.a, other.b).distance < other.halfWidth + 0.1
                );
              }),
            );

            if (!blocked && !active) {
              runStart = t0;
              active = true;
            } else if (blocked && active) {
              flushAlleyRun(t0);
              active = false;
            }
          }
          flushAlleyRun(segLen);
        }
      }
    }
  }

  return {
    origin: "estimated_procedural",
    quads,
    countsByKind,
    styledRoadCounts,
  };
}
