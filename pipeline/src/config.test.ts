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
