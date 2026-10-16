import { expect, test } from "bun:test";
import { buildWorldPackage } from "./build";
import { parseWorldPackage } from "../../src/world/package";
import type { WorldOverrideDocument } from "../../src/world/schema";

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

test("copies explicit center confirmation provenance into the package only when configured", () => {
  const confirmation = {
    status: "confirmed" as const,
    provenance: { source: "owner" as const, method: "explicit-user-confirmation" as const },
  };
  const result = buildWorldPackage(source, {
    schemaVersion: "1.0",
    datasetRevision: "confirmed-point-build-v1",
    origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
    input: { kind: "file", path: "synthetic.geojson" },
    source: { kind: "survey", revision: "fixture-v1", licence: "CC0-1.0" },
    centerConfirmation: confirmation,
    output: { packagePath: "out/package.json", reportPath: "out/report.json" },
  });
  expect(result.package.centerConfirmation).toEqual(confirmation);
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

  const baseBuilding = result.package.world.buildings[0];
  expect(baseBuilding?.wallHeight).toBe(0);
  expect(baseBuilding?.attributes?.wallHeight?.quality).toBe("unknown");
  const opened = parseWorldPackage(JSON.stringify(result.package));
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error(opened.errorCode);
  const effectiveBuilding = opened.world.buildings[0];
  expect(effectiveBuilding?.wallHeight).toBe(14);
  expect(effectiveBuilding?.levels).toBe(4);
  expect(effectiveBuilding?.roofType).toBe("terrace_tum");

  const rebuilt = buildWorldPackage(
    buildingSource,
    {
      schemaVersion: "1.0",
      datasetRevision: "override-build-v1",
      origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
      input: { kind: "file", path: "building.geojson", format: "geojson" },
      source: { kind: "synthetic", revision: "fixture-v1", licence: "CC0-1.0" },
      output: { packagePath: "out/package.json", reportPath: "out/report.json" },
    },
    { overrides: opened.package.overrides },
  );
  const rebuiltOpened = parseWorldPackage(JSON.stringify(rebuilt.package));
  expect(rebuiltOpened.ok).toBe(true);
  if (!rebuiltOpened.ok) throw new Error(rebuiltOpened.errorCode);
  expect(rebuiltOpened.world.buildings[0]?.wallHeight).toBe(14);
  expect(rebuiltOpened.world.buildings[0]?.levels).toBe(4);
  expect(rebuiltOpened.world.buildings[0]?.roofType).toBe("terrace_tum");

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

test("fails closed when a legacy sampled ID maps to multiple full-geometry features", () => {
  const collisionSource = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { building: "yes" },
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
      {
        type: "Feature" as const,
        properties: { building: "yes" },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [0.6, 0.4],
              [0.6002, 0.4],
              [0.6001, 0.4001],
              [0.5999, 0.4001],
              [0.6, 0.4],
            ],
          ],
        },
      },
    ],
  };
  const overrides = {
    schemaVersion: "1.0" as const,
    overrides: [
      {
        localId: "ov-ambiguous-legacy-id",
        revision: 1,
        reason: "Synthetic legacy reference must not guess which feature was intended",
        provenance: { source: "manual_override" as const, quality: "inferred" as const },
        patch: {
          operation: "patch_building" as const,
          featureId: "building-1gu9p13",
          patch: { wallHeight: 9 },
        },
      },
    ],
  };
  expect(() =>
    buildWorldPackage(
      collisionSource,
      {
        schemaVersion: "1.0",
        datasetRevision: "ambiguous-legacy-test",
        origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
        input: { kind: "file", path: "collision.geojson", format: "geojson" },
        source: { kind: "osm", revision: "rev-1", licence: "ODbL-1.0" },
        output: { packagePath: "out/package.json", reportPath: "out/report.json" },
      },
      { overrides },
    ),
  ).toThrow("PIPELINE_ID_MIGRATION_AMBIGUOUS");
});

test("rebuilds a current primary ID beside a secondary legacy alias but rejects an unmarked ambiguous legacy ID", () => {
  const primarySource = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        id: 123,
        properties: { building: "yes", height: 6 },
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
  const secondarySource = {
    type: "FeatureCollection" as const,
    features: [
      {
        ...primarySource.features[0]!,
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [0.6002, 0.4],
              [0.6003, 0.4],
              [0.6003, 0.4001],
              [0.6002, 0.4001],
              [0.6002, 0.4],
            ],
          ],
        },
      },
    ],
  };
  const primaryConfig = {
    schemaVersion: "1.0" as const,
    datasetRevision: "current-id-migration-v1",
    origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
    input: { kind: "file" as const, path: "primary.geojson", format: "geojson" as const },
    source: { kind: "osm" as const, namespace: "primary", revision: "p1", licence: "ODbL-1.0" },
    output: { packagePath: "out/package.json", reportPath: "out/report.json" },
  };
  const secondaryConfig = {
    ...primaryConfig,
    datasetRevision: "current-id-migration-secondary-v1",
    input: { kind: "file" as const, path: "secondary.geojson", format: "geojson" as const },
    source: {
      kind: "overture" as const,
      namespace: "secondary-a",
      revision: "s1",
      licence: "CC-BY-4.0",
    },
  };
  const secondarySources = [{ source: secondarySource, config: secondaryConfig }];
  const currentOverrides: WorldOverrideDocument = {
    schemaVersion: "1.0" as const,
    overrides: [
      {
        localId: "ov-current-primary-123",
        revision: 1,
        reason: "Synthetic edit to the current primary feature",
        identityScheme: "stable-local-id-v2" as const,
        provenance: { source: "manual_override" as const, quality: "inferred" as const },
        patch: {
          operation: "patch_building" as const,
          featureId: "building-123",
          patch: { wallHeight: 9 },
        },
      },
    ],
  };

  const rebuilt = buildWorldPackage(primarySource, primaryConfig, {
    secondarySources,
    overrides: currentOverrides,
  });
  expect(rebuilt.package.world.buildings.map((building) => building.localId).sort()).toEqual([
    "building-123",
    "building-secondary-a-123",
  ]);
  expect(rebuilt.package.overrides?.overrides[0]?.patch).toMatchObject({
    operation: "patch_building",
    featureId: "building-123",
  });
  expect(rebuilt.package.overrides?.overrides[0]?.identityScheme).toBe("stable-local-id-v2");
  const opened = parseWorldPackage(JSON.stringify(rebuilt.package));
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error(opened.errorCode);
  expect(
    opened.world.buildings.find((building) => building.localId === "building-123")?.wallHeight,
  ).toBe(9);
  expect(
    opened.world.buildings.find((building) => building.localId === "building-secondary-a-123")
      ?.wallHeight,
  ).toBe(6);

  const legacyOverrides = structuredClone(currentOverrides);
  delete legacyOverrides.overrides[0]!.identityScheme;
  expect(() =>
    buildWorldPackage(primarySource, primaryConfig, {
      secondarySources,
      overrides: legacyOverrides,
    }),
  ).toThrow("PIPELINE_ID_MIGRATION_AMBIGUOUS");
});

test("preserves a current road override when a no-ID route is reversed", () => {
  const coordinates = [
    [0.6, 0.4],
    [0.6001, 0.4],
    [0.6001, 0.4001],
  ];
  const routeSource = (line: number[][]) => ({
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        properties: { highway: "residential" },
        geometry: { type: "LineString" as const, coordinates: line },
      },
    ],
  });
  const config = {
    schemaVersion: "1.0" as const,
    datasetRevision: "route-reversal-persistence-v1",
    origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
    input: { kind: "file" as const, path: "route.geojson", format: "geojson" as const },
    source: {
      kind: "osm" as const,
      namespace: "primary",
      revision: "route-v1",
      licence: "ODbL-1.0",
    },
    output: { packagePath: "out/package.json", reportPath: "out/report.json" },
  };
  const original = buildWorldPackage(routeSource(coordinates), config);
  const roadId = original.package.world.roads[0]!.localId;
  const overrides: WorldOverrideDocument = {
    schemaVersion: "1.0",
    overrides: [
      {
        localId: "override-no-id-route-width",
        revision: 1,
        identityScheme: "stable-local-id-v2",
        reason: "Synthetic road-width override for reversal persistence",
        patch: {
          operation: "patch_road",
          featureId: roadId,
          patch: { carriagewayWidth: 8 },
        },
      },
    ],
  };

  const rebuilt = buildWorldPackage(routeSource([...coordinates].reverse()), config, { overrides });
  expect(rebuilt.report.valid).toBe(true);
  expect(rebuilt.package.world.roads).toHaveLength(1);
  expect(rebuilt.package.world.roads[0]?.localId).toBe(roadId);
  expect(rebuilt.package.world.roads[0]?.carriagewayWidth).toBe(6);
  expect(rebuilt.package.overrides?.overrides[0]?.patch).toMatchObject({
    operation: "patch_road",
    featureId: roadId,
    patch: { carriagewayWidth: 8 },
  });
  const opened = parseWorldPackage(JSON.stringify(rebuilt.package));
  expect(opened.ok).toBe(true);
  if (!opened.ok) throw new Error(opened.errorCode);
  expect(opened.world.roads[0]?.carriagewayWidth).toBe(8);
});

test("rebuilds a rendered-part override from the original source and reloads the effective package", () => {
  const source = {
    type: "FeatureCollection" as const,
    features: [
      {
        type: "Feature" as const,
        id: "qa-parent",
        properties: { building: "yes", height: 12, roof: "flat" },
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
      {
        type: "Feature" as const,
        id: "qa-part-left",
        properties: {
          "building:part": "yes",
          "building:parent": "qa-parent",
          height: 4,
          roof: "flat",
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [0.6, 0.4],
              [0.60002, 0.4],
              [0.60002, 0.4001],
              [0.6, 0.4001],
              [0.6, 0.4],
            ],
          ],
        },
      },
      {
        type: "Feature" as const,
        id: "qa-part-right",
        properties: {
          "building:part": "yes",
          "building:parent": "qa-parent",
          height: 4,
          roof: "flat",
        },
        geometry: {
          type: "Polygon" as const,
          coordinates: [
            [
              [0.60002, 0.4],
              [0.6001, 0.4],
              [0.6001, 0.4001],
              [0.60002, 0.4001],
              [0.60002, 0.4],
            ],
          ],
        },
      },
    ],
  };
  const config = {
    schemaVersion: "1.0" as const,
    datasetRevision: "synthetic-part-rebuild-v1",
    origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
    input: { kind: "file" as const, path: "synthetic-parts.geojson", format: "geojson" as const },
    source: {
      kind: "synthetic" as const,
      namespace: "synthetic-parts",
      revision: "fixture-v1",
      licence: "CC0-1.0",
    },
    output: { packagePath: "out/package.json", reportPath: "out/report.json" },
  };
  const base = buildWorldPackage(source, config);
  const baseBuilding = base.package.world.buildings[0]!;
  const targetPart = baseBuilding.parts?.[0];
  expect(baseBuilding.parts).toHaveLength(2);
  expect(targetPart).toBeDefined();

  // This serialized document has the same shape produced by the local editor's JSON export.
  const exportedDocument = JSON.parse(
    JSON.stringify({
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "override-qa-part-left",
          revision: 1,
          identityScheme: "stable-local-id-v2",
          reason: "Synthetic part edit from local editor",
          provenance: { source: "manual_override", quality: "inferred" },
          patch: {
            operation: "patch_building_part",
            buildingId: baseBuilding.localId,
            partId: targetPart!.localId,
            patch: { wallHeight: 8, levels: 3, roofType: "gabled" },
          },
        },
      ],
    }),
  );
  const rebuilt = buildWorldPackage(source, config, { overrides: exportedDocument });
  expect(rebuilt.report.valid).toBe(true);
  expect(rebuilt.package.world.buildings[0]?.parts?.[0]?.wallHeight).toBe(4);
  expect(rebuilt.package.overrides).toEqual(exportedDocument);

  const reloaded = parseWorldPackage(JSON.stringify(rebuilt.package));
  expect(reloaded.ok).toBe(true);
  if (!reloaded.ok) throw new Error(reloaded.errorCode);
  const effectivePart = reloaded.world.buildings[0]?.parts?.[0];
  expect(effectivePart?.localId).toBe(targetPart!.localId);
  expect(effectivePart?.wallHeight).toBe(8);
  expect(effectivePart?.levels).toBe(3);
  expect(effectivePart?.roofType).toBe("gabled");
  expect(effectivePart?.attributes?.wallHeight).toMatchObject({
    source: "manual_override",
    quality: "inferred",
  });
});
