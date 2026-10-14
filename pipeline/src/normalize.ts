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

function geometryFingerprint(geometry: GeoJsonFeature["geometry"]): string {
  if (!geometry) return "null";
  if (geometry.type === "Point") {
    return `pt:${geometry.coordinates[0]?.toFixed(5)}_${geometry.coordinates[1]?.toFixed(5)}`;
  }
  if (geometry.type === "LineString") {
    const coords = geometry.coordinates;
    const start = coords[0] ? `${coords[0][0]?.toFixed(5)}_${coords[0][1]?.toFixed(5)}` : "";
    const end = coords.at(-1)
      ? `${coords.at(-1)![0]?.toFixed(5)}_${coords.at(-1)![1]?.toFixed(5)}`
      : "";
    return `ls:${coords.length}:${start}:${end}`;
  }
  if (geometry.type === "Polygon") {
    const ring = geometry.coordinates[0] ?? [];
    const len = ring.length;
    const p0 = ring[0] ? `${ring[0][0]?.toFixed(5)}_${ring[0][1]?.toFixed(5)}` : "";
    const pMid = ring[Math.floor(len / 2)]
      ? `${ring[Math.floor(len / 2)]![0]?.toFixed(5)}_${ring[Math.floor(len / 2)]![1]?.toFixed(5)}`
      : "";
    return `poly:${len}:${p0}:${pMid}`;
  }
  if (geometry.type === "MultiPolygon") {
    const firstPoly = geometry.coordinates[0]?.[0] ?? [];
    return `mpoly:${geometry.coordinates.length}:${firstPoly.length}`;
  }
  return "other";
}

function stableLocalId(prefix: string, feature: GeoJsonFeature, lineIndex?: number) {
  if (feature.id !== undefined && feature.id !== null && String(feature.id).trim() !== "") {
    const sanitized = String(feature.id)
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "_");
    const suffix = lineIndex !== undefined ? `-${lineIndex}` : "";
    return `${prefix}-${sanitized}${suffix}`;
  }
  const input = `${prefix}:${feature.geometry?.type ?? "null"}:${geometryFingerprint(feature.geometry)}`;
  let hash = 2166136261;
  for (const character of input) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = lineIndex !== undefined ? `-${lineIndex}` : "";
  return `${prefix}-${(hash >>> 0).toString(36)}${suffix}`;
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

function defaultRoadWidth(rClass: RoadClass): number {
  switch (rClass) {
    case "primary":
      return 12;
    case "secondary":
      return 9;
    case "residential":
      return 6;
    case "service":
      return 4;
    case "alley":
      return 3;
    default:
      return 5;
  }
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

      // Check if feature is marked as a lot
      const isLot =
        properties["lot"] !== undefined ||
        properties["boundary"] === "lot" ||
        properties["landuse"] === "residential_lot" ||
        properties["landuse"] === "lot";
      if (isLot) {
        const status = properties["status"] === "empty" ? ("empty" as const) : ("final" as const);
        world.lots.push({
          localId: stableLocalId("lot", feature),
          geometry,
          confirmed: Boolean(properties["confirmed"] ?? status === "empty"),
          status,
          provenance: source,
        });
        return;
      }

      const levels = numberProperty(properties, "building:levels", "levels");
      const explicitHeight = numberProperty(properties, "height", "building:height");
      const hasHeight = explicitHeight !== undefined || levels !== undefined;
      const isPart =
        properties["building:part"] !== undefined && properties["building:part"] !== "no";

      if (isPart) {
        // If it is a part, look for an existing building to attach, or create one
        const parentId =
          properties["building:parent"] ?? properties["parent"] ?? properties["building"];
        const parentBuilding =
          typeof parentId === "string"
            ? world.buildings.find((b) => b.localId.includes(parentId))
            : undefined;

        const partItem = {
          localId: stableLocalId("part", feature),
          geometry,
          wallHeight: explicitHeight ?? (levels === undefined ? 4 : levels * 3.2),
          ...(levels === undefined ? {} : { levels }),
          roofType: roofType(properties),
          provenance: source,
        };

        if (parentBuilding) {
          if (!parentBuilding.parts) parentBuilding.parts = [];
          parentBuilding.parts.push(partItem);
        } else {
          // Push as building with parts container
          world.buildings.push({
            localId: stableLocalId("building", feature),
            geometry,
            footprintKind: "unknown",
            wallHeight: partItem.wallHeight,
            ...(levels === undefined ? {} : { levels }),
            roofType: partItem.roofType,
            provenance: source,
            attributes: {
              wallHeight: hasHeight ? source : inferredPropertyProvenance(options),
              roofType:
                properties["roof:shape"] || properties["roof"]
                  ? source
                  : unknownPropertyProvenance(options),
            },
            parts: [partItem],
          });
        }
        return;
      }

      world.buildings.push({
        localId: stableLocalId("building", feature),
        geometry,
        footprintKind: "footprint",
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
      const explicitWidth = numberProperty(properties, "width");
      const hasWidth = explicitWidth !== undefined && explicitWidth > 0;
      const rClass = roadClass(properties);
      const carriagewayWidth = hasWidth ? explicitWidth : defaultRoadWidth(rClass);
      const sidewalk = numberProperty(properties, "sidewalk:width");
      const layerRaw = numberProperty(properties, "layer");
      const bridge = properties["bridge"] ? 1 : 0;
      const tunnel = properties["tunnel"] ? -1 : 0;
      const elevationLayer = Math.round(layerRaw ?? (bridge || tunnel || 0));

      world.roads.push({
        localId: stableLocalId("road", feature, lineIndex),
        polylineENU: line.map((coordinate) => coordinateToEnu(coordinate, options.origin)),
        connectorIds: [],
        roadClass: rClass,
        carriagewayWidth,
        ...(sidewalk === undefined
          ? {}
          : { sidewalkWidths: [sidewalk, sidewalk] as [number, number] }),
        elevationLayer,
        direction: direction(properties),
        surface: "unknown",
        provenance: source,
        attributes: {
          carriagewayWidth: hasWidth ? source : inferredPropertyProvenance(options),
          direction:
            properties["oneway"] === undefined ? unknownPropertyProvenance(options) : source,
        },
      });
    });
  });

  // Calculate road connectors (roads sharing endpoint coordinates within 0.1m)
  for (let i = 0; i < world.roads.length; i++) {
    const r1 = world.roads[i]!;
    const start1 = r1.polylineENU[0];
    const end1 = r1.polylineENU.at(-1);
    if (!start1 || !end1) continue;
    for (let j = i + 1; j < world.roads.length; j++) {
      const r2 = world.roads[j]!;
      const start2 = r2.polylineENU[0];
      const end2 = r2.polylineENU.at(-1);
      if (!start2 || !end2) continue;
      const dist = (p1: Position2, p2: Position2) => Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
      if (
        dist(start1, start2) < 0.1 ||
        dist(start1, end2) < 0.1 ||
        dist(end1, start2) < 0.1 ||
        dist(end1, end2) < 0.1
      ) {
        if (!r1.connectorIds.includes(r2.localId)) r1.connectorIds.push(r2.localId);
        if (!r2.connectorIds.includes(r1.localId)) r2.connectorIds.push(r1.localId);
      }
    }
  }

  return world;
}
