import {
  segmentsIntersect,
  surfaceAreaIntersects,
  surfaceIntersects,
  validateSurfaceGeometry,
} from "./geometry";
import {
  WORLD_SCHEMA_VERSION,
  type Building,
  type SurfaceGeometry,
  type WorldData,
} from "./schema";

export type WorldIssueSeverity = "error" | "warning";

export interface WorldIssue {
  severity: WorldIssueSeverity;
  code: string;
  featureIds: string[];
}

export interface WorldValidationReport {
  valid: boolean;
  issues: WorldIssue[];
}

function addGeometryIssues(
  issues: WorldIssue[],
  featureId: string,
  featureType: string,
  geometry: SurfaceGeometry,
) {
  for (const issue of validateSurfaceGeometry(geometry)) {
    issues.push({ severity: "error", code: `${featureType}_${issue}`, featureIds: [featureId] });
  }
}

function addUniqueIds(issues: WorldIssue[], ids: string[], featureType: string) {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      issues.push({ severity: "error", code: `DUPLICATE_${featureType}_ID`, featureIds: [id] });
    }
    seen.add(id);
  }
}

function validateBuilding(issues: WorldIssue[], building: Building) {
  addGeometryIssues(issues, building.localId, "BUILDING", building.geometry);
  if (!Number.isFinite(building.wallHeight) || building.wallHeight < 0) {
    issues.push({
      severity: "error",
      code: "BUILDING_INVALID_WALL_HEIGHT",
      featureIds: [building.localId],
    });
  }
  if (building.parts && building.parts.length > 0) {
    addUniqueIds(
      issues,
      building.parts.map((part) => part.localId),
      "BUILDING_PART",
    );
    building.parts.forEach((part) => {
      addGeometryIssues(issues, part.localId, "BUILDING_PART", part.geometry);
      if (!Number.isFinite(part.wallHeight) || part.wallHeight < 0) {
        issues.push({
          severity: "error",
          code: "BUILDING_PART_INVALID_WALL_HEIGHT",
          featureIds: [part.localId],
        });
      }
    });
    for (let first = 0; first < building.parts.length; first += 1) {
      for (let second = first + 1; second < building.parts.length; second += 1) {
        const a = building.parts[first]!;
        const b = building.parts[second]!;
        const aBase = a.baseElevation ?? building.baseElevation ?? 0;
        const aTop = aBase + a.wallHeight;
        const bBase = b.baseElevation ?? building.baseElevation ?? 0;
        const bTop = bBase + b.wallHeight;
        const verticalOverlap = Math.min(aTop, bTop) - Math.max(aBase, bBase) > 1e-4;
        if (verticalOverlap && surfaceAreaIntersects(a.geometry, b.geometry)) {
          issues.push({
            severity: "error",
            code: "BUILDING_PARTS_OVERLAP",
            featureIds: [building.localId, a.localId, b.localId],
          });
        }
      }
    }
  }
}

function roadsCross(first: WorldData["roads"][number], second: WorldData["roads"][number]) {
  for (let a = 0; a < first.polylineENU.length - 1; a += 1) {
    for (let b = 0; b < second.polylineENU.length - 1; b += 1) {
      const startA = first.polylineENU[a];
      const endA = first.polylineENU[a + 1];
      const startB = second.polylineENU[b];
      const endB = second.polylineENU[b + 1];
      if (startA && endA && startB && endB && segmentsIntersect(startA, endA, startB, endB))
        return true;
    }
  }
  return false;
}

export function validateWorld(world: WorldData): WorldValidationReport {
  const issues: WorldIssue[] = [];
  if (world.manifest.schemaVersion !== WORLD_SCHEMA_VERSION) {
    issues.push({ severity: "error", code: "UNSUPPORTED_WORLD_SCHEMA_VERSION", featureIds: [] });
  }
  if (world.manifest.units !== "metres") {
    issues.push({ severity: "error", code: "WORLD_UNITS_MUST_BE_METRES", featureIds: [] });
  }
  if (world.manifest.frameConvention !== "ENU_X_EAST_Y_UP_NEG_Z_NORTH") {
    issues.push({ severity: "error", code: "WORLD_FRAME_CONVENTION_INVALID", featureIds: [] });
  }
  if (
    world.manifest.licences.length === 0 ||
    world.manifest.licences.some((licence) => !licence.trim())
  ) {
    issues.push({ severity: "error", code: "WORLD_LICENCE_REQUIRED", featureIds: [] });
  }
  addUniqueIds(
    issues,
    world.manifest.chunks.map((chunk) => chunk.localId),
    "WORLD_CHUNK",
  );
  world.manifest.chunks.forEach((chunk) => {
    const [minX, minZ, maxX, maxZ] = chunk.bounds;
    if (![minX, minZ, maxX, maxZ].every(Number.isFinite) || minX >= maxX || minZ >= maxZ) {
      issues.push({
        severity: "error",
        code: "WORLD_CHUNK_BOUNDS_INVALID",
        featureIds: [chunk.localId],
      });
    }
  });

  addUniqueIds(
    issues,
    world.buildings.map((building) => building.localId),
    "BUILDING",
  );
  addUniqueIds(
    issues,
    world.lots.map((lot) => lot.localId),
    "LOT",
  );
  addUniqueIds(
    issues,
    world.roads.map((road) => road.localId),
    "ROAD",
  );
  world.buildings.forEach((building) => validateBuilding(issues, building));

  world.lots.forEach((lot) => {
    addGeometryIssues(issues, lot.localId, "LOT", lot.geometry);
    if (!lot.confirmed) {
      issues.push({ severity: "warning", code: "LOT_UNCONFIRMED", featureIds: [lot.localId] });
    }
  });

  const roadIds = new Set(world.roads.map((road) => road.localId));
  world.roads.forEach((road) => {
    if (road.polylineENU.length < 2) {
      issues.push({
        severity: "error",
        code: "ROAD_POLYLINE_TOO_SHORT",
        featureIds: [road.localId],
      });
    }
    if (road.polylineENU.some(([x, z]) => !Number.isFinite(x) || !Number.isFinite(z))) {
      issues.push({
        severity: "error",
        code: "ROAD_POLYLINE_NON_FINITE",
        featureIds: [road.localId],
      });
    }
    if (road.carriagewayWidth !== undefined && road.carriagewayWidth <= 0) {
      issues.push({
        severity: "error",
        code: "ROAD_INVALID_CARRIAGEWAY_WIDTH",
        featureIds: [road.localId],
      });
    }
    road.connectorIds.forEach((connectorId) => {
      if (!roadIds.has(connectorId)) {
        issues.push({
          severity: "error",
          code: "ROAD_CONNECTOR_NOT_FOUND",
          featureIds: [road.localId, connectorId],
        });
      }
    });
  });

  for (let first = 0; first < world.roads.length; first += 1) {
    for (let second = first + 1; second < world.roads.length; second += 1) {
      const a = world.roads[first]!;
      const b = world.roads[second]!;
      if (a.elevationLayer !== b.elevationLayer || !roadsCross(a, b)) continue;
      const connected = a.connectorIds.includes(b.localId) || b.connectorIds.includes(a.localId);
      if (!connected) {
        issues.push({
          severity: "warning",
          code: "ROAD_INTERSECTION_UNLINKED",
          featureIds: [a.localId, b.localId],
        });
      }
    }
  }

  const confirmedEmptyLots = world.lots.filter((lot) => lot.confirmed && lot.status === "empty");
  for (const building of world.buildings) {
    if (building.hidden) continue;
    const renderGeometries = building.parts?.length
      ? building.parts.map((part) => ({ localId: part.localId, geometry: part.geometry }))
      : [{ localId: building.localId, geometry: building.geometry }];
    for (const lot of confirmedEmptyLots) {
      for (const part of renderGeometries) {
        if (surfaceAreaIntersects(part.geometry, lot.geometry)) {
          issues.push({
            severity: "error",
            code: "BUILDING_INTERSECTS_CONFIRMED_EMPTY_LOT",
            featureIds: [building.localId, lot.localId],
          });
        }
      }
    }
  }

  return { valid: !issues.some((issue) => issue.severity === "error"), issues };
}
