import { geodeticToEnu, type GeodeticPoint } from "../../src/geo/enu";
import { surfaceContains, validateSurfaceGeometry } from "../../src/world/geometry";
import {
  WORLD_SCHEMA_VERSION,
  type Building,
  type MultiPolygonGeometry,
  type PolygonGeometry,
  type Position2,
  type RoadClass,
  type RoofType,
  type WorldSourceMetadata,
  type WorldData,
} from "../../src/world/schema";
import { canonicalGeometryFingerprint, legacyLocalId, sha256, stableLocalId } from "./identity";

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
    namespace?: string;
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
    sourceNamespace: options.source.namespace ?? "primary",
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

export interface LegacyIdAlias {
  legacyId: string;
  localId: string;
  namespace: string;
}

export function normalizeGeoJsonSource(
  input: GeoJsonFeatureCollection,
  options: NormalizeSourceOptions,
): WorldData {
  return normalizeGeoJsonSourceWithAliases(input, options).world;
}

export function normalizeGeoJsonSourceWithAliases(
  input: GeoJsonFeatureCollection,
  options: NormalizeSourceOptions,
): { world: WorldData; idAliases: LegacyIdAlias[] } {
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

  const namespace = options.source.namespace ?? "primary";
  if (!namespace.trim()) throw new Error("PIPELINE_SOURCE_NAMESPACE_REQUIRED");
  const source = provenance(options);
  const idAliases: LegacyIdAlias[] = [];
  const claimedIds = new Set<string>();
  const localIdFor = (
    prefix: string,
    feature: GeoJsonFeature,
    legacyLineIndex?: number,
    componentSuffix?: string,
  ) => {
    const localId = stableLocalId(prefix, feature, options.source.kind, namespace, componentSuffix);
    if (claimedIds.has(localId)) throw new Error("GEOJSON_LOCAL_ID_COLLISION");
    claimedIds.add(localId);
    const legacyId = legacyLocalId(prefix, feature, options.source.kind, legacyLineIndex);
    if (legacyId !== localId) idAliases.push({ legacyId, localId, namespace });
    return localId;
  };
  const sourceMetadata: WorldSourceMetadata = {
    namespace,
    kind: options.source.kind,
    revision: options.source.revision,
    licence: options.source.licence,
    ...(options.source.observedAt ? { observedAt: options.source.observedAt } : {}),
  };
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
      sources: [sourceMetadata],
      coverage: { quality: source.quality, sourceCount: 1 },
    },
    roads: [],
    buildings: [],
    lots: [],
  };

  const pendingParts: Array<{
    feature: GeoJsonFeature;
    geometry: PolygonGeometry | MultiPolygonGeometry;
    properties: Record<string, unknown>;
  }> = [];

  const buildingByRef = new Map<string, Building>();

  input.features.forEach((feature) => {
    if (!feature.geometry) throw new Error("GEOJSON_GEOMETRY_REQUIRED");
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
      if (validateSurfaceGeometry(geometry).length > 0) {
        throw new Error("GEOJSON_GEOMETRY_INVALID");
      }

      // Check if feature is marked as a lot
      const isLot =
        properties["lot"] !== undefined ||
        properties["boundary"] === "lot" ||
        properties["landuse"] === "residential_lot" ||
        properties["landuse"] === "lot";
      if (isLot) {
        const status = properties["status"] === "empty" ? ("empty" as const) : ("final" as const);
        const confirmedProp = properties["confirmed"];
        const confirmed =
          confirmedProp === true ||
          confirmedProp === "true" ||
          confirmedProp === 1 ||
          confirmedProp === "1";
        world.lots.push({
          localId: localIdFor("lot", feature),
          geometry,
          confirmed,
          status,
          provenance: source,
        });
        return;
      }

      const isPart =
        properties["building:part"] !== undefined && properties["building:part"] !== "no";

      const buildingTag = properties["building"];
      const isBuilding =
        buildingTag !== undefined &&
        buildingTag !== null &&
        buildingTag !== false &&
        buildingTag !== 0 &&
        buildingTag !== "" &&
        String(buildingTag).toLowerCase() !== "no";

      if (!isPart && !isBuilding) throw new Error("GEOJSON_POLYGON_UNCLASSIFIED");

      if (isPart) {
        pendingParts.push({ feature, geometry, properties });
        return;
      }

      const levels = numberProperty(properties, "building:levels", "levels");
      const explicitHeight = numberProperty(properties, "height", "building:height");

      const building: Building = {
        localId: localIdFor("building", feature),
        geometry,
        footprintKind: "footprint",
        wallHeight: explicitHeight ?? (levels === undefined ? 6 : levels * 3.2),
        ...(levels === undefined ? {} : { levels }),
        roofType: roofType(properties),
        provenance: source,
        attributes: {
          wallHeight: explicitHeight === undefined ? inferredPropertyProvenance(options) : source,
          levels: levels === undefined ? unknownPropertyProvenance(options) : source,
          roofType:
            properties["roof:shape"] || properties["roof"]
              ? source
              : unknownPropertyProvenance(options),
        },
      };

      world.buildings.push(building);
      buildingByRef.set(building.localId, building);
      if (feature.id !== undefined && feature.id !== null) {
        buildingByRef.set(String(feature.id).trim(), building);
      }
      return;
    }

    if (feature.geometry.type !== "LineString" && feature.geometry.type !== "MultiLineString") {
      throw new Error("GEOJSON_GEOMETRY_TYPE_UNSUPPORTED");
    }
    if (properties["highway"] === undefined || !String(properties["highway"]).trim()) {
      throw new Error("GEOJSON_LINE_UNCLASSIFIED");
    }
    const lines =
      feature.geometry.type === "LineString"
        ? [feature.geometry.coordinates]
        : feature.geometry.coordinates;
    lines.forEach((line, lineIndex) => {
      const lineSuffix = lines.length > 1 ? lineIndex : undefined;
      const componentSuffix =
        lines.length > 1
          ? `segment-${sha256(
              canonicalGeometryFingerprint({ type: "LineString", coordinates: line }),
            ).slice(0, 12)}`
          : undefined;
      const explicitWidth = numberProperty(properties, "width");
      const hasWidth = explicitWidth !== undefined && explicitWidth > 0;
      const rClass = roadClass(properties);
      const carriagewayWidth = hasWidth ? explicitWidth : defaultRoadWidth(rClass);
      const sidewalk = numberProperty(properties, "sidewalk:width");
      const layerRaw = numberProperty(properties, "layer");
      const isBridge =
        properties["bridge"] === true ||
        properties["bridge"] === "yes" ||
        properties["bridge"] === "1";
      const isTunnel =
        properties["tunnel"] === true ||
        properties["tunnel"] === "yes" ||
        properties["tunnel"] === "1";
      const hasStructureTag =
        properties["bridge"] !== undefined || properties["tunnel"] !== undefined;
      const bridgeVal = isBridge ? 1 : 0;
      const tunnelVal = isTunnel ? -1 : 0;
      const elevationLayer = Math.round(layerRaw ?? (bridgeVal || tunnelVal || 0));
      const explicitElevation = numberProperty(properties, "elevation", "ele");

      world.roads.push({
        localId: localIdFor("road", feature, lineSuffix, componentSuffix),
        polylineENU: line.map((coordinate) => coordinateToEnu(coordinate, options.origin)),
        connectorIds: [],
        roadClass: rClass,
        carriagewayWidth,
        ...(sidewalk === undefined
          ? {}
          : { sidewalkWidths: [sidewalk, sidewalk] as [number, number] }),
        elevationLayer,
        ...(explicitElevation === undefined ? {} : { baseElevation: explicitElevation }),
        structure: isBridge ? "bridge" : isTunnel ? "tunnel" : "surface",
        direction: direction(properties),
        surface: "unknown",
        provenance: source,
        attributes: {
          carriagewayWidth: hasWidth ? source : inferredPropertyProvenance(options),
          direction:
            properties["oneway"] === undefined ? unknownPropertyProvenance(options) : source,
          baseElevation:
            explicitElevation === undefined ? unknownPropertyProvenance(options) : source,
          elevationLayer: layerRaw === undefined ? inferredPropertyProvenance(options) : source,
          structure: hasStructureTag ? source : inferredPropertyProvenance(options),
          surface: unknownPropertyProvenance(options),
          sidewalkWidths:
            sidewalk === undefined
              ? unknownPropertyProvenance(options)
              : inferredPropertyProvenance(options),
        },
      });
    });
  });

  // Pass 2: Resolve explicit parent references exactly; otherwise require one
  // unambiguous containing parent. Never attach by substring or silently retype
  // an orphan part as a standalone building.
  for (const pending of pendingParts) {
    const { feature, geometry, properties } = pending;
    const parentId = properties["building:parent"] ?? properties["parent"];
    let parentBuilding: Building | undefined;

    if (parentId !== undefined && parentId !== null && String(parentId).trim()) {
      const exactParentId = String(parentId).trim();
      parentBuilding = buildingByRef.get(exactParentId);
      if (!parentBuilding) throw new Error("GEOJSON_PART_PARENT_NOT_FOUND");
    } else {
      const containingParents = world.buildings.filter((candidate) =>
        surfaceContains(candidate.geometry, geometry),
      );
      if (containingParents.length > 1) throw new Error("GEOJSON_PART_PARENT_AMBIGUOUS");
      parentBuilding = containingParents[0];
      if (!parentBuilding) throw new Error("GEOJSON_PART_PARENT_UNRESOLVED");
    }

    const explicitHeight = numberProperty(properties, "height", "building:height");
    const levels = numberProperty(properties, "building:levels", "levels");
    const partItem = {
      localId: localIdFor("part", feature),
      geometry,
      wallHeight: explicitHeight ?? (levels === undefined ? 4 : levels * 3.2),
      ...(levels === undefined ? {} : { levels }),
      roofType: roofType(properties),
      provenance: source,
      attributes: {
        wallHeight: explicitHeight === undefined ? inferredPropertyProvenance(options) : source,
        levels: levels === undefined ? unknownPropertyProvenance(options) : source,
        roofType:
          properties["roof:shape"] || properties["roof"]
            ? source
            : unknownPropertyProvenance(options),
      },
    };

    if (!parentBuilding.parts) parentBuilding.parts = [];
    parentBuilding.parts.push(partItem);
  }

  // Calculate road connectors: same-layer roads that share any node (endpoints or
  // mid-line T-junction vertices) within the connection tolerance.
  const connectionTolerance = 0.1;
  const distance = (p1: Position2, p2: Position2) => Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
  const pointToSegmentDistance = (p: Position2, a: Position2, b: Position2) => {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSq = dx * dx + dy * dy;
    if (lengthSq === 0) return distance(p, a);
    let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSq;
    t = Math.max(0, Math.min(1, t));
    return distance(p, [a[0] + t * dx, a[1] + t * dy]);
  };
  const polylineBounds = (line: Position2[]) => {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [x, y] of line) {
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  };
  const touchesSegment = (points: Position2[], line: Position2[]) => {
    for (let i = 0; i < line.length - 1; i += 1) {
      const a = line[i]!;
      const b = line[i + 1]!;
      for (const p of points) {
        if (pointToSegmentDistance(p, a, b) < connectionTolerance) return true;
      }
    }
    return false;
  };
  const sharesNode = (first: Position2[], second: Position2[]) => {
    const a = polylineBounds(first);
    const b = polylineBounds(second);
    if (a.minX - connectionTolerance > b.maxX || b.minX - connectionTolerance > a.maxX)
      return false;
    if (a.minY - connectionTolerance > b.maxY || b.minY - connectionTolerance > a.maxY)
      return false;
    // Shared vertex (endpoint or interior node) between both polylines.
    for (const pa of first) {
      for (const pb of second) {
        if (distance(pa, pb) < connectionTolerance) return true;
      }
    }
    // T-junction: a vertex of one road lands on the interior of the other's segment.
    if (touchesSegment(first, second)) return true;
    if (touchesSegment(second, first)) return true;
    return false;
  };

  for (let i = 0; i < world.roads.length; i++) {
    const r1 = world.roads[i]!;
    if (r1.polylineENU.length === 0) continue;
    for (let j = i + 1; j < world.roads.length; j++) {
      const r2 = world.roads[j]!;
      // Only connect roads on the same elevationLayer; different layers must stay separate.
      if (r1.elevationLayer !== r2.elevationLayer) continue;
      if (r2.polylineENU.length === 0) continue;
      if (sharesNode(r1.polylineENU, r2.polylineENU)) {
        if (!r1.connectorIds.includes(r2.localId)) r1.connectorIds.push(r2.localId);
        if (!r2.connectorIds.includes(r1.localId)) r2.connectorIds.push(r1.localId);
      }
    }
  }

  return { world, idAliases };
}
