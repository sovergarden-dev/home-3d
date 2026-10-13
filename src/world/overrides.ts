import { cloneSurfaceGeometry, validateSurfaceGeometry } from "./geometry";
import { WORLD_SCHEMA_VERSION, type WorldData, type WorldOverrideDocument } from "./schema";

export interface OverrideApplicationResult {
  world: WorldData;
  issues: string[];
}

export function applyWorldOverrides(
  source: WorldData,
  document: WorldOverrideDocument | undefined,
): OverrideApplicationResult {
  const world = structuredClone(source) as WorldData;
  if (!document) return { world, issues: [] };

  const issues: string[] = [];
  if (document.schemaVersion !== WORLD_SCHEMA_VERSION) {
    return { world, issues: ["OVERRIDE_SCHEMA_VERSION_UNSUPPORTED"] };
  }

  const seen = new Set<string>();
  const ordered = [...document.overrides].sort(
    (a, b) => a.revision - b.revision || a.localId.localeCompare(b.localId),
  );

  for (const override of ordered) {
    if (seen.has(override.localId)) {
      issues.push(`OVERRIDE_DUPLICATE_ID:${override.localId}`);
      continue;
    }
    seen.add(override.localId);
    if (!Number.isInteger(override.revision) || override.revision < 1) {
      issues.push(`OVERRIDE_INVALID_REVISION:${override.localId}`);
      continue;
    }
    if (!override.reason.trim()) {
      issues.push(`OVERRIDE_REASON_REQUIRED:${override.localId}`);
      continue;
    }

    const patch = override.patch;
    if (patch.operation === "patch_building") {
      const building = world.buildings.find((item) => item.localId === patch.featureId);
      if (!building) {
        issues.push(`OVERRIDE_TARGET_NOT_FOUND:${patch.featureId}`);
        continue;
      }
      Object.assign(building, patch.patch);
      continue;
    }

    if (patch.operation === "replace_building_geometry") {
      const building = world.buildings.find((item) => item.localId === patch.featureId);
      if (!building) {
        issues.push(`OVERRIDE_TARGET_NOT_FOUND:${patch.featureId}`);
        continue;
      }
      const geometryIssues = validateSurfaceGeometry(patch.geometry);
      if (geometryIssues.length > 0) {
        issues.push(`OVERRIDE_GEOMETRY_INVALID:${patch.featureId}`);
        continue;
      }
      building.geometry = cloneSurfaceGeometry(patch.geometry);
      continue;
    }

    if (patch.operation === "patch_road") {
      const road = world.roads.find((item) => item.localId === patch.featureId);
      if (!road) {
        issues.push(`OVERRIDE_TARGET_NOT_FOUND:${patch.featureId}`);
        continue;
      }
      Object.assign(road, patch.patch);
      continue;
    }

    const lot = world.lots.find((item) => item.localId === patch.featureId);
    if (!lot) {
      issues.push(`OVERRIDE_TARGET_NOT_FOUND:${patch.featureId}`);
      continue;
    }
    const geometryIssues = validateSurfaceGeometry(patch.geometry);
    if (geometryIssues.length > 0) {
      issues.push(`OVERRIDE_GEOMETRY_INVALID:${patch.featureId}`);
      continue;
    }
    lot.geometry = cloneSurfaceGeometry(patch.geometry);
  }

  return { world, issues };
}
