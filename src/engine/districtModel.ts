/**
 * Types and schema for source-backed and survey-validated district data.
 * Adheres to H6 specification: polygons, confidence ratings, and override capability.
 */

export type RoofType = "flat" | "terrace_tum" | "gabled" | "hipped" | "corrugated";

export type ConfidenceLevel = "verified" | "source_only" | "inferred" | "unknown";

export type RoadKind = "primary" | "secondary" | "alley" | "residential";

export interface PolygonBuilding {
  id: string;
  /** 2D vertices [x, z] in local ENU metres relative to the house origin [0, 0] */
  polygon: [number, number][];
  floors: number;
  height: number;
  roofType: RoofType;
  wallColor: string;
  roofColor?: string | undefined;
  shop: boolean;
  balconies?: boolean | undefined;
  confidence: ConfidenceLevel;
  name?: string | undefined;
  address?: string | undefined;
  isHomeLot?: boolean | undefined;
  facadeStyle?: ("tube_modern" | "french_colonial" | "shophouse" | "contemporary") | undefined;
}

export interface RoadSegment {
  id: string;
  name?: string;
  kind: RoadKind;
  /** Centerline polyline coordinates [x, z] in local ENU metres */
  points: [number, number][];
  width: number;
  sidewalkWidth: number;
  surface: "asphalt" | "concrete" | "paving";
}

export interface TreeFeature {
  x: number;
  z: number;
  kind: "shade_tree" | "potted_plant" | "palm";
  height?: number;
}

export interface LandmarkProp {
  x: number;
  z: number;
  kind: "street_light" | "electric_pole" | "shop_awning" | "bench" | "hydrant";
  rotation?: number;
}

export interface DistrictData {
  id: string;
  name: string;
  isFictionalDemo: boolean;
  /** Bounding box in local ENU metres: [minX, minZ, maxX, maxZ] */
  bounds: [number, number, number, number];
  homeLot: {
    minX: number;
    maxX: number;
    minZ: number;
    maxZ: number;
    /** The home lot is always kept empty */
    empty: true;
  };
  buildings: PolygonBuilding[];
  roads: RoadSegment[];
  trees: TreeFeature[];
  props: LandmarkProp[];
}

export interface BuildingOverride {
  floors?: number;
  height?: number;
  roofType?: RoofType;
  wallColor?: string;
  roofColor?: string;
  shop?: boolean;
  balconies?: boolean;
  confidence?: ConfidenceLevel;
  name?: string;
  notes?: string;
}

export type DistrictOverrides = Record<string, BuildingOverride>;

/** Merge building overrides onto raw district data */
export function applyDistrictOverrides(
  district: DistrictData,
  overrides: DistrictOverrides,
): DistrictData {
  const updatedBuildings = district.buildings.map((b) => {
    const ov = overrides[b.id];
    if (!ov) return b;
    return {
      ...b,
      floors: ov.floors ?? b.floors,
      height: ov.height ?? (ov.floors ? ov.floors * 3.4 + 1.2 : b.height),
      roofType: ov.roofType ?? b.roofType,
      wallColor: ov.wallColor ?? b.wallColor,
      roofColor: ov.roofColor ?? b.roofColor,
      shop: ov.shop ?? b.shop,
      balconies: ov.balconies ?? b.balconies,
      confidence: ov.confidence ?? b.confidence,
      name: ov.name ?? b.name,
    };
  });

  return {
    ...district,
    buildings: updatedBuildings,
  };
}
