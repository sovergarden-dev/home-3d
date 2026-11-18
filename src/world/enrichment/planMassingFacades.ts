import { polygonsOf, ringWithoutClosure, signedRingArea, surfaceIntersects } from "../geometry";
import type { PolygonGeometry, Position2, RoadClass, WorldData } from "../schema";
import type { MassingPlan, PlannedMassingItem } from "./planMassing";
import { hash01 } from "./planSurroundings";
import type { EnrichmentLayer } from "./schema";

type ProceduralFacadeInstanceKind =
  "balcony_slab" | "balcony_railing" | "shop_shutter" | "shop_sign_band" | "shop_awning";

export interface PlannedFacadeInstance {
  massingId: string;
  sourceBuildingId: string;
  roadId: string;
  roadClass: RoadClass;
  kind: ProceduralFacadeInstanceKind;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  angle: number;
  color: string;
}

export interface MassingFacadePlan {
  origin: "estimated_procedural";
  seed: number;
  balconyBuildingCount: number;
  shopBuildingCount: number;
  frontageByRoadClass: Partial<Record<RoadClass, number>>;
  instances: PlannedFacadeInstance[];
}

const SPATIAL_CELL_METRES = 24;
const MIN_FRONTAGE_EDGE_METRES = 2.4;
const MAX_ROAD_FRONTAGE_GAP_METRES = 10.0;
const ROAD_CLEARANCE_METRES = 0.25;
const PROJECTION_DEPTH_TIERS = [0.58, 0.36] as const;
const SIGN_PALETTE = ["#b05537", "#2f6b69", "#b08638"] as const;
const AWNING_PALETTE = ["#c45c3e", "#356d5c", "#3c6488", "#be8b36"] as const;

const round3 = (value: number) => Math.round(value * 1000) / 1000;
const round4 = (value: number) => Math.round(value * 10000) / 10000;
const compareCodeUnit = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

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

interface IndexedRoadSegment {
  roadId: string;
  roadClass: RoadClass;
  halfWidth: number;
  a: Position2;
  b: Position2;
  ux: number;
  uz: number;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

interface IndexedNeighborBuilding {
  buildingId: string;
  polygon: PolygonGeometry;
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

function closestPointOnSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): { cx: number; cz: number; distance: number } {
  const dx = bx - ax;
  const dz = bz - az;
  const lengthSq = dx * dx + dz * dz;
  const t =
    lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lengthSq));
  const cx = ax + t * dx;
  const cz = az + t * dz;
  return { cx, cz, distance: Math.hypot(px - cx, pz - cz) };
}

function orientedBoxPolygon(
  midX: number,
  midZ: number,
  ex: number,
  ez: number,
  nx: number,
  nz: number,
  halfWidth: number,
  outStart: number,
  outEnd: number,
): {
  polygon: PolygonGeometry;
  corners: [Position2, Position2, Position2, Position2];
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
} {
  const c0: Position2 = [
    midX - ex * halfWidth + nx * outStart,
    midZ - ez * halfWidth + nz * outStart,
  ];
  const c1: Position2 = [
    midX + ex * halfWidth + nx * outStart,
    midZ + ez * halfWidth + nz * outStart,
  ];
  const c2: Position2 = [midX + ex * halfWidth + nx * outEnd, midZ + ez * halfWidth + nz * outEnd];
  const c3: Position2 = [midX - ex * halfWidth + nx * outEnd, midZ - ez * halfWidth + nz * outEnd];
  const minX = Math.min(c0[0], c1[0], c2[0], c3[0]);
  const maxX = Math.max(c0[0], c1[0], c2[0], c3[0]);
  const minZ = Math.min(c0[1], c1[1], c2[1], c3[1]);
  const maxZ = Math.max(c0[1], c1[1], c2[1], c3[1]);
  return {
    polygon: { type: "Polygon", coordinates: [[c0, c1, c2, c3, c0]] },
    corners: [c0, c1, c2, c3],
    minX,
    minZ,
    maxX,
    maxZ,
  };
}

interface MatchedFrontage {
  roadId: string;
  roadClass: RoadClass;
  midX: number;
  midZ: number;
  ex: number;
  ez: number;
  nx: number;
  nz: number;
  edgeLength: number;
  angle: number;
}

export function planMassingFacades(
  world: WorldData,
  layer: EnrichmentLayer,
  massingPlan: MassingPlan,
): MassingFacadePlan {
  const { seed, massing } = layer.generator;
  const balconyProb = Math.max(0, Math.min(1, massing.balconyProbability));
  const shopProb = Math.max(0, Math.min(1, massing.shopProbabilityOnPrimary));
  if ((balconyProb <= 0 && shopProb <= 0) || massingPlan.items.length === 0) {
    return {
      origin: "estimated_procedural",
      seed,
      balconyBuildingCount: 0,
      shopBuildingCount: 0,
      frontageByRoadClass: {},
      instances: [],
    };
  }

  const roadGrid = new SpatialGrid<IndexedRoadSegment>();
  const sortedRoads = [...world.roads].sort((a, b) => compareCodeUnit(a.localId, b.localId));
  for (const road of sortedRoads) {
    const width = road.carriagewayWidth ?? 0;
    if (road.polylineENU.length < 2 || width <= 0) continue;
    if ((road.structure ?? "surface") !== "surface") continue;
    const halfWidth = width * 0.5;
    const pad = halfWidth + MAX_ROAD_FRONTAGE_GAP_METRES + 2;
    for (let idx = 0; idx < road.polylineENU.length - 1; idx += 1) {
      const a = road.polylineENU[idx]!;
      const b = road.polylineENU[idx + 1]!;
      const segLen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (segLen <= 1e-6) continue;
      const minX = Math.min(a[0], b[0]) - pad;
      const minZ = Math.min(a[1], b[1]) - pad;
      const maxX = Math.max(a[0], b[0]) + pad;
      const maxZ = Math.max(a[1], b[1]) + pad;
      roadGrid.insert(minX, minZ, maxX, maxZ, {
        roadId: road.localId,
        roadClass: road.roadClass,
        halfWidth,
        a,
        b,
        ux: (b[0] - a[0]) / segLen,
        uz: (b[1] - a[1]) / segLen,
        minX,
        minZ,
        maxX,
        maxZ,
      });
    }
  }

  const buildingGrid = new SpatialGrid<IndexedNeighborBuilding>();
  const elevationByBuildingId = new Map<string, number>();
  const sortedBuildings = [...world.buildings].sort((a, b) =>
    compareCodeUnit(a.localId, b.localId),
  );
  for (const building of sortedBuildings) {
    if (building.hidden) continue;
    elevationByBuildingId.set(building.localId, building.baseElevation ?? 0);
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
      buildingGrid.insert(minX - 2, minZ - 2, maxX + 2, maxZ + 2, {
        buildingId: building.localId,
        polygon,
        minX,
        minZ,
        maxX,
        maxZ,
      });
    }
  }

  const projectionClear = (
    sourceBuildingId: string,
    midX: number,
    midZ: number,
    ex: number,
    ez: number,
    nx: number,
    nz: number,
    width: number,
    depth: number,
  ): boolean => {
    const box = orientedBoxPolygon(midX, midZ, ex, ez, nx, nz, width * 0.5, 0.01, depth);
    const probe: Position2 = [(box.minX + box.maxX) * 0.5, (box.minZ + box.maxZ) * 0.5];

    for (const neighbor of buildingGrid.queryPoint(probe)) {
      if (neighbor.buildingId === sourceBuildingId) continue;
      if (
        box.maxX < neighbor.minX ||
        box.minX > neighbor.maxX ||
        box.maxZ < neighbor.minZ ||
        box.minZ > neighbor.maxZ
      ) {
        continue;
      }
      if (surfaceIntersects(box.polygon, neighbor.polygon)) return false;
    }

    for (const seg of roadGrid.queryPoint(probe)) {
      const minAllowable = seg.halfWidth + ROAD_CLEARANCE_METRES;
      for (const [cx, cz] of box.corners) {
        if (
          closestPointOnSegment(cx, cz, seg.a[0], seg.a[1], seg.b[0], seg.b[1]).distance <
          minAllowable
        ) {
          return false;
        }
      }
      const outerMid: Position2 = [midX + nx * depth, midZ + nz * depth];
      if (
        closestPointOnSegment(outerMid[0], outerMid[1], seg.a[0], seg.a[1], seg.b[0], seg.b[1])
          .distance < minAllowable
      ) {
        return false;
      }
    }

    return true;
  };

  const frontFaceUnblockedByNeighbor = (
    sourceBuildingId: string,
    midX: number,
    midZ: number,
    ex: number,
    ez: number,
    nx: number,
    nz: number,
    halfWidth: number,
  ): boolean => {
    const box = orientedBoxPolygon(midX, midZ, ex, ez, nx, nz, halfWidth, 0.01, 0.1);
    const probe: Position2 = [(box.minX + box.maxX) * 0.5, (box.minZ + box.maxZ) * 0.5];
    for (const neighbor of buildingGrid.queryPoint(probe)) {
      if (neighbor.buildingId === sourceBuildingId) continue;
      if (
        box.maxX < neighbor.minX ||
        box.minX > neighbor.maxX ||
        box.maxZ < neighbor.minZ ||
        box.minZ > neighbor.maxZ
      ) {
        continue;
      }
      if (surfaceIntersects(box.polygon, neighbor.polygon)) return false;
    }
    return true;
  };

  const matchFrontage = (item: PlannedMassingItem): MatchedFrontage | null => {
    const polygon = polygonsOf(item.footprint)[0];
    const outer = polygon?.coordinates[0];
    if (!outer) return null;
    const raw = ringWithoutClosure(outer);
    if (raw.length < 3) return null;
    const ccw = signedRingArea(raw) >= 0 ? raw : [...raw].reverse();

    let best: { score: number; candidate: MatchedFrontage; edgeIndex: number } | null = null;
    for (let edgeIndex = 0; edgeIndex < ccw.length; edgeIndex += 1) {
      const a = ccw[edgeIndex]!;
      const b = ccw[(edgeIndex + 1) % ccw.length]!;
      const edgeLength = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (edgeLength < MIN_FRONTAGE_EDGE_METRES) continue;
      const ex = (b[0] - a[0]) / edgeLength;
      const ez = (b[1] - a[1]) / edgeLength;
      // Signed area >= 0 in (x=East, z=South) has interior on (-ez, ex), so outward is (ez, -ex).
      const nx = ez;
      const nz = -ex;
      const midX = (a[0] + b[0]) * 0.5;
      const midZ = (a[1] + b[1]) * 0.5;
      if (!frontFaceUnblockedByNeighbor(item.sourceBuildingId, midX, midZ, ex, ez, nx, nz, 0.8)) {
        continue;
      }

      for (const seg of roadGrid.queryPoint([midX, midZ])) {
        const hit = closestPointOnSegment(midX, midZ, seg.a[0], seg.a[1], seg.b[0], seg.b[1]);
        const gap = hit.distance - seg.halfWidth;
        if (gap < 0 || gap > MAX_ROAD_FRONTAGE_GAP_METRES) continue;
        const vx = hit.cx - midX;
        const vz = hit.cz - midZ;
        const vLen = Math.hypot(vx, vz);
        const facing = vLen <= 1e-6 ? 1 : (vx * nx + vz * nz) / vLen;
        const align = Math.abs(ex * seg.ux + ez * seg.uz);
        if (facing < 0.45 || align < 0.65) continue;

        const score = gap - align * 1.2;
        const isBetter =
          !best ||
          score < best.score - 1e-6 ||
          (Math.abs(score - best.score) <= 1e-6 &&
            (compareCodeUnit(seg.roadId, best.candidate.roadId) < 0 ||
              (seg.roadId === best.candidate.roadId && edgeIndex < best.edgeIndex)));
        if (isBetter) {
          best = {
            score,
            edgeIndex,
            candidate: {
              roadId: seg.roadId,
              roadClass: seg.roadClass,
              midX,
              midZ,
              ex,
              ez,
              nx,
              nz,
              edgeLength,
              angle: round4(-Math.atan2(ez, ex)),
            },
          };
        }
      }
    }
    return best?.candidate ?? null;
  };

  const frontageByRoadClass: Partial<Record<RoadClass, number>> = {};
  const instances: PlannedFacadeInstance[] = [];
  let balconyBuildingCount = 0;
  let shopBuildingCount = 0;

  const sortedItems = [...massingPlan.items].sort((a, b) => compareCodeUnit(a.localId, b.localId));
  const pushBox = (
    item: PlannedMassingItem,
    frontage: MatchedFrontage,
    kind: ProceduralFacadeInstanceKind,
    y: number,
    outStart: number,
    outEnd: number,
    width: number,
    height: number,
    color: string,
  ) => {
    const outMid = (outStart + outEnd) * 0.5;
    instances.push({
      massingId: item.localId,
      sourceBuildingId: item.sourceBuildingId,
      roadId: frontage.roadId,
      roadClass: frontage.roadClass,
      kind,
      x: round3(frontage.midX + frontage.nx * outMid),
      y: round3(y),
      z: round3(frontage.midZ + frontage.nz * outMid),
      sx: round3(width),
      sy: round3(height),
      sz: round3(outEnd - outStart),
      angle: frontage.angle,
      color,
    });
  };

  for (const item of sortedItems) {
    const frontage = matchFrontage(item);
    if (!frontage) continue;
    frontageByRoadClass[frontage.roadClass] = (frontageByRoadClass[frontage.roadClass] ?? 0) + 1;
    const baseElevation = elevationByBuildingId.get(item.sourceBuildingId) ?? 0;

    if (
      shopProb > 0 &&
      frontage.roadClass === "primary" &&
      hash01(`${seed}|${item.localId}|shop`) < shopProb
    ) {
      const shopWidth = Math.max(1.8, Math.min(frontage.edgeLength * 0.76, 4.4));
      let awningDepth = 0;
      for (const depthCandidate of PROJECTION_DEPTH_TIERS) {
        if (
          projectionClear(
            item.sourceBuildingId,
            frontage.midX,
            frontage.midZ,
            frontage.ex,
            frontage.ez,
            frontage.nx,
            frontage.nz,
            shopWidth,
            depthCandidate,
          )
        ) {
          awningDepth = depthCandidate;
          break;
        }
      }
      if (
        awningDepth > 0 ||
        frontFaceUnblockedByNeighbor(
          item.sourceBuildingId,
          frontage.midX,
          frontage.midZ,
          frontage.ex,
          frontage.ez,
          frontage.nx,
          frontage.nz,
          shopWidth * 0.5,
        )
      ) {
        shopBuildingCount += 1;
        const signColor =
          SIGN_PALETTE[
            Math.floor(hash01(`${seed}|${item.localId}|shop-sign`) * SIGN_PALETTE.length) %
              SIGN_PALETTE.length
          ]!;
        pushBox(
          item,
          frontage,
          "shop_shutter",
          baseElevation + 1.15,
          0.01,
          0.07,
          shopWidth,
          2.25,
          "#7c8685",
        );
        pushBox(
          item,
          frontage,
          "shop_sign_band",
          baseElevation + 2.52,
          0.01,
          0.08,
          shopWidth * 0.9,
          0.36,
          signColor,
        );
        if (awningDepth > 0) {
          const awningColor =
            AWNING_PALETTE[
              Math.floor(hash01(`${seed}|${item.localId}|shop-awning`) * AWNING_PALETTE.length) %
                AWNING_PALETTE.length
            ]!;
          pushBox(
            item,
            frontage,
            "shop_awning",
            baseElevation + 2.24,
            0.02,
            awningDepth,
            shopWidth * 0.94,
            0.09,
            awningColor,
          );
        }
      }
    }

    if (
      balconyProb > 0 &&
      item.levels >= 2 &&
      hash01(`${seed}|${item.localId}|balcony`) < balconyProb
    ) {
      const balconyWidth = Math.max(1.6, Math.min(frontage.edgeLength * 0.68, 3.8));
      let balconyDepth = 0;
      for (const depthCandidate of PROJECTION_DEPTH_TIERS) {
        if (
          projectionClear(
            item.sourceBuildingId,
            frontage.midX,
            frontage.midZ,
            frontage.ex,
            frontage.ez,
            frontage.nx,
            frontage.nz,
            balconyWidth,
            depthCandidate,
          )
        ) {
          balconyDepth = depthCandidate;
          break;
        }
      }
      if (balconyDepth > 0) {
        balconyBuildingCount += 1;
        for (let floor = 1; floor < item.levels; floor += 1) {
          const floorY = baseElevation + floor * massing.floorHeight;
          pushBox(
            item,
            frontage,
            "balcony_slab",
            floorY + 0.075,
            0.01,
            balconyDepth,
            balconyWidth,
            0.15,
            "#cfc3b0",
          );
          pushBox(
            item,
            frontage,
            "balcony_railing",
            floorY + 0.15 + 0.41,
            balconyDepth - 0.06,
            balconyDepth,
            balconyWidth,
            0.82,
            "#515e5b",
          );
        }
      }
    }
  }

  return {
    origin: "estimated_procedural",
    seed,
    balconyBuildingCount,
    shopBuildingCount,
    frontageByRoadClass,
    instances,
  };
}
