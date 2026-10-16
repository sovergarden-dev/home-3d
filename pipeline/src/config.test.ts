import { expect, test } from "bun:test";
import { parsePipelineConfig } from "./config";

test("requires a private origin and never accepts coordinates from command-line input", () => {
  expect(() =>
    parsePipelineConfig({
      schemaVersion: "1.0",
      datasetRevision: "synthetic-pipeline-v1",
      input: { kind: "file", path: "synthetic-source.geojson" },
      source: { kind: "synthetic", revision: "fixture-v1", licence: "CC0-1.0" },
      output: { packagePath: "out/world-package.json", reportPath: "out/world-report.json" },
    }),
  ).toThrow("PIPELINE_CONFIG_ORIGIN_REQUIRED");
});

test("accepts source metadata and an explicit private origin from a config object", () => {
  const config = parsePipelineConfig({
    schemaVersion: "1.0",
    datasetRevision: "synthetic-pipeline-v1",
    origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
    input: { kind: "file", path: "synthetic-source.geojson" },
    source: { kind: "synthetic", revision: "fixture-v1", licence: "CC0-1.0" },
    output: { packagePath: "out/world-package.json", reportPath: "out/world-report.json" },
  });

  expect(config.datasetRevision).toBe("synthetic-pipeline-v1");
  expect(config.source.kind).toBe("synthetic");
  expect(config.input.kind).toBe("file");
  expect(config.source.namespace).toBe("primary");
});

test("accepts center confirmation only with an explicit owner-confirmation provenance", () => {
  const config = parsePipelineConfig({
    schemaVersion: "1.0",
    datasetRevision: "synthetic-pipeline-v1",
    origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
    input: { kind: "file", path: "synthetic-source.geojson" },
    source: { kind: "synthetic", revision: "fixture-v1", licence: "CC0-1.0" },
    centerConfirmation: {
      status: "confirmed",
      provenance: { source: "owner", method: "explicit-user-confirmation" },
    },
    output: { packagePath: "out/world-package.json", reportPath: "out/world-report.json" },
  });
  expect(config.centerConfirmation).toEqual({
    status: "confirmed",
    provenance: { source: "owner", method: "explicit-user-confirmation" },
  });
  expect(() =>
    parsePipelineConfig({
      schemaVersion: "1.0",
      datasetRevision: "synthetic-pipeline-v1",
      origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
      input: { kind: "file", path: "synthetic-source.geojson" },
      source: { kind: "synthetic", revision: "fixture-v1", licence: "CC0-1.0" },
      centerConfirmation: { status: "confirmed" },
      output: { packagePath: "out/world-package.json", reportPath: "out/world-report.json" },
    }),
  ).toThrow("PIPELINE_CONFIG_CENTER_CONFIRMATION_INVALID");
});

test("preserves provisional center acceptance as distinct from final confirmation", () => {
  const config = parsePipelineConfig({
    schemaVersion: "1.0",
    datasetRevision: "provisional-center-v1",
    origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
    input: { kind: "file", path: "synthetic-source.geojson" },
    source: { kind: "synthetic", revision: "fixture-v1", licence: "CC0-1.0" },
    centerConfirmation: {
      status: "provisionally-accepted",
      provenance: { source: "owner", method: "explicit-user-confirmation" },
    },
    output: { packagePath: "out/world-package.json", reportPath: "out/world-report.json" },
  });
  expect(config.centerConfirmation?.status).toBe("provisionally-accepted");
});

test("keeps the committed dry-run fixture on neutral synthetic coordinates", async () => {
  const fixtureUrl = new URL("../tests/fixtures/synthetic-pipeline.json", import.meta.url);
  const sourceUrl = new URL("../tests/fixtures/synthetic-source.geojson", import.meta.url);
  const fixture = (await Bun.file(fixtureUrl).json()) as {
    origin: { longitude: number; latitude: number };
    source: { kind: string };
  };
  const source = (await Bun.file(sourceUrl).json()) as {
    features: Array<{ geometry: { coordinates: unknown } }>;
  };

  expect(fixture.source.kind).toBe("synthetic");
  expect(fixture.origin).toEqual({ longitude: 0.6, latitude: 0.4, altitude: 5 });

  const coordinatePairs: Array<[number, number]> = [];
  const collectPairs = (value: unknown): void => {
    if (!Array.isArray(value)) return;
    if (value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number") {
      coordinatePairs.push([value[0], value[1]]);
      return;
    }
    value.forEach(collectPairs);
  };
  source.features.forEach((feature) => collectPairs(feature.geometry.coordinates));

  expect(coordinatePairs.length).toBeGreaterThan(0);
  for (const [longitude, latitude] of coordinatePairs) {
    expect(Math.abs(longitude - fixture.origin.longitude)).toBeLessThan(0.001);
    expect(Math.abs(latitude - fixture.origin.latitude)).toBeLessThan(0.001);
  }
});

test("requires a distinct stable namespace for every secondary source", () => {
  const base = {
    schemaVersion: "1.0",
    datasetRevision: "synthetic-pipeline-v1",
    origin: { longitude: 0.6, latitude: 0.4, altitude: 0 },
    input: { kind: "file", path: "primary.geojson" },
    source: { kind: "synthetic", revision: "primary-v1", licence: "CC0-1.0" },
    secondaryInputs: [
      {
        kind: "file",
        path: "secondary.geojson",
        source: { kind: "overture", revision: "secondary-v1", licence: "CC-BY-4.0" },
      },
    ],
    output: { packagePath: "out/world-package.json", reportPath: "out/world-report.json" },
  };
  expect(() => parsePipelineConfig(base)).toThrow("PIPELINE_CONFIG_SOURCE_NAMESPACE_REQUIRED");
  expect(() =>
    parsePipelineConfig({
      ...base,
      secondaryInputs: [
        {
          ...base.secondaryInputs[0],
          source: { ...base.secondaryInputs[0]!.source, namespace: "primary" },
        },
      ],
    }),
  ).toThrow("PIPELINE_SOURCE_NAMESPACE_DUPLICATE");
});
