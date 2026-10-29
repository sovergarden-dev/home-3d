import { expect, test } from "bun:test";
import { createWorldBuildReport, publicBuildSummary, type WorldBuildReport } from "./report";
import { SYNTHETIC_NEIGHBORHOOD } from "../../src/world/fixtures/syntheticNeighborhood";
test("CLI summary drops private identifiers, arbitrary labels and unexpected fields", () => {
  const sentinel = "SYNTHETIC_PRIVATE_REPORT_SENTINEL";
  const report = {
    ...createWorldBuildReport(SYNTHETIC_NEIGHBORHOOD),
    licences: [sentinel],
    issueCounts: { [sentinel]: 2 },
    qualityCounts: { [sentinel]: 1, unknown: 3 },
    unexpected: { coordinates: sentinel },
    conflation: { resolved: [{ privateId: sentinel }], unresolved: [], passesQualityGate: true },
  } as unknown as WorldBuildReport;
  const safe = publicBuildSummary(report);
  expect(JSON.stringify(safe)).not.toContain(sentinel);
  expect(safe).toMatchObject({
    issueCount: 2,
    qualityCounts: { unknown: 3 },
    conflation: { resolved: 1, unresolved: 0, passesQualityGate: true },
  });
  expect(safe.featureCounts.buildings).toBe(SYNTHETIC_NEIGHBORHOOD.buildings.length);
});
