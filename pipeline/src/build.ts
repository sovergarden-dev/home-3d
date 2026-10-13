import type { WorldPackage } from "../../src/world/schema";
import { validateWorld } from "../../src/world/validate";
import type { PipelineConfig } from "./config";
import type { GeoJsonFeatureCollection } from "./normalize";
import { normalizeGeoJsonSource } from "./normalize";
import { createWorldBuildReport, type WorldBuildReport } from "./report";

export interface BuildWorldPackageResult {
  package: WorldPackage;
  report: WorldBuildReport;
}

export function buildWorldPackage(
  source: GeoJsonFeatureCollection,
  config: PipelineConfig,
): BuildWorldPackageResult {
  const world = normalizeGeoJsonSource(source, {
    origin: config.origin,
    datasetRevision: config.datasetRevision,
    source: config.source,
  });
  const validation = validateWorld(world);
  const report = createWorldBuildReport(world);
  if (!validation.valid) throw new Error("PIPELINE_WORLD_VALIDATION_FAILED");
  return { package: { manifest: world.manifest, world }, report };
}
