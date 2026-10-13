import { surfaceBounds } from "../../src/world/geometry";
import type { Building, WorldData } from "../../src/world/schema";

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

export function conflateWorlds(worlds: WorldData[], rules: ConflationRule[]): ConflationResult {
  if (worlds.length === 0) throw new Error("CONFLATE_WORLD_REQUIRED");
  const world = cloneWorld(worlds[0]!);
  const sourceBuildings = worlds.flatMap((source) =>
    source.buildings.map((building) => ({ source, building })),
  );
  const byId = new Map(sourceBuildings.map(({ building }) => [building.localId, building]));
  const removals = new Set<string>();
  const resolved: ConflationResolution[] = [];

  for (const rule of rules) {
    if (!rule.reason.trim()) throw new Error("CONFLATE_REASON_REQUIRED");
    if (!byId.has(rule.primaryBuildingId) || !byId.has(rule.duplicateBuildingId)) {
      throw new Error("CONFLATE_RULE_TARGET_NOT_FOUND");
    }
    if (rule.primaryBuildingId === rule.duplicateBuildingId)
      throw new Error("CONFLATE_RULE_SELF_REFERENCE");
    removals.add(rule.duplicateBuildingId);
    resolved.push({ ...rule });
  }

  const allBuildings = sourceBuildings.map(({ building }) => building);
  const selectedIds = new Set(world.buildings.map((building) => building.localId));
  for (const building of allBuildings) {
    if (selectedIds.has(building.localId) || removals.has(building.localId)) continue;
    world.buildings.push(structuredClone(building) as Building);
    selectedIds.add(building.localId);
  }
  world.buildings = world.buildings.filter((building) => !removals.has(building.localId));

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
      const iou = boundsIou(a, b);
      if (iou >= 0.7) {
        unresolved.push({ buildingIds: [a.localId, b.localId], boundsIou: iou });
      }
    }
  }

  return { world, report: { resolved, unresolved } };
}
