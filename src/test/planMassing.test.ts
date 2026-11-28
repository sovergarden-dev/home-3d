import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { polygonsOf, surfaceBounds, surfaceContains, surfaceIntersects } from "@/world/geometry";
import {
  enrichmentBounds,
  HOME_ENRICHMENT,
  homeEnrichmentBase,
} from "@/world/enrichment/homeEnrichment";
import { parseEnrichmentLayer } from "@/world/enrichment/parse";
import { minDistanceToPolygon, planMassing } from "@/world/enrichment/planMassing";
import { planMassingFacades } from "@/world/enrichment/planMassingFacades";
import { HOME_NEIGHBORHOOD } from "@/world/homeNeighborhood";
import type { Building, Lot, RoadSegment, WorldData } from "@/world/schema";
import { assessWallHeight } from "@/world/wallHeight";

function canonicalJson(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean")
    return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("NON_FINITE_GOLDEN_VALUE");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`)
      .join(",")}}`;
  }
  throw new Error("UNSUPPORTED_GOLDEN_VALUE");
}

const sha = (value: unknown) => createHash("sha256").update(canonicalJson(value)).digest("hex");

export const MASSING_GOLDEN_SHA256 =
  "cd80662015bd763c7693453e4d59685fd3c7ccecc7f9ae7a8a3e69ae065de651";
const MASSING_FACADES_GOLDEN_SHA256 =
  "8bc514ef1ce27f793d59f605132465a9074fbfb096be1b0152e71525a90c6e77";

function shuffled<T>(items: readonly T[], seed: number): T[] {
  const copy = [...items];
  let state = seed;
  for (let index = copy.length - 1; index > 0; index--) {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0;
    const other = state % (index + 1);
    [copy[index], copy[other]] = [copy[other]!, copy[index]!];
  }
  return copy;
}

function squareBuilding(localId: string, cx: number, cz: number, half = 3): Building {
  return {
    localId,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [cx - half, cz - half],
          [cx + half, cz - half],
          [cx + half, cz + half],
          [cx - half, cz + half],
          [cx - half, cz - half],
        ],
      ],
    },
    footprintKind: "footprint",
    wallHeight: 6,
    roofType: "unknown",
    provenance: { source: "osm", quality: "source_only", licence: "ODbL-1.0" },
    attributes: { wallHeight: { source: "osm", quality: "inferred" } },
  };
}

describe("planMassing", () => {
  it("plans deterministic estimated massing for unknown neighboring buildings only", () => {
    expect(HOME_ENRICHMENT).not.toBeNull();
    const layer = HOME_ENRICHMENT!;
    const sourceIds = new Set([
      ...layer.buildingFacts.map((fact) => fact.buildingId),
      ...HOME_NEIGHBORHOOD.buildings
        .filter((building) => assessWallHeight(building, false).status !== "unknown")
        .map((building) => building.localId),
    ]);
    const plan = planMassing(HOME_NEIGHBORHOOD, layer);
    const again = planMassing(HOME_NEIGHBORHOOD, layer);
    const reordered: WorldData = {
      ...structuredClone(HOME_NEIGHBORHOOD),
      buildings: shuffled(HOME_NEIGHBORHOOD.buildings, 17),
      roads: shuffled(HOME_NEIGHBORHOOD.roads, 23),
    };
    const [minX, minZ, maxX, maxZ] = enrichmentBounds(HOME_NEIGHBORHOOD);
    const buildingById = new Map(
      HOME_NEIGHBORHOOD.buildings.map((building) => [building.localId, building]),
    );

    expect(plan).toEqual(again);
    expect(plan).toEqual(planMassing(reordered, layer));
    expect(plan.items).toHaveLength(HOME_NEIGHBORHOOD.buildings.length - sourceIds.size);
    expect(new Set(plan.items.map((item) => item.localId)).size).toBe(plan.items.length);
    expect(plan.items.every((item) => item.origin === "estimated_procedural")).toBe(true);
    expect(plan.items.every((item) => item.levels >= 1 && item.levels <= 4)).toBe(true);
    expect(
      plan.items.every((item) =>
        Math.hypot(item.position[0], item.position[1]) < layer.generator.homeDominanceRadius
          ? item.levels <= layer.generator.homeMaxNeighbourLevels
          : true,
      ),
    ).toBe(true);
    expect(
      plan.items.every(
        (item) => item.wallHeight === item.levels * layer.generator.massing.floorHeight,
      ),
    ).toBe(true);
    expect(
      plan.items.every((item) => ["corrugated", "flat", "terrace_tum"].includes(item.roofType)),
    ).toBe(true);
    expect(plan.items.every((item) => item.footprint.type === "Polygon")).toBe(true);
    expect(
      plan.items.every(
        (item) =>
          item.position[0] >= minX &&
          item.position[0] <= maxX &&
          item.position[1] >= minZ &&
          item.position[1] <= maxZ,
      ),
    ).toBe(true);
    const overlaps: string[] = [];
    for (const item of plan.items) {
      expect(sourceIds.has(item.sourceBuildingId)).toBe(false);
      const source = buildingById.get(item.sourceBuildingId);
      expect(source).toBeDefined();
      expect(surfaceContains(source!.geometry, item.footprint, 1e-3)).toBe(true);
      for (const building of HOME_NEIGHBORHOOD.buildings) {
        if (building.localId === item.sourceBuildingId) continue;
        if (surfaceIntersects(item.footprint, building.geometry)) {
          overlaps.push(`${item.localId}:${building.localId}`);
        }
      }
    }
    expect(overlaps).toEqual([]);
    expect(plan.skippedSourceBuildingIds).toEqual([...sourceIds].sort());
    expect(sha(plan)).toBe(MASSING_GOLDEN_SHA256);
  });

  it("verifies focal verified buildings bypass procedural massing and enforces exclusion + dominance caps", () => {
    const layer = HOME_ENRICHMENT!;
    const focalHome = HOME_NEIGHBORHOOD.buildings.find(
      (building) => building.localId === "building-focal-home",
    );
    expect(focalHome).toBeDefined();
    expect(assessWallHeight(focalHome!, false).status).toBe("known");
    const minUnknownDistance = Math.min(
      ...HOME_NEIGHBORHOOD.buildings
        .filter((building) => assessWallHeight(building, false).status === "unknown")
        .flatMap((building) =>
          polygonsOf(building.geometry).map((polygon) => minDistanceToPolygon([0, 0], polygon)),
        ),
    );
    expect(minUnknownDistance).toBeGreaterThan(layer.generator.homeExclusionRadius);

    const homeLot: Lot = {
      localId: "lot-home-empty",
      geometry: squareBuilding("lot-shape", 0, 0, 5).geometry,
      status: "empty",
      confirmed: true,
      provenance: { source: "survey", quality: "verified" },
    };
    const world: WorldData = {
      manifest: {
        ...structuredClone(HOME_NEIGHBORHOOD.manifest),
        isSynthetic: false,
      },
      roads: [],
      lots: [homeLot],
      buildings: [
        squareBuilding("b-on-home-lot", 2, 0, 3),
        squareBuilding("b-in-exclusion", 9, 0, 2),
        squareBuilding("b-in-dominance", 20, 0, 3),
        squareBuilding("b-far", 80, 0, 3),
      ],
    };
    const fourStoreyHeavyLayer = {
      ...layer,
      buildingFacts: [],
      generator: {
        ...layer.generator,
        massing: {
          ...layer.generator.massing,
          levelsWeights: [0, 0, 0, 10] as [number, number, number, number],
        },
      },
    };
    const result = planMassing(world, fourStoreyHeavyLayer);
    expect(result.skippedSourceBuildingIds).toEqual(["b-in-exclusion", "b-on-home-lot"]);
    expect(result.items.map((item) => [item.sourceBuildingId, item.levels])).toEqual([
      ["b-far", 4],
      ["b-in-dominance", layer.generator.homeMaxNeighbourLevels],
    ]);
  });

  it("rejects malformed massing generator parameters fail-closed", () => {
    const base = homeEnrichmentBase();
    const raw = JSON.parse(JSON.stringify(HOME_ENRICHMENT));
    raw.generator.massing.floorHeight = 0;
    expect(parseEnrichmentLayer(raw, base)).toEqual({
      ok: false,
      errorCode: "GENERATOR_MASSING_FLOOR_HEIGHT",
    });

    const badWeights = JSON.parse(JSON.stringify(HOME_ENRICHMENT));
    badWeights.generator.massing.levelsWeights = [0, 0, 0, 0];
    expect(parseEnrichmentLayer(badWeights, base)).toEqual({
      ok: false,
      errorCode: "GENERATOR_MASSING_LEVELS_WEIGHTS",
    });
  });

  it("does not mutate the canonical world or enrichment layer", () => {
    expect(HOME_ENRICHMENT).not.toBeNull();
    const worldBefore = JSON.stringify(HOME_NEIGHBORHOOD);
    const layerBefore = JSON.stringify(HOME_ENRICHMENT);

    planMassing(HOME_NEIGHBORHOOD, HOME_ENRICHMENT!);

    expect(JSON.stringify(HOME_NEIGHBORHOOD)).toBe(worldBefore);
    expect(JSON.stringify(HOME_ENRICHMENT)).toBe(layerBefore);
  });

  it("plans deterministic street-frontage balconies and primary-road shopfronts without overlapping neighbors or roads", () => {
    const layer = HOME_ENRICHMENT!;
    const massingPlan = planMassing(HOME_NEIGHBORHOOD, layer);
    const facadePlan = planMassingFacades(HOME_NEIGHBORHOOD, layer, massingPlan);
    const reorderedWorld: WorldData = {
      ...structuredClone(HOME_NEIGHBORHOOD),
      buildings: shuffled(HOME_NEIGHBORHOOD.buildings, 29),
      roads: shuffled(HOME_NEIGHBORHOOD.roads, 31),
    };
    const reorderedFacades = planMassingFacades(
      reorderedWorld,
      layer,
      planMassing(reorderedWorld, layer),
    );

    expect(facadePlan).toEqual(reorderedFacades);
    expect(facadePlan.origin).toBe("estimated_procedural");
    expect(facadePlan.balconyBuildingCount).toBe(237);
    expect(facadePlan.shopBuildingCount).toBe(40);
    expect(facadePlan.instances).toHaveLength(858);
    expect(sha(facadePlan)).toBe(MASSING_FACADES_GOLDEN_SHA256);

    const shopInstances = facadePlan.instances.filter((inst) => inst.kind.startsWith("shop_"));
    expect(shopInstances.length).toBeGreaterThan(0);
    expect(shopInstances.every((inst) => inst.roadClass === "primary")).toBe(true);

    const massingById = new Map(massingPlan.items.map((item) => [item.localId, item]));
    const buildingBounds = HOME_NEIGHBORHOOD.buildings.map((building) => ({
      building,
      bounds: surfaceBounds(building.geometry),
    }));
    const facadeOverlaps: string[] = [];
    for (const inst of facadePlan.instances) {
      if (inst.kind.startsWith("balcony_")) {
        expect(massingById.get(inst.massingId)!.levels).toBeGreaterThanOrEqual(2);
      }
      const ex = Math.cos(inst.angle);
      const ez = -Math.sin(inst.angle);
      const nx = ez;
      const nz = -ex;
      const halfW = inst.sx * 0.5;
      const halfD = inst.sz * 0.5;
      const c0: [number, number] = [
        inst.x - ex * halfW - nx * halfD,
        inst.z - ez * halfW - nz * halfD,
      ];
      const c1: [number, number] = [
        inst.x + ex * halfW - nx * halfD,
        inst.z + ez * halfW - nz * halfD,
      ];
      const c2: [number, number] = [
        inst.x + ex * halfW + nx * halfD,
        inst.z + ez * halfW + nz * halfD,
      ];
      const c3: [number, number] = [
        inst.x - ex * halfW + nx * halfD,
        inst.z - ez * halfW + nz * halfD,
      ];
      const boxPoly = { type: "Polygon" as const, coordinates: [[c0, c1, c2, c3, c0]] };
      const pb = surfaceBounds(boxPoly);
      for (const { building, bounds } of buildingBounds) {
        if (building.localId === inst.sourceBuildingId) continue;
        if (
          pb.maxX + 1e-6 < bounds.minX ||
          pb.minX - 1e-6 > bounds.maxX ||
          pb.maxZ + 1e-6 < bounds.minZ ||
          pb.minZ - 1e-6 > bounds.maxZ
        ) {
          continue;
        }
        if (surfaceIntersects(boxPoly, building.geometry)) {
          facadeOverlaps.push(`${inst.massingId}:${building.localId}`);
        }
      }
    }
    expect(facadeOverlaps).toEqual([]);

    const zeroLayer = {
      ...layer,
      generator: {
        ...layer.generator,
        massing: {
          ...layer.generator.massing,
          balconyProbability: 0,
          shopProbabilityOnPrimary: 0,
        },
      },
    };
    const zeroPlan = planMassingFacades(HOME_NEIGHBORHOOD, zeroLayer, massingPlan);
    expect(zeroPlan.balconyBuildingCount).toBe(0);
    expect(zeroPlan.shopBuildingCount).toBe(0);
    expect(zeroPlan.instances).toHaveLength(0);

    const roadAvenue: RoadSegment = {
      localId: "road-primary-test",
      polylineENU: [
        [-20, -6],
        [20, -6],
      ],
      connectorIds: [],
      roadClass: "primary",
      carriagewayWidth: 6,
      elevationLayer: 0,
      structure: "surface",
      direction: "both",
      surface: "unknown",
      provenance: { source: "osm", quality: "source_only", licence: "ODbL-1.0" },
    };
    const roadSecondary: RoadSegment = {
      ...roadAvenue,
      localId: "road-secondary-test",
      polylineENU: [
        [-20, 26],
        [20, 26],
      ],
      roadClass: "secondary",
    };
    const synthWorld: WorldData = {
      manifest: { ...structuredClone(HOME_NEIGHBORHOOD.manifest), isSynthetic: false },
      roads: [roadAvenue, roadSecondary],
      lots: [],
      buildings: [
        squareBuilding("b-primary-front", 0, 2, 3),
        squareBuilding("b-secondary-front", 0, 18, 3),
      ],
    };
    const allEnabledLayer = {
      ...layer,
      buildingFacts: [],
      generator: {
        ...layer.generator,
        homeExclusionRadius: 0,
        homeDominanceRadius: 0,
        massing: {
          ...layer.generator.massing,
          levelsWeights: [0, 0, 10, 0] as [number, number, number, number],
          balconyProbability: 1,
          shopProbabilityOnPrimary: 1,
        },
      },
    };
    const synthMassing = planMassing(synthWorld, allEnabledLayer);
    const synthFacades = planMassingFacades(synthWorld, allEnabledLayer, synthMassing);
    expect(synthFacades.balconyBuildingCount).toBe(2);
    expect(synthFacades.shopBuildingCount).toBe(1);
    expect(
      synthFacades.instances
        .filter((inst) => inst.kind.startsWith("shop_"))
        .every((inst) => inst.sourceBuildingId === "b-primary-front"),
    ).toBe(true);
  });
});
