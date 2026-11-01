import type { WorldData } from "../../src/world/schema";
import { validateWorld } from "../../src/world/validate";
import type { ConflationCandidate, ConflationResolution } from "./conflate";

export interface WorldBuildReport {
  valid: boolean;
  openBuildings?: import("./open-buildings").OpenBuildingsReport;
  sourceCount: number;
  licences: string[];
  coverageQuality: WorldData["manifest"]["coverage"]["quality"];
  featureCounts: {
    roads: number;
    buildings: number;
    lots: number;
    trees: number;
    props: number;
  };
  qualityCounts: Record<string, number>;
  issueCounts: Record<string, number>;
  conflation?: {
    resolved: ConflationResolution[];
    unresolved: ConflationCandidate[];
    passesQualityGate: boolean;
  };
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
    sourceCount: world.manifest.coverage.sourceCount,
    licences: [...world.manifest.licences],
    coverageQuality: world.manifest.coverage.quality,
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

/** Stdout is public-safe; detailed conflation IDs and licence labels stay in the local report file. */
export function publicBuildSummary(report: WorldBuildReport) {
  const count = (value: number) => (Number.isSafeInteger(value) && value >= 0 ? value : 0);
  const height = report.openBuildings;
  return {
    valid: report.valid,
    sourceCount: count(report.sourceCount),
    featureCounts: {
      roads: count(report.featureCounts.roads),
      buildings: count(report.featureCounts.buildings),
      lots: count(report.featureCounts.lots),
      trees: count(report.featureCounts.trees),
      props: count(report.featureCounts.props),
    },
    issueCount: Object.values(report.issueCounts).reduce((sum, value) => sum + count(value), 0),
    qualityCounts: Object.fromEntries(
      ["synthetic", "verified", "source_only", "inferred", "unknown", "conflict"].map((key) => [
        key,
        count(report.qualityCounts[key] ?? 0),
      ]),
    ),
    ...(report.conflation
      ? {
          conflation: {
            resolved: report.conflation.resolved.length,
            unresolved: report.conflation.unresolved.length,
            passesQualityGate: report.conflation.passesQualityGate,
          },
        }
      : {}),
    ...(height
      ? {
          openBuildings: {
            year: height.year,
            examined: count(height.examined),
            assigned: count(height.assigned),
            excluded: count(height.excluded),
            preserved: count(height.preserved),
            uncovered: count(height.uncovered),
            usableSamples: count(height.usableSamples),
          },
        }
      : {}),
  };
}
