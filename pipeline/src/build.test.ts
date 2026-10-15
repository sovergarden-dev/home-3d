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

test("buildWorldPackage applies overrides and attaches confirmed empty lots", () => {
  const buildingSource = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        id: "building-1",
        properties: { building: "yes", height: 6, roof: "flat" },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [0.6, 0.4],
              [0.6001, 0.4],
              [0.6001, 0.4001],
              [0.6, 0.4001],
              [0.6, 0.4],
            ],
          ],
        },
      },
    ],
  };

  const buildingId = "building-building-1";
  const overrides = {
    schemaVersion: "1.0" as const,
    overrides: [
      {
        localId: "ov-1",
        revision: 1,
        reason: "Surveyed ground truth: 4 floors, terrace tum roof",
        patch: {
          operation: "patch_building" as const,
          featureId: buildingId,
          patch: {
            wallHeight: 14,
            levels: 4,
            roofType: "terrace_tum" as const,
          },
        },
      },
    ],
  };

  const emptyLot = {
    localId: "lot-center-empty",
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [10, 10],
          [15, 10],
          [15, 20],
          [10, 20],
          [10, 10],
        ] as [number, number][],
      ],
    },
    confirmed: true,
    status: "empty" as const,
    provenance: { source: "survey" as const, quality: "verified" as const },
  };

  const result = buildWorldPackage(
    buildingSource,
    {
      schemaVersion: "1.0",
      datasetRevision: "override-build-v1",
      origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
      input: { kind: "file", path: "building.geojson", format: "geojson" },
      source: { kind: "synthetic", revision: "fixture-v1", licence: "CC0-1.0" },
      output: { packagePath: "out/package.json", reportPath: "out/report.json" },
    },
    {
      overrides,
      confirmedEmptyLots: [emptyLot],
    },
  );

  const b = result.package.world.buildings[0];
  expect(b?.wallHeight).toBe(14);
  expect(b?.levels).toBe(4);
  expect(b?.roofType).toBe("terrace_tum");

  expect(result.package.world.lots).toHaveLength(1);
  expect(result.package.world.lots[0]?.status).toBe("empty");
  expect(result.package.world.lots[0]?.confirmed).toBe(true);
});

test("buildWorldPackage throws PIPELINE_OVERRIDE_FAILED when override target is unknown", () => {
  const buildingSource = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        id: "building-real",
        properties: { building: "yes", height: 6, roof: "flat" },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [0.6, 0.4],
              [0.6001, 0.4],
              [0.6001, 0.4001],
              [0.6, 0.4001],
              [0.6, 0.4],
            ],
          ],
        },
      },
    ],
  };

  const badOverrides = {
    schemaVersion: "1.0" as const,
    overrides: [
      {
        localId: "ov-bad",
        revision: 1,
        reason: "Target does not exist",
        patch: {
          operation: "patch_building" as const,
          featureId: "building-nonexistent-id",
          patch: { wallHeight: 20 },
        },
      },
    ],
  };

  expect(() =>
    buildWorldPackage(
      buildingSource,
      {
        schemaVersion: "1.0",
        datasetRevision: "bad-override-test",
        origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
        input: { kind: "file", path: "building.geojson", format: "geojson" },
        source: { kind: "synthetic", revision: "fixture-v1", licence: "CC0-1.0" },
        output: { packagePath: "out/package.json", reportPath: "out/report.json" },
      },
      { overrides: badOverrides },
    ),
  ).toThrow("PIPELINE_OVERRIDE_FAILED");
});
