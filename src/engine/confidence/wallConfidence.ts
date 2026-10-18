import { assessWallHeight, type WallHeightAssessment } from "@/world/wallHeight";
import type { Building } from "@/world/schema";

export interface WallConfidenceEntry extends WallHeightAssessment {
  featureId: string;
}

export function assessBuildingWallConfidence(
  building: Building,
  syntheticWorld: boolean,
): WallConfidenceEntry[] {
  const parts = building.parts?.length ? building.parts : [building];
  return parts.map((part) => ({
    featureId: part.localId,
    ...assessWallHeight(part, syntheticWorld),
  }));
}

export function confidenceColor(status: WallHeightAssessment["status"]) {
  if (status === "known") return "#2d8a58";
  if (status === "inferred") return "#d08a24";
  if (status === "synthetic") return "#6a63b8";
  return "#7b8588";
}
