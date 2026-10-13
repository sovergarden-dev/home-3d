import { geodeticToEnu, type GeodeticPoint } from "../../src/geo/enu";
import {
  WORLD_SCHEMA_VERSION,
  type Position2,
  type RoadClass,
  type RoofType,
  type WorldData,
} from "../../src/world/schema";

export interface GeoJsonFeature {
  type: "Feature";
  id?: string | number;
  properties?: Record<string, unknown> | null;
  geometry:
    | { type: "Point"; coordinates: number[] }
    | { type: "LineString"; coordinates: number[][] }
    | { type: "MultiLineString"; coordinates: number[][][] }
    | { type: "Polygon"; coordinates: number[][][] }
    | { type: "MultiPolygon"; coordinates: number[][][][] }
    | null;
}

export interface GeoJsonFeatureCollection {
  type: "FeatureCollection";
  features: GeoJsonFeature[];
}

export interface NormalizeSourceOptions {
  origin: GeodeticPoint;
  datasetRevision: string;
  source: {
    kind: "osm" | "overture" | "survey" | "synthetic";
    revision: string;
    licence: string;
    observedAt?: string;
  };
}

function propertiesOf(feature: GeoJsonFeature) {
  return feature.properties ?? {};
}

function sourceQuality(kind: NormalizeSourceOptions["source"]["kind"]) {
  if (kind === "survey") return "verified" as const;
  if (kind === "synthetic") return "synthetic" as const;
  return "source_only" as const;
}

function provenance(options: NormalizeSourceOptions) {
  return {
    source: options.source.kind,
    quality: sourceQuality(options.source.kind),
    sourceRevision: options.source.revision,
    licence: options.source.licence,
    ...(options.source.observedAt ? { observedAt: options.source.observedAt } : {}),
  };
}

function unknownPropertyProvenance(options: NormalizeSourceOptions) {
  return { ...provenance(options), quality: "unknown" as const };
}

function inferredPropertyProvenance(options: NormalizeSourceOptions) {
  return { ...provenance(options), quality: "inferred" as const };
}

function stableLocalId(prefix: string, feature: GeoJsonFeature, index: number) {
  const input = `${feature.id ?? ""}:${index}:${feature.geometry?.type ?? "null"}`;
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return `${prefix}-${(hash >>> 0).toString(36)}`;
}

function coordinateToEnu(coordinate: number[], origin: GeodeticPoint): Position2 {
  if (coordinate.length < 2 || !Number.isFinite(coordinate[0]) || !Number.isFinite(coordinate[1])) {
    throw new Error("GEOJSON_POSITION_INVALID");
  }
  const enu = geodeticToEnu(
    { longitude: coordinate[0]!, latitude: coordinate[1]!, altitude: coordinate[2] ?? 0 },
    origin,
  );
  return [enu.east, -enu.north];
}

function polygonCoordinates(coordinates: number[][][], origin: GeodeticPoint) {
  return coordinates.map((ring) => ring.map((coordinate) => coordinateToEnu(coordinate, origin)));
}

function numberProperty(properties: Record<string, unknown>, ...names: string[]) {
  for (const name of names) {
    const raw = properties[name];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string") {
      const parsed = Number.parseFloat(raw.replace(/[^0-9.+-]/g, ""));
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function roofType(properties: Record<string, unknown>): RoofType {
  const raw = String(properties["roof:shape"] ?? properties["roof"] ?? "unknown").toLowerCase();
  if (raw.includes("gable")) return "gabled";
  if (raw.includes("hip")) return "hipped";
  if (raw.includes("corrugat") || raw.includes("metal")) return "corrugated";
  if (raw.includes("flat")) return "flat";
  return "unknown";
}

function roadClass(properties: Record<string, unknown>): RoadClass {
  const raw = String(properties["highway"] ?? "unknown").toLowerCase();
  if (["primary", "secondary", "tertiary"].includes(raw))
    return raw === "primary" ? "primary" : "secondary";
  if (["residential", "living_street"].includes(raw)) return "residential";
  if (["service", "track"].includes(raw)) return "service";
  if (["footway", "path", "steps", "pedestrian"].includes(raw)) return "alley";
  return "unknown";
}

function direction(properties: Record<string, unknown>) {
  const raw = String(properties["oneway"] ?? "").toLowerCase();
  if (["yes", "true", "1"].includes(raw)) return "forward" as const;
  if (raw === "-1") return "reverse" as const;
  if (["no", "false", "0"].includes(raw)) return "both" as const;
  return "unknown" as const;
}

function roadLines(feature: GeoJsonFeature): number[][][] {
  if (!feature.geometry) return [];
  if (feature.geometry.type === "LineString") return [feature.geometry.coordinates];
  if (feature.geometry.type === "MultiLineString") return feature.geometry.coordinates;
  return [];
}

export function normalizeGeoJsonSource(
  input: GeoJsonFeatureCollection,
  options: NormalizeSourceOptions,
): WorldData {
  if (input.type !== "FeatureCollection" || !Array.isArray(input.features)) {
    throw new Error("GEOJSON_FEATURE_COLLECTION_REQUIRED");
  }
  if (
    !options.datasetRevision.trim() ||
    !options.source.revision.trim() ||
    !options.source.licence.trim()
  ) {
    throw new Error("SOURCE_METADATA_REQUIRED");
  }

  const source = provenance(options);
  const world: WorldData = {
    manifest: {
      schemaVersion: WORLD_SCHEMA_VERSION,
      datasetRevision: options.datasetRevision,
      units: "metres",
      frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
      isSynthetic: options.source.kind === "synthetic",
      chunks: [],
      assetHashes: {},
      licences: [options.source.licence],
      coverage: { quality: source.quality, sourceCount: 1 },
    },
    roads: [],
    buildings: [],
    lots: [],
  };

  input.features.forEach((feature, index) => {
    if (!feature.geometry) return;
    const properties = propertiesOf(feature);
    if (feature.geometry.type === "Polygon" || feature.geometry.type === "MultiPolygon") {
      const geometry =
        feature.geometry.type === "Polygon"
          ? {
              type: "Polygon" as const,
              coordinates: polygonCoordinates(feature.geometry.coordinates, options.origin),
            }
          : {
              type: "MultiPolygon" as const,
              coordinates: feature.geometry.coordinates.map((polygon) =>
                polygonCoordinates(polygon, options.origin),
              ),
            };
      const levels = numberProperty(properties, "building:levels", "levels");
      const explicitHeight = numberProperty(properties, "height", "building:height");
      const hasHeight = explicitHeight !== undefined || levels !== undefined;
      world.buildings.push({
        localId: stableLocalId("building", feature, index),
        geometry,
        footprintKind: properties["building:part"] ? "unknown" : "footprint",
        wallHeight: explicitHeight ?? (levels === undefined ? 6 : levels * 3.2),
        ...(levels === undefined ? {} : { levels }),
        roofType: roofType(properties),
        provenance: source,
        attributes: {
          wallHeight: hasHeight ? source : inferredPropertyProvenance(options),
          roofType:
            properties["roof:shape"] || properties["roof"]
              ? source
              : unknownPropertyProvenance(options),
        },
      });
      return;
    }

    roadLines(feature).forEach((line, lineIndex) => {
      const width = numberProperty(properties, "width");
      const sidewalk = numberProperty(properties, "sidewalk:width");
      world.roads.push({
        localId: `${stableLocalId("road", feature, index)}-${lineIndex}`,
        polylineENU: line.map((coordinate) => coordinateToEnu(coordinate, options.origin)),
        connectorIds: [],
        roadClass: roadClass(properties),
        ...(width === undefined ? {} : { carriagewayWidth: width }),
        ...(sidewalk === undefined
          ? {}
          : { sidewalkWidths: [sidewalk, sidewalk] as [number, number] }),
        elevationLayer: 0,
        direction: direction(properties),
        surface: "unknown",
        provenance: source,
        attributes: {
          carriagewayWidth: width === undefined ? unknownPropertyProvenance(options) : source,
          direction:
            properties["oneway"] === undefined ? unknownPropertyProvenance(options) : source,
        },
      });
    });
  });

  return world;
}
