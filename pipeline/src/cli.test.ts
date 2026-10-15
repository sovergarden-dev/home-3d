import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runPipeline } from "./cli";

test("CLI fixture run wires secondary sources, conflation rules, terminal lots and exported overrides end to end", async () => {
  const dir = mkdtempSync(join(tmpdir(), "home3d-cli-e2e-"));
  const write = (name: string, data: unknown) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(data, null, 2));
    return path;
  };

  write("primary.geojson", {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "house-primary",
        properties: { building: "yes", height: 6, roof: "flat" },
        geometry: {
          type: "Polygon",
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
        type: "Feature",
        id: "lane-primary",
        properties: { highway: "residential", width: "5" },
        geometry: {
          type: "LineString",
          coordinates: [
            [0.6, 0.4002],
            [0.6001, 0.4002],
          ],
        },
      },
    ],
  });

  write("secondary.geojson", {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "house-secondary",
        properties: { building: "yes", height: 8 },
        geometry: {
          type: "Polygon",
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
  });

  write("rules.json", [
    {
      primaryBuildingId: "building-house-primary",
      duplicateBuildingId: "building-house-secondary",
      reason: "Synthetic fixture: secondary duplicate confirmed identical footprint",
    },
  ]);

  write("lots.json", [
    {
      localId: "lot-empty-fixture",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [30, 30],
            [35, 30],
            [35, 35],
            [30, 35],
            [30, 30],
          ],
        ],
      },
      confirmed: true,
      status: "empty",
      provenance: { source: "survey", quality: "verified" },
    },
  ]);

  write("overrides.json", {
    schemaVersion: "1.0",
    overrides: [
      {
        localId: "ov-height",
        revision: 1,
        reason: "Synthetic exported survey correction for the primary house",
        provenance: { source: "manual_override", quality: "inferred" },
        patch: {
          operation: "patch_building",
          featureId: "building-house-primary",
          patch: { wallHeight: 14, levels: 4 },
        },
      },
      {
        localId: "ov-road-width",
        revision: 2,
        reason: "Synthetic exported road width correction for the lane",
        provenance: { source: "manual_override", quality: "inferred" },
        patch: {
          operation: "patch_road",
          featureId: "road-lane-primary",
          patch: { carriagewayWidth: 7 },
        },
      },
    ],
  });

  const configPath = write("config.json", {
    schemaVersion: "1.0",
    datasetRevision: "cli-e2e-v1",
    origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
    input: { kind: "file", path: "primary.geojson", format: "geojson" },
    secondaryInputs: [
      {
        kind: "file",
        path: "secondary.geojson",
        format: "geojson",
        source: { kind: "overture", revision: "secondary-rev-1", licence: "CC-BY-4.0" },
      },
    ],
    conflationRulesPath: "rules.json",
    overridesPath: "overrides.json",
    confirmedEmptyLotsPath: "lots.json",
    source: { kind: "synthetic", revision: "fixture-v1", licence: "CC0-1.0" },
    output: { packagePath: "package.json", reportPath: "report.json" },
  });

  const report = await runPipeline(["--config", configPath]);

  expect(report.valid).toBe(true);
  expect(report.conflation?.resolved).toHaveLength(1);
  expect(report.conflation?.unresolved).toHaveLength(0);
  expect(report.conflation?.passesQualityGate).toBe(true);

  const pkg = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
    world: {
      buildings: Array<{ localId: string; wallHeight: number; levels?: number }>;
      roads: Array<{ localId: string; carriagewayWidth?: number }>;
      lots: Array<{ localId: string; confirmed: boolean; status: string }>;
    };
  };

  expect(pkg.world.buildings).toHaveLength(1);
  expect(pkg.world.buildings[0]?.localId).toBe("building-house-primary");
  expect(pkg.world.buildings[0]?.wallHeight).toBe(14);
  expect(pkg.world.buildings[0]?.levels).toBe(4);

  expect(pkg.world.roads).toHaveLength(1);
  expect(pkg.world.roads[0]?.carriagewayWidth).toBe(7);

  expect(pkg.world.lots).toHaveLength(1);
  expect(pkg.world.lots[0]?.localId).toBe("lot-empty-fixture");
  expect(pkg.world.lots[0]?.confirmed).toBe(true);
  expect(pkg.world.lots[0]?.status).toBe("empty");

  const writtenReport = JSON.parse(readFileSync(join(dir, "report.json"), "utf8")) as {
    conflation?: { resolved: unknown[] };
  };
  expect(writtenReport.conflation?.resolved).toHaveLength(1);
});

test("CLI fixture run fails loudly when a conflation rule targets an unknown building", async () => {
  const dir = mkdtempSync(join(tmpdir(), "home3d-cli-e2e-"));
  const write = (name: string, data: unknown) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(data, null, 2));
    return path;
  };

  write("primary.geojson", {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "house-only",
        properties: { building: "yes", height: 6 },
        geometry: {
          type: "Polygon",
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
  });

  write("secondary.geojson", {
    type: "FeatureCollection",
    features: [],
  });

  write("rules.json", [
    {
      primaryBuildingId: "building-house-only",
      duplicateBuildingId: "building-does-not-exist",
      reason: "Synthetic fixture: intentionally broken rule target",
    },
  ]);

  write("overrides.json", { schemaVersion: "1.0", overrides: [] });

  const configPath = write("config.json", {
    schemaVersion: "1.0",
    datasetRevision: "cli-e2e-bad-rule",
    origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
    input: { kind: "file", path: "primary.geojson", format: "geojson" },
    secondaryInputs: [
      {
        kind: "file",
        path: "secondary.geojson",
        format: "geojson",
        source: { kind: "overture", revision: "secondary-rev-1", licence: "CC-BY-4.0" },
      },
    ],
    conflationRulesPath: "rules.json",
    overridesPath: "overrides.json",
    source: { kind: "synthetic", revision: "fixture-v1", licence: "CC0-1.0" },
    output: { packagePath: "package.json", reportPath: "report.json" },
  });

  await expect(runPipeline(["--config", configPath])).rejects.toThrow(
    "CONFLATE_RULE_TARGET_NOT_FOUND",
  );
});

test("CLI fixture run fails loudly when an exported override is stale against the package", async () => {
  const dir = mkdtempSync(join(tmpdir(), "home3d-cli-e2e-"));
  const write = (name: string, data: unknown) => {
    const path = join(dir, name);
    writeFileSync(path, JSON.stringify(data, null, 2));
    return path;
  };

  write("primary.geojson", {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        id: "house-only",
        properties: { building: "yes", height: 6 },
        geometry: {
          type: "Polygon",
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
  });

  write("overrides.json", {
    schemaVersion: "1.0",
    overrides: [
      {
        localId: "ov-stale",
        revision: 1,
        reason: "Synthetic stale override from an older dataset revision",
        provenance: { source: "manual_override", quality: "inferred" },
        patch: {
          operation: "patch_building",
          featureId: "building-removed-since",
          patch: { wallHeight: 20 },
        },
      },
    ],
  });

  const configPath = write("config.json", {
    schemaVersion: "1.0",
    datasetRevision: "cli-e2e-stale-override",
    origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
    input: { kind: "file", path: "primary.geojson", format: "geojson" },
    overridesPath: "overrides.json",
    source: { kind: "synthetic", revision: "fixture-v1", licence: "CC0-1.0" },
    output: { packagePath: "package.json", reportPath: "report.json" },
  });

  await expect(runPipeline(["--config", configPath])).rejects.toThrow("PIPELINE_OVERRIDE_FAILED");
});
