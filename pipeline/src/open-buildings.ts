import { pointInPolygon, polygonsOf, surfaceIntersects } from "../../src/world/geometry";
import { applyWorldOverrides } from "../../src/world/overrides";
import type { Building, BuildingPart, SurfaceGeometry, WorldPackage } from "../../src/world/schema";
import { validateWorld } from "../../src/world/validate";
import { createWorldBuildReport } from "./report";

export interface HeightSample {
  x: number;
  z: number;
  height: number;
  presence: number;
}
export interface HeightSampler {
  readonly year: number;
  sample(geometry: SurfaceGeometry): Promise<HeightSample[]>;
  close(): Promise<void>;
}
export interface HeightPolicy {
  centerExclusionRadiusMetres: number;
  presenceThreshold: number;
}
export interface OpenBuildingsReport {
  status: "APPLIED" | "NO_ELIGIBLE_HEIGHTS";
  year: number;
  examined: number;
  assigned: number;
  excluded: number;
  preserved: number;
  uncovered: number;
  usableSamples: number;
}

const namespace = "open-buildings-temporal-v1";
const licence = "CC-BY-4.0";
export function validateHeightPolicy(policy: HeightPolicy) {
  if (
    !Number.isFinite(policy.centerExclusionRadiusMetres) ||
    policy.centerExclusionRadiusMetres <= 0 ||
    !Number.isFinite(policy.presenceThreshold) ||
    policy.presenceThreshold <= 0 ||
    policy.presenceThreshold > 1
  )
    throw Error("OPEN_BUILDINGS_POLICY_INVALID");
}

/** Enriches existing geometry only. Raster samples and feature IDs never enter the report. */
export async function enrichOpenBuildingsPackage(
  input: WorldPackage,
  sampler: HeightSampler,
  policy: HeightPolicy,
) {
  validateHeightPolicy(policy);
  if (!Number.isInteger(sampler.year) || sampler.year < 2016 || sampler.year > 2023)
    throw Error("OPEN_BUILDINGS_YEAR_UNSUPPORTED");
  const pkg = structuredClone(input);
  const world = pkg.world;
  const protectedIds = new Set<string>();
  for (const { patch } of pkg.overrides?.overrides ?? []) {
    if ("featureId" in patch) protectedIds.add(patch.featureId);
    if ("buildingId" in patch) protectedIds.add(patch.buildingId);
    if ("partId" in patch) protectedIds.add(patch.partId);
  }
  const r = policy.centerExclusionRadiusMetres;
  // A square conservatively contains the protected centre disk; no inferred parcel boundary.
  const centre: SurfaceGeometry = {
    type: "Polygon",
    coordinates: [
      [
        [-r, -r],
        [r, -r],
        [r, r],
        [-r, r],
        [-r, -r],
      ],
    ],
  };
  const excluded = (geometry: SurfaceGeometry) =>
    surfaceIntersects(geometry, centre) ||
    world.lots.some((lot) => surfaceIntersects(geometry, lot.geometry));
  const report: OpenBuildingsReport = {
    status: "NO_ELIGIBLE_HEIGHTS",
    year: sampler.year,
    examined: 0,
    assigned: 0,
    excluded: 0,
    preserved: 0,
    uncovered: 0,
    usableSamples: 0,
  };
  const enrich = async (feature: Building | BuildingPart, parent: Building) => {
    report.examined++;
    if (excluded(parent.geometry) || excluded(feature.geometry)) {
      report.excluded++;
      return;
    }
    const evidence = feature.attributes?.["wallHeight"];
    if (
      parent.hidden ||
      protectedIds.has(parent.localId) ||
      protectedIds.has(feature.localId) ||
      feature.levels !== undefined ||
      (feature.wallHeight > 0 && !evidence) ||
      (evidence && evidence.quality !== "unknown")
    ) {
      report.preserved++;
      return;
    }
    const polygons = polygonsOf(feature.geometry);
    const values = (await sampler.sample(feature.geometry))
      .filter(
        (s) =>
          Number.isFinite(s.x) &&
          Number.isFinite(s.z) &&
          Number.isFinite(s.height) &&
          s.height > 0 &&
          s.height <= 100 &&
          Number.isFinite(s.presence) &&
          s.presence >= policy.presenceThreshold &&
          s.presence <= 1 &&
          polygons.some((polygon) => pointInPolygon([s.x, s.z], polygon)),
      )
      .map((s) => s.height)
      .sort((a, b) => a - b);
    if (!values.length) {
      report.uncovered++;
      return;
    }
    const middle = Math.floor(values.length / 2);
    const totalHeight =
      values.length % 2 ? values[middle]! : (values[middle - 1]! + values[middle]!) / 2;
    const wallHeight = totalHeight - (feature.roofHeight ?? 0);
    if (!Number.isFinite(wallHeight) || wallHeight <= 0) {
      report.uncovered++;
      return;
    }
    feature.wallHeight = wallHeight;
    feature.attributes = {
      ...feature.attributes,
      wallHeight: {
        source: "open_buildings",
        quality: "inferred",
        sourceNamespace: namespace,
        sourceRevision: `v1/${sampler.year}`,
        licence,
      },
    };
    report.assigned++;
    report.usableSamples += values.length;
  };
  for (const building of world.buildings) {
    await enrich(building, building);
    for (const part of building.parts ?? []) await enrich(part, building);
  }
  if (report.assigned) {
    report.status = "APPLIED";
    const sources = world.manifest.sources ?? [];
    const source = {
      namespace,
      kind: "open_buildings" as const,
      revision: `v1/${sampler.year}`,
      licence,
    };
    world.manifest.sources = [...sources.filter((s) => s.namespace !== namespace), source];
    world.manifest.licences = [...new Set([...world.manifest.licences, licence])];
    world.manifest.coverage.sourceCount = Math.max(
      world.manifest.sources.length,
      world.manifest.coverage.sourceCount +
        (sources.some((s) => s.namespace === namespace) ? 0 : 1),
    );
    pkg.manifest = structuredClone(world.manifest);
  }
  const effective = pkg.overrides
    ? applyWorldOverrides(world, pkg.overrides)
    : { world, issues: [] };
  if (effective.issues.length || !validateWorld(effective.world).valid)
    throw Error("OPEN_BUILDINGS_WORLD_INVALID");
  return {
    package: pkg,
    report: { ...createWorldBuildReport(effective.world), openBuildings: report },
  };
}
