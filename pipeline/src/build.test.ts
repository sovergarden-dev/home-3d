import { expect, test } from "bun:test";
import { buildWorldPackage } from "./build";

const source = {
  type: "FeatureCollection" as const,
  features: [
    {
      type: "Feature" as const,
      id: "road",
      properties: { highway: "residential", width: "5" },
      geometry: {
        type: "LineString" as const,
        coordinates: [
          [0.6, 0.4],
          [0.6001, 0.4001],
        ],
      },
    },
  ],
};

test("builds a private package and a coordinate-free public-safe summary from synthetic input", () => {
  const result = buildWorldPackage(source, {
    schemaVersion: "1.0",
    datasetRevision: "synthetic-build-v1",
    origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
    input: { kind: "file", path: "synthetic.geojson" },
    source: { kind: "synthetic", revision: "fixture-v1", licence: "CC0-1.0" },
    output: { packagePath: "out/package.json", reportPath: "out/report.json" },
  });

  expect(result.package.world.roads).toHaveLength(1);
  expect(result.report).toMatchObject({ valid: true, featureCounts: { roads: 1, buildings: 0 } });
  expect(JSON.stringify(result.report)).not.toContain("0.6001");
  expect(JSON.stringify(result.report)).not.toContain("0.4");
});
