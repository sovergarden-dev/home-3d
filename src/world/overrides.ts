import { cloneSurfaceGeometry, validateSurfaceGeometry } from "./geometry";
import {
  WORLD_SCHEMA_VERSION,
  type Provenance,
  type QualityStatus,
  type SourceKind,
  type SurfaceGeometry,
  type WorldData,
  type WorldOverride,
  type WorldOverrideDocument,
} from "./schema";

export interface OverrideApplicationResult {
  world: WorldData;
  issues: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isSurfaceGeometry(value: unknown): value is SurfaceGeometry {
  if (!isRecord(value)) return false;
  if (value["type"] !== "Polygon" && value["type"] !== "MultiPolygon") return false;
  return Array.isArray(value["coordinates"]);
}

function setFieldProvenance(
  target: { provenance: Provenance; attributes?: Record<string, Provenance> },
  field: string,
  provenance: Provenance,
) {
  const sourceNamespace = provenance.sourceNamespace ?? target.provenance.sourceNamespace;
  const { sourceNamespace: _ignoredSourceNamespace, ...provenanceFields } = provenance;
  const fieldProvenance: Provenance = {
    ...provenanceFields,
    ...(sourceNamespace === undefined ? {} : { sourceNamespace }),
  };
  target.attributes = { ...target.attributes, [field]: structuredClone(fieldProvenance) };
}

export function isProvenance(value: unknown): value is Provenance {
  if (!isRecord(value)) return false;
  const sources: SourceKind[] = [
    "synthetic",
    "survey",
    "osm",
    "overture",
    "open_buildings",
    "manual_override",
  ];
  const qualities: QualityStatus[] = [
    "synthetic",
    "verified",
    "source_only",
    "inferred",
    "unknown",
    "conflict",
  ];
  const allowed = [
    "source",
    "quality",
    "sourceNamespace",
    "observedAt",
    "sourceRevision",
    "licence",
  ];
  return (
    Object.keys(value).every((field) => allowed.includes(field)) &&
    sources.includes(value["source"] as SourceKind) &&
    qualities.includes(value["quality"] as QualityStatus) &&
    allowed
      .slice(2)
      .every((field) => value[field] === undefined || typeof value[field] === "string")
  );
}

const BUILDING_PATCH_FIELDS = [
  "baseElevation",
  "wallHeight",
  "roofHeight",
  "levels",
  "roofType",
  "hidden",
] as const;
const PART_PATCH_FIELDS = [
  "baseElevation",
  "wallHeight",
  "roofHeight",
  "levels",
  "roofType",
] as const;
const ROAD_PATCH_FIELDS = [
  "polylineENU",
  "connectorIds",
  "baseElevation",
  "carriagewayWidth",
  "sidewalkWidths",
  "medianWidth",
  "direction",
] as const;
const ROOF_TYPES = ["flat", "terrace_tum", "gabled", "hipped", "corrugated", "unknown"];
const DIRECTIONS = ["both", "forward", "reverse", "unknown"];
function isFiniteNumber(value: unknown, minimum = -Infinity) {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum;
}
function isPatchFieldValue(field: string, value: unknown) {
  if (field === "baseElevation") return isFiniteNumber(value);
  if (field === "wallHeight" || field === "roofHeight") return isFiniteNumber(value, 0);
  if (field === "levels") return typeof value === "number" && Number.isInteger(value) && value >= 0;
  if (field === "roofType")
    return typeof value === "string" && (ROOF_TYPES as readonly string[]).includes(value);
  if (field === "hidden") return typeof value === "boolean";
  if (field === "polylineENU")
    return (
      Array.isArray(value) &&
      value.length >= 2 &&
      value.every(
        (point) =>
          Array.isArray(point) &&
          point.length === 2 &&
          point.every((coordinate) => isFiniteNumber(coordinate)),
      )
    );
  if (field === "connectorIds")
    return Array.isArray(value) && value.every((id) => typeof id === "string");
  if (field === "carriagewayWidth")
    return isFiniteNumber(value, 0) && typeof value === "number" && value > 0;
  if (field === "medianWidth") return isFiniteNumber(value, 0);
  if (field === "sidewalkWidths")
    return (
      Array.isArray(value) && value.length === 2 && value.every((width) => isFiniteNumber(width, 0))
    );
  if (field === "direction")
    return typeof value === "string" && (DIRECTIONS as readonly string[]).includes(value);
  return false;
}
function validatePatchFields(
  patch: Record<string, unknown>,
  allowedFields: readonly string[],
  overrideId: string,
) {
  for (const field of Object.keys(patch)) {
    if (!allowedFields.includes(field))
      return `OVERRIDE_PATCH_FIELD_UNSUPPORTED:${overrideId}:${field}`;
    if (!isPatchFieldValue(field, patch[field]))
      return `OVERRIDE_PATCH_FIELD_INVALID:${overrideId}:${field}`;
  }
  return null;
}
function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]) {
  const expected = [...keys].sort();
  const actual = Object.keys(value).sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

export function applyWorldOverrides(
  source: WorldData,
  document: WorldOverrideDocument | undefined,
): OverrideApplicationResult {
  const world = structuredClone(source) as WorldData;
  if (!document) return { world, issues: [] };

  const rawDocument: unknown = document;
  if (!isRecord(rawDocument)) return { world, issues: ["OVERRIDE_DOCUMENT_INVALID"] };
  if (rawDocument["schemaVersion"] !== WORLD_SCHEMA_VERSION) {
    return { world, issues: ["OVERRIDE_SCHEMA_VERSION_UNSUPPORTED"] };
  }
  const rawOverrides = rawDocument["overrides"];
  if (!Array.isArray(rawOverrides)) return { world, issues: ["OVERRIDE_LIST_INVALID"] };

  const issues: string[] = [];
  const ordered = rawOverrides
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) => {
      const revision = (entry: unknown) =>
        isRecord(entry) && typeof entry["revision"] === "number" ? entry["revision"] : Infinity;
      const localId = (entry: unknown) =>
        isRecord(entry) && typeof entry["localId"] === "string" ? entry["localId"] : "";
      return (
        revision(a.entry) - revision(b.entry) ||
        localId(a.entry).localeCompare(localId(b.entry)) ||
        a.index - b.index
      );
    });

  const seen = new Set<string>();
  for (const item of ordered) {
    if (!isRecord(item.entry)) {
      issues.push("OVERRIDE_ENTRY_INVALID");
      continue;
    }
    const override = item.entry as unknown as WorldOverride;
    if (typeof override.localId !== "string" || !override.localId.trim()) {
      issues.push("OVERRIDE_ID_REQUIRED");
      continue;
    }
    if (seen.has(override.localId)) {
      issues.push(`OVERRIDE_DUPLICATE_ID:${override.localId}`);
      continue;
    }
    seen.add(override.localId);
    if (!Number.isInteger(override.revision) || override.revision < 1) {
      issues.push(`OVERRIDE_INVALID_REVISION:${override.localId}`);
      continue;
    }
    if (typeof override.reason !== "string" || !override.reason.trim()) {
      issues.push(`OVERRIDE_REASON_REQUIRED:${override.localId}`);
      continue;
    }
    const rawProvenance: unknown = override.provenance;
    const provenance =
      rawProvenance === undefined
        ? ({ source: "manual_override", quality: "inferred" } as const)
        : isProvenance(rawProvenance)
          ? rawProvenance
          : null;
    if (!provenance) {
      issues.push(`OVERRIDE_PROVENANCE_INVALID:${override.localId}`);
      continue;
    }
    if (!isRecord(override.patch) || typeof override.patch.operation !== "string") {
      issues.push(`OVERRIDE_PATCH_INVALID:${override.localId}`);
      continue;
    }

    const patch = override.patch;
    if (patch.operation === "patch_building") {
      if (
        !hasExactKeys(patch, ["operation", "featureId", "patch"]) ||
        typeof patch.featureId !== "string"
      ) {
        issues.push(`OVERRIDE_PATCH_INVALID:${override.localId}`);
        continue;
      }
      const building = world.buildings.find((item) => item.localId === patch.featureId);
      if (!building) {
        issues.push(`OVERRIDE_TARGET_NOT_FOUND:${patch.featureId}`);
        continue;
      }
      if (!isRecord(patch.patch)) {
        issues.push(`OVERRIDE_PATCH_INVALID:${override.localId}`);
        continue;
      }
      const fieldIssue = validatePatchFields(patch.patch, BUILDING_PATCH_FIELDS, override.localId);
      if (fieldIssue) {
        issues.push(fieldIssue);
        continue;
      }
      const renderedPartFields = [
        "baseElevation",
        "wallHeight",
        "roofHeight",
        "levels",
        "roofType",
      ];
      if (
        building.parts?.length &&
        Object.keys(patch.patch).some((field) => renderedPartFields.includes(field))
      ) {
        issues.push(`OVERRIDE_PARENT_PARTS_NOT_RENDERED:${patch.featureId}`);
        continue;
      }
      Object.assign(building, patch.patch);
      Object.keys(patch.patch).forEach((field) => setFieldProvenance(building, field, provenance));
      continue;
    }

    if (patch.operation === "replace_building_geometry") {
      if (
        !hasExactKeys(patch, ["operation", "featureId", "geometry"]) ||
        typeof patch.featureId !== "string"
      ) {
        issues.push(`OVERRIDE_PATCH_INVALID:${override.localId}`);
        continue;
      }
      const building = world.buildings.find((item) => item.localId === patch.featureId);
      if (!building) {
        issues.push(`OVERRIDE_TARGET_NOT_FOUND:${patch.featureId}`);
        continue;
      }
      if (building.parts?.length) {
        issues.push(`OVERRIDE_PARENT_GEOMETRY_REQUIRES_PART_EDITS:${patch.featureId}`);
        continue;
      }
      if (
        !isSurfaceGeometry(patch.geometry) ||
        validateSurfaceGeometry(patch.geometry).length > 0
      ) {
        issues.push(`OVERRIDE_GEOMETRY_INVALID:${patch.featureId}`);
        continue;
      }
      building.geometry = cloneSurfaceGeometry(patch.geometry);
      setFieldProvenance(building, "geometry", provenance);
      continue;
    }

    if (patch.operation === "patch_building_part") {
      if (
        !hasExactKeys(patch, ["operation", "buildingId", "partId", "patch"]) ||
        typeof patch.buildingId !== "string" ||
        typeof patch.partId !== "string"
      ) {
        issues.push(`OVERRIDE_PATCH_INVALID:${override.localId}`);
        continue;
      }
      const building = world.buildings.find((item) => item.localId === patch.buildingId);
      const part = building?.parts?.find((item) => item.localId === patch.partId);
      if (!building || !part) {
        issues.push(`OVERRIDE_PART_TARGET_NOT_FOUND:${patch.buildingId}:${patch.partId}`);
        continue;
      }
      if (!isRecord(patch.patch)) {
        issues.push(`OVERRIDE_PATCH_INVALID:${override.localId}`);
        continue;
      }
      const fieldIssue = validatePatchFields(patch.patch, PART_PATCH_FIELDS, override.localId);
      if (fieldIssue) {
        issues.push(fieldIssue);
        continue;
      }
      Object.assign(part, patch.patch);
      Object.keys(patch.patch).forEach((field) => setFieldProvenance(part, field, provenance));
      continue;
    }

    if (patch.operation === "replace_building_part_geometry") {
      if (
        !hasExactKeys(patch, ["operation", "buildingId", "partId", "geometry"]) ||
        typeof patch.buildingId !== "string" ||
        typeof patch.partId !== "string"
      ) {
        issues.push(`OVERRIDE_PATCH_INVALID:${override.localId}`);
        continue;
      }
      const building = world.buildings.find((item) => item.localId === patch.buildingId);
      const part = building?.parts?.find((item) => item.localId === patch.partId);
      if (!building || !part) {
        issues.push(`OVERRIDE_PART_TARGET_NOT_FOUND:${patch.buildingId}:${patch.partId}`);
        continue;
      }
      if (
        !isSurfaceGeometry(patch.geometry) ||
        validateSurfaceGeometry(patch.geometry).length > 0
      ) {
        issues.push(`OVERRIDE_GEOMETRY_INVALID:${patch.buildingId}:${patch.partId}`);
        continue;
      }
      part.geometry = cloneSurfaceGeometry(patch.geometry);
      setFieldProvenance(part, "geometry", provenance);
      continue;
    }

    if (patch.operation === "patch_road") {
      if (
        !hasExactKeys(patch, ["operation", "featureId", "patch"]) ||
        typeof patch.featureId !== "string"
      ) {
        issues.push(`OVERRIDE_PATCH_INVALID:${override.localId}`);
        continue;
      }
      const road = world.roads.find((item) => item.localId === patch.featureId);
      if (!road) {
        issues.push(`OVERRIDE_TARGET_NOT_FOUND:${patch.featureId}`);
        continue;
      }
      if (!isRecord(patch.patch)) {
        issues.push(`OVERRIDE_PATCH_INVALID:${override.localId}`);
        continue;
      }
      const fieldIssue = validatePatchFields(patch.patch, ROAD_PATCH_FIELDS, override.localId);
      if (fieldIssue) {
        issues.push(fieldIssue);
        continue;
      }
      Object.assign(road, patch.patch);
      Object.keys(patch.patch).forEach((field) => setFieldProvenance(road, field, provenance));
      continue;
    }

    if (patch.operation === "replace_lot_geometry") {
      if (
        !hasExactKeys(patch, ["operation", "featureId", "geometry"]) ||
        typeof patch.featureId !== "string"
      ) {
        issues.push(`OVERRIDE_PATCH_INVALID:${override.localId}`);
        continue;
      }
      const lot = world.lots.find((item) => item.localId === patch.featureId);
      if (!lot) {
        issues.push(`OVERRIDE_TARGET_NOT_FOUND:${patch.featureId}`);
        continue;
      }
      if (
        !isSurfaceGeometry(patch.geometry) ||
        validateSurfaceGeometry(patch.geometry).length > 0
      ) {
        issues.push(`OVERRIDE_GEOMETRY_INVALID:${patch.featureId}`);
        continue;
      }
      lot.geometry = cloneSurfaceGeometry(patch.geometry);
      setFieldProvenance(lot, "geometry", provenance);
      continue;
    }

    issues.push(`OVERRIDE_OPERATION_UNSUPPORTED:${override.localId}`);
  }

  return { world, issues };
}
