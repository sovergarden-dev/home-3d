export const WORLD_SCHEMA_VERSION = "1.0" as const;

export type QualityStatus =
  "synthetic" | "verified" | "source_only" | "inferred" | "unknown" | "conflict";

export type SourceKind = "synthetic" | "survey" | "osm" | "overture" | "manual_override";

export interface Provenance {
  source: SourceKind;
  quality: QualityStatus;
  sourceNamespace?: string;
  observedAt?: string;
  sourceRevision?: string;
  licence?: string;
}

export interface WorldSourceMetadata {
  namespace: string;
  kind: Exclude<SourceKind, "manual_override">;
  revision: string;
  licence: string;
  observedAt?: string;
}

export type Position2 = [number, number];
export type LinearRing = Position2[];

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: LinearRing[];
}

export interface MultiPolygonGeometry {
  type: "MultiPolygon";
  coordinates: LinearRing[][];
}

export type SurfaceGeometry = PolygonGeometry | MultiPolygonGeometry;

export type RoadClass = "primary" | "secondary" | "residential" | "alley" | "service" | "unknown";
export type RoofType = "flat" | "terrace_tum" | "gabled" | "hipped" | "corrugated" | "unknown";
export type FootprintKind = "footprint" | "roofprint" | "unknown";
export type LotStatus = "empty" | "future" | "final" | "unknown";
export type TravelDirection = "both" | "forward" | "reverse" | "unknown";

export interface WorldChunk {
  localId: string;
  bounds: [number, number, number, number];
  tier: "core" | "context" | "periphery";
}

export interface WorldManifest {
  schemaVersion: typeof WORLD_SCHEMA_VERSION;
  datasetRevision: string;
  units: "metres";
  frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH";
  isSynthetic: boolean;
  chunks: WorldChunk[];
  assetHashes: Record<string, string>;
  licences: string[];
  sources?: WorldSourceMetadata[];
  coverage: {
    quality: QualityStatus;
    sourceCount: number;
  };
}

export interface FrontageCandidate {
  ringIndex: number;
  edgeIndex: number;
  provenance: Provenance;
}

export interface BuildingPart {
  localId: string;
  geometry: SurfaceGeometry;
  baseElevation?: number;
  wallHeight: number;
  roofHeight?: number;
  levels?: number;
  roofType: RoofType;
  provenance: Provenance;
  attributes?: Record<string, Provenance>;
}

export interface Building {
  localId: string;
  geometry: SurfaceGeometry;
  footprintKind: FootprintKind;
  baseElevation?: number;
  wallHeight: number;
  roofHeight?: number;
  levels?: number;
  roofType: RoofType;
  frontageCandidates?: FrontageCandidate[];
  parts?: BuildingPart[];
  hidden?: boolean;
  provenance: Provenance;
  attributes?: Record<string, Provenance>;
}

export interface RoadSegment {
  localId: string;
  polylineENU: Position2[];
  connectorIds: string[];
  roadClass: RoadClass;
  carriagewayWidth?: number;
  sidewalkWidths?: [number, number];
  medianWidth?: number;
  elevationLayer: number;
  baseElevation?: number;
  structure?: "surface" | "bridge" | "tunnel";
  direction: TravelDirection;
  surface?: "asphalt" | "concrete" | "paving" | "unknown";
  provenance: Provenance;
  attributes?: Record<string, Provenance>;
}

export interface Lot {
  localId: string;
  geometry: SurfaceGeometry;
  status: LotStatus;
  confirmed: boolean;
  frontage?: FrontageCandidate[];
  provenance: Provenance;
  attributes?: Record<string, Provenance>;
}

export interface TreeFeature {
  localId: string;
  position: Position2;
  height?: number;
  provenance: Provenance;
}

export interface LandmarkProp {
  localId: string;
  position: Position2;
  kind: "street_light" | "electric_pole" | "bench" | "unknown";
  provenance: Provenance;
}

export interface WorldData {
  manifest: WorldManifest;
  roads: RoadSegment[];
  buildings: Building[];
  lots: Lot[];
  trees?: TreeFeature[];
  props?: LandmarkProp[];
}

export interface WorldPackage {
  manifest: WorldManifest;
  world: WorldData;
  overrides?: WorldOverrideDocument;
}

export type FeaturePatch =
  | {
      operation: "patch_building";
      featureId: string;
      patch: Partial<
        Pick<
          Building,
          "baseElevation" | "wallHeight" | "roofHeight" | "levels" | "roofType" | "hidden"
        >
      >;
    }
  | {
      operation: "replace_building_geometry";
      featureId: string;
      geometry: SurfaceGeometry;
    }
  | {
      operation: "patch_building_part";
      buildingId: string;
      partId: string;
      patch: Partial<
        Pick<BuildingPart, "baseElevation" | "wallHeight" | "roofHeight" | "levels" | "roofType">
      >;
    }
  | {
      operation: "replace_building_part_geometry";
      buildingId: string;
      partId: string;
      geometry: SurfaceGeometry;
    }
  | {
      operation: "patch_road";
      featureId: string;
      patch: Partial<
        Pick<
          RoadSegment,
          | "polylineENU"
          | "connectorIds"
          | "carriagewayWidth"
          | "sidewalkWidths"
          | "medianWidth"
          | "direction"
        >
      >;
    }
  | {
      operation: "replace_lot_geometry";
      featureId: string;
      geometry: SurfaceGeometry;
    };

export interface WorldOverride {
  localId: string;
  revision: number;
  reason: string;
  provenance?: Provenance;
  patch: FeaturePatch;
}

export interface WorldOverrideDocument {
  schemaVersion: typeof WORLD_SCHEMA_VERSION;
  overrides: WorldOverride[];
}
