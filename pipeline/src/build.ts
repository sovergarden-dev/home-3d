import { applyWorldOverrides } from "../../src/world/overrides";
import {
  WORLD_OVERRIDE_IDENTITY_SCHEME,
  type WorldData,
  type WorldOverrideDocument,
  type WorldPackage,
} from "../../src/world/schema";
import { validateWorld } from "../../src/world/validate";
import type { PipelineConfig } from "./config";
import { conflateWorlds, type ConflationRule } from "./conflate";
import type { GeoJsonFeatureCollection } from "./normalize";
import { normalizeGeoJsonSourceWithAliases } from "./normalize";
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

function sameOrigin(first: PipelineConfig["origin"], second: PipelineConfig["origin"]) {
  return (
    first.longitude === second.longitude &&
    first.latitude === second.latitude &&
    (first.altitude ?? 0) === (second.altitude ?? 0)
  );
}

function allWorldIds(worlds: WorldData[]) {
  const ids = new Set<string>();
  for (const world of worlds) {
    for (const building of world.buildings) {
      ids.add(building.localId);
      for (const part of building.parts ?? []) ids.add(part.localId);
    }
    for (const feature of [
      ...world.roads,
      ...world.lots,
      ...(world.trees ?? []),
      ...(world.props ?? []),
    ]) {
      ids.add(feature.localId);
    }
  }
  return ids;
}

function createIdResolver(
  worlds: WorldData[],
  aliases: Array<{ legacyId: string; localId: string }>,
) {
  const currentIds = allWorldIds(worlds);
  const byLegacyId = new Map<string, Set<string>>();
  for (const alias of aliases) {
    const targets = byLegacyId.get(alias.legacyId) ?? new Set<string>();
    targets.add(alias.localId);
    byLegacyId.set(alias.legacyId, targets);
  }
  return (id: string) => {
    const targets = byLegacyId.get(id);
    if (!targets || targets.size === 0) return id;
    if (targets.size !== 1 || currentIds.has(id)) {
      throw new Error("PIPELINE_ID_MIGRATION_AMBIGUOUS");
    }
    return [...targets][0]!;
  };
}

function migrateOverrides(
  document: WorldOverrideDocument | undefined,
  resolveId: (id: string) => string,
): WorldOverrideDocument | undefined {
  if (!document) return undefined;
  const migrated: unknown = structuredClone(document);
  if (!migrated || typeof migrated !== "object" || Array.isArray(migrated)) return document;
  const record = migrated as Record<string, unknown>;
  if (!Array.isArray(record["overrides"])) return document;
  for (const item of record["overrides"]) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const override = item as Record<string, unknown>;
    if (
      override["identityScheme"] !== undefined &&
      override["identityScheme"] !== WORLD_OVERRIDE_IDENTITY_SCHEME
    ) {
      throw new Error("PIPELINE_IDENTITY_SCHEME_UNSUPPORTED");
    }
    const isCurrentIdentity = override["identityScheme"] === WORLD_OVERRIDE_IDENTITY_SCHEME;
    const patchValue = override["patch"];
    if (!patchValue || typeof patchValue !== "object" || Array.isArray(patchValue)) continue;
    const patch = patchValue as Record<string, unknown>;
    if (!isCurrentIdentity) {
      if (typeof patch["featureId"] === "string")
        patch["featureId"] = resolveId(patch["featureId"]);
      if (typeof patch["buildingId"] === "string")
        patch["buildingId"] = resolveId(patch["buildingId"]);
      if (typeof patch["partId"] === "string") patch["partId"] = resolveId(patch["partId"]);
      override["identityScheme"] = WORLD_OVERRIDE_IDENTITY_SCHEME;
    }
  }
  return migrated as WorldOverrideDocument;
}

export function buildWorldPackage(
  source: GeoJsonFeatureCollection,
  config: PipelineConfig,
  options?: BuildWorldPackageOptions | undefined,
): BuildWorldPackageResult {
  const primary = normalizeGeoJsonSourceWithAliases(source, {
    origin: config.origin,
    datasetRevision: config.datasetRevision,
    source: config.source,
  });
  const normalized = [primary];

  for (const secondary of options?.secondarySources ?? []) {
    if (!sameOrigin(config.origin, secondary.config.origin)) {
      throw new Error("PIPELINE_SOURCE_ORIGIN_MISMATCH");
    }
    if (
      (secondary.config.source.namespace ?? "primary") === (config.source.namespace ?? "primary")
    ) {
      throw new Error("PIPELINE_SOURCE_NAMESPACE_DUPLICATE");
    }
    normalized.push(
      normalizeGeoJsonSourceWithAliases(secondary.source, {
        origin: secondary.config.origin,
        datasetRevision: secondary.config.datasetRevision,
        source: secondary.config.source,
      }),
    );
  }

  const sourceWorlds = normalized.map((item) => item.world);
  const resolveId = createIdResolver(
    sourceWorlds,
    normalized.flatMap((item) => item.idAliases),
  );
  let world = structuredClone(sourceWorlds[0]!) as WorldData;
  let conflationReport: WorldBuildReport["conflation"];

  if (sourceWorlds.length > 1) {
    const rules = (options?.conflationRules ?? []).map((rule) => ({
      ...rule,
      primaryBuildingId: resolveId(rule.primaryBuildingId),
      duplicateBuildingId: resolveId(rule.duplicateBuildingId),
    }));
    const conflated = conflateWorlds(sourceWorlds, rules);
    world = conflated.world;
    conflationReport = {
      resolved: conflated.report.resolved,
      unresolved: conflated.report.unresolved,
      passesQualityGate: conflated.report.unresolved.length === 0,
    };
  }

  // Confirmed lots are explicit survey additions. Never overwrite an existing ID.
  if (options?.confirmedEmptyLots?.length) {
    const existingLotIds = new Set(world.lots.map((lot) => lot.localId));
    for (const lot of options.confirmedEmptyLots) {
      if (existingLotIds.has(lot.localId)) throw new Error("PIPELINE_LOT_ID_COLLISION");
      world.lots.push(structuredClone(lot));
      existingLotIds.add(lot.localId);
    }
  }

  // Persist the source/conflated world separately from its override document.
  // The package loader applies overrides for display; retaining this base makes
  // undo, replacement and rebuild semantics deterministic across reloads.
  const packageWorld = structuredClone(world) as WorldData;
  const migratedOverrides = migrateOverrides(options?.overrides, resolveId);
  if (migratedOverrides) {
    const overrideResult = applyWorldOverrides(world, migratedOverrides);
    if (overrideResult.issues.length > 0) {
      throw new Error(`PIPELINE_OVERRIDE_FAILED:${overrideResult.issues[0]}`);
    }
    world = overrideResult.world;
  }

  const validation = validateWorld(world);
  const report = createWorldBuildReport(world);
  if (conflationReport) report.conflation = conflationReport;
  if (!validation.valid) throw new Error("PIPELINE_WORLD_VALIDATION_FAILED");
  return {
    package: {
      manifest: packageWorld.manifest,
      world: packageWorld,
      ...(config.centerConfirmation
        ? { centerConfirmation: structuredClone(config.centerConfirmation) }
        : {}),
      ...(migratedOverrides ? { overrides: migratedOverrides } : {}),
    },
    report,
  };
}
