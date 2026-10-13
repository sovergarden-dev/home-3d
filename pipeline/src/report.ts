import type { WorldData } from "../../src/world/schema";
import { validateWorld } from "../../src/world/validate";

export interface WorldBuildReport {
  valid: boolean;
  featureCounts: {
    roads: number;
    buildings: number;
    lots: number;
    trees: number;
    props: number;
  };
  qualityCounts: Record<string, number>;
  issueCounts: Record<string, number>;
}

export function createWorldBuildReport(world: WorldData): WorldBuildReport {
  const validation = validateWorld(world);
  const qualityCounts: Record<string, number> = {};
  const addQuality = (quality: string) => {
    qualityCounts[quality] = (qualityCounts[quality] ?? 0) + 1;
  };
  world.roads.forEach((feature) => addQuality(feature.provenance.quality));
  world.buildings.forEach((feature) => addQuality(feature.provenance.quality));
  world.lots.forEach((feature) => addQuality(feature.provenance.quality));
  (world.trees ?? []).forEach((feature) => addQuality(feature.provenance.quality));
  (world.props ?? []).forEach((feature) => addQuality(feature.provenance.quality));

  const issueCounts = validation.issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.code] = (counts[issue.code] ?? 0) + 1;
    return counts;
  }, {});

  return {
    valid: validation.valid,
    featureCounts: {
      roads: world.roads.length,
      buildings: world.buildings.length,
      lots: world.lots.length,
      trees: world.trees?.length ?? 0,
      props: world.props?.length ?? 0,
    },
    qualityCounts,
    issueCounts,
  };
}
