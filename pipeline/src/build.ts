import { applyWorldOverrides } from "../../src/world/overrides";
import type { WorldData, WorldOverrideDocument, WorldPackage } from "../../src/world/schema";
import { validateWorld } from "../../src/world/validate";
import type { PipelineConfig } from "./config";
import { conflateWorlds, type ConflationRule } from "./conflate";
import type { GeoJsonFeatureCollection } from "./normalize";
import { normalizeGeoJsonSource } from "./normalize";
import { createWorldBuildReport, type WorldBuildReport } from "./report";

export interface BuildWorldPackageOptions {
  overrides?: WorldOverrideDocument | undefined;
  conflationRules?: ConflationRule[] | undefined;
  secondarySources?: { source: GeoJsonFeatureCollection; config: PipelineConfig }[] | undefined;
  confirmedEmptyLots?: WorldData["lots"] | undefined;
}

export interface BuildWorldPackageResult {
  package: WorldPackage;
  report: WorldBuildReport;
}

export function buildWorldPackage(
  source: GeoJsonFeatureCollection,
  config: PipelineConfig,
  options?: BuildWorldPackageOptions | undefined,
): BuildWorldPackageResult {
  let world = normalizeGeoJsonSource(source, {
    origin: config.origin,
    datasetRevision: config.datasetRevision,
    source: config.source,
  });

  // Attach confirmed empty lots if provided
  if (options?.confirmedEmptyLots?.length) {
    const existingLotIds = new Set(world.lots.map((l) => l.localId));
    for (const lot of options.confirmedEmptyLots) {
      if (!existingLotIds.has(lot.localId)) {
        world.lots.push(lot);
        existingLotIds.add(lot.localId);
      }
    }
  }

  // Conflate secondary sources if rules provided
  if (options?.secondarySources?.length) {
    const secondaryWorlds = options.secondarySources.map((sec) =>
      normalizeGeoJsonSource(sec.source, {
        origin: sec.config.origin,
        datasetRevision: sec.config.datasetRevision,
        source: sec.config.source,
      }),
    );
    const conflated = conflateWorlds([world, ...secondaryWorlds], options.conflationRules ?? []);
    world = conflated.world;
  }

  // Apply world overrides if provided
  if (options?.overrides) {
    const overrideResult = applyWorldOverrides(world, options.overrides);
    world = overrideResult.world;
  }

  const validation = validateWorld(world);
  const report = createWorldBuildReport(world);
  if (!validation.valid) throw new Error("PIPELINE_WORLD_VALIDATION_FAILED");
  return { package: { manifest: world.manifest, world }, report };
}
