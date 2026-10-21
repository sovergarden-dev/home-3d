import type { Provenance } from "./schema";

export type WallHeightStatus = "known" | "inferred" | "synthetic" | "unknown";

export interface WallHeightAssessment {
  status: WallHeightStatus;
  renderedHeight: number;
}

type HeightFeature = {
  wallHeight: number;
  levels?: number;
  attributes?: Record<string, Provenance>;
};

/**
 * A class-prior height without measured height or source levels is not evidence of a real wall.
 * Keep its footprint, but render it flat. Level-derived and explicit user overrides remain visible
 * with their inferred status preserved by the UI.
 */
export function assessWallHeight(
  feature: HeightFeature,
  syntheticWorld: boolean,
): WallHeightAssessment {
  if (syntheticWorld) return { status: "synthetic", renderedHeight: feature.wallHeight };

  const evidence = feature.attributes?.["wallHeight"];
  if (evidence?.quality === "verified" || evidence?.quality === "source_only") {
    return { status: "known", renderedHeight: feature.wallHeight };
  }
  if (
    evidence?.quality === "inferred" &&
    (feature.levels !== undefined || evidence.source === "manual_override")
  ) {
    return { status: "inferred", renderedHeight: feature.wallHeight };
  }
  return { status: "unknown", renderedHeight: 0 };
}
