import { surfaceBounds } from "../../src/world/geometry";
import type {
  Building,
  QualityStatus,
  WorldData,
  WorldSourceMetadata,
} from "../../src/world/schema";

export interface ConflationRule {
  primaryBuildingId: string;
  duplicateBuildingId: string;
  reason: string;
}

export interface ConflationResolution {
  primaryBuildingId: string;
  duplicateBuildingId: string;
  reason: string;
}

export interface ConflationCandidate {
  buildingIds: [string, string];
  boundsIou: number;
}

export interface ConflationResult {
  world: WorldData;
  report: {
    resolved: ConflationResolution[];
    unresolved: ConflationCandidate[];
  };
}

function cloneWorld(world: WorldData) {
  return structuredClone(world) as WorldData;
}

function boundsIou(a: Building, b: Building) {
  const first = surfaceBounds(a.geometry);
  const second = surfaceBounds(b.geometry);
  const overlapWidth = Math.max(
    0,
    Math.min(first.maxX, second.maxX) - Math.max(first.minX, second.minX),
  );
  const overlapHeight = Math.max(
    0,
    Math.min(first.maxZ, second.maxZ) - Math.max(first.minZ, second.minZ),
  );
  const overlap = overlapWidth * overlapHeight;
  const firstArea = (first.maxX - first.minX) * (first.maxZ - first.minZ);
  const secondArea = (second.maxX - second.minX) * (second.maxZ - second.minZ);
  const union = firstArea + secondArea - overlap;
  return union > 0 ? overlap / union : 0;
}

function appendUniqueById<T extends { localId: string }>(
  target: T[],
  incoming: T[],
  featureKind: string,
) {
  const ids = new Set(target.map((item) => item.localId));
  for (const item of incoming) {
    if (ids.has(item.localId)) throw new Error(`CONFLATE_DUPLICATE_${featureKind}_ID`);
    ids.add(item.localId);
    target.push(structuredClone(item) as T);
  }
}

function combinedQuality(qualities: QualityStatus[]): QualityStatus {
  if (qualities.length > 0 && qualities.every((quality) => quality === "synthetic"))
    return "synthetic";
  if (qualities.includes("conflict")) return "conflict";
  if (qualities.includes("unknown")) return "unknown";
  if (qualities.includes("inferred") || qualities.includes("synthetic")) return "inferred";
  if (qualities.includes("source_only")) return "source_only";
  return "verified";
}

export function conflateWorlds(worlds: WorldData[], rules: ConflationRule[]): ConflationResult {
  if (worlds.length === 0) throw new Error("CONFLATE_WORLD_REQUIRED");
  const world = cloneWorld(worlds[0]!);
  const allSourceBuildings = worlds.flatMap((source, sourceIndex) =>
    source.buildings.map((building) => ({ sourceIndex, building })),
  );
  const byId = new Map<string, { sourceIndex: number; building: Building }>();
  for (const item of allSourceBuildings) {
    if (byId.has(item.building.localId)) throw new Error("CONFLATE_DUPLICATE_BUILDING_ID");
    byId.set(item.building.localId, item);
  }

  const removals = new Set<string>();
  const resolved: ConflationResolution[] = [];
  for (const rule of rules) {
    if (!rule.reason.trim()) throw new Error("CONFLATE_REASON_REQUIRED");
    const primary = byId.get(rule.primaryBuildingId);
    const duplicate = byId.get(rule.duplicateBuildingId);
    if (!primary || !duplicate) throw new Error("CONFLATE_RULE_TARGET_NOT_FOUND");
    if (rule.primaryBuildingId === rule.duplicateBuildingId)
      throw new Error("CONFLATE_RULE_SELF_REFERENCE");
    if (primary.sourceIndex !== 0 || duplicate.sourceIndex === 0) {
      throw new Error("CONFLATE_RULE_SOURCE_ROLE_INVALID");
    }
    if (removals.has(rule.duplicateBuildingId)) throw new Error("CONFLATE_DUPLICATE_RULE_TARGET");
    removals.add(rule.duplicateBuildingId);
    resolved.push({ ...rule });
  }

  for (let sourceIndex = 1; sourceIndex < worlds.length; sourceIndex += 1) {
    const source = worlds[sourceIndex]!;
    appendUniqueById(
      world.buildings,
      source.buildings.filter((building) => !removals.has(building.localId)),
      "BUILDING",
    );
    appendUniqueById(world.roads, source.roads, "ROAD");
    appendUniqueById(world.lots, source.lots, "LOT");
    world.trees ??= [];
    world.props ??= [];
    appendUniqueById(world.trees, source.trees ?? [], "TREE");
    appendUniqueById(world.props, source.props ?? [], "PROP");
  }

  const sourceMetadata = worlds.flatMap((source) => source.manifest.sources ?? []);
  const sourceNamespaces = new Set<string>();
  for (const source of sourceMetadata) {
    if (sourceNamespaces.has(source.namespace))
      throw new Error("CONFLATE_SOURCE_NAMESPACE_DUPLICATE");
    sourceNamespaces.add(source.namespace);
  }
  const licences = [...new Set(worlds.flatMap((source) => source.manifest.licences))].sort();
  const sourceCount =
    sourceMetadata.length ||
    worlds.reduce((sum, source) => sum + source.manifest.coverage.sourceCount, 0);
  const revisionParts = sourceMetadata.length
    ? sourceMetadata
        .map((source: WorldSourceMetadata) => `${source.namespace}@${source.revision}`)
        .sort()
    : worlds.map((source) => source.manifest.datasetRevision);
  world.manifest = {
    ...world.manifest,
    datasetRevision: revisionParts.join("+").slice(0, 512),
    isSynthetic: worlds.every((source) => source.manifest.isSynthetic),
    licences,
    ...(sourceMetadata.length > 0 ? { sources: sourceMetadata } : {}),
    coverage: {
      quality: combinedQuality(worlds.map((source) => source.manifest.coverage.quality)),
      sourceCount,
    },
  };

  const resolvedPairs = new Set(
    resolved.map((entry) => [entry.primaryBuildingId, entry.duplicateBuildingId].sort().join("::")),
  );
  const unresolved: ConflationCandidate[] = [];
  for (let first = 0; first < world.buildings.length; first += 1) {
    for (let second = first + 1; second < world.buildings.length; second += 1) {
      const a = world.buildings[first]!;
      const b = world.buildings[second]!;
      const pairKey = [a.localId, b.localId].sort().join("::");
      if (resolvedPairs.has(pairKey)) continue;
      // This is a candidate metric on axis-aligned bounds, not footprint IoU.
      const iou = boundsIou(a, b);
      if (iou >= 0.7) unresolved.push({ buildingIds: [a.localId, b.localId], boundsIou: iou });
    }
  }

  return { world, report: { resolved, unresolved } };
}
