import { dirname, isAbsolute, resolve } from "node:path";
import type { WorldOverrideDocument } from "../../src/world/schema";
import type { WorldData } from "../../src/world/schema";
import { buildWorldPackage, type BuildWorldPackageOptions } from "./build";
import { parsePipelineConfig, type PipelineInputFormat } from "./config";
import type { ConflationRule } from "./conflate";
import type { GeoJsonFeatureCollection } from "./normalize";
import { osmOverpassToGeoJson, type OsmOverpassSnapshot } from "./osm";

interface CliOptions {
  configPath: string;
  dryRun: boolean;
}

function parseArguments(argumentsList: string[]): CliOptions {
  let configPath: string | undefined;
  let dryRun = false;
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index]!;
    if (argument === "--config") {
      configPath = argumentsList[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--dry-run") {
      dryRun = true;
      continue;
    }
    throw new Error("PIPELINE_ARGUMENT_INVALID");
  }
  if (!configPath) throw new Error("PIPELINE_CONFIG_PATH_REQUIRED");
  return { configPath, dryRun };
}

function relativeToConfig(configPath: string, candidate: string) {
  return isAbsolute(candidate) ? candidate : resolve(dirname(configPath), candidate);
}

async function readInput(
  configPath: string,
  input: ReturnType<typeof parsePipelineConfig>["input"],
) {
  if (input.kind === "file") {
    try {
      return await Bun.file(relativeToConfig(configPath, input.path)).text();
    } catch {
      throw new Error("PIPELINE_INPUT_READ_FAILED");
    }
  }
  try {
    const response = await fetch(input.url, {
      headers: { accept: "application/geo+json,application/json" },
    });
    if (!response.ok) throw new Error("PIPELINE_INPUT_FETCH_FAILED");
    return await response.text();
  } catch {
    throw new Error("PIPELINE_INPUT_FETCH_FAILED");
  }
}

function parseSource(text: string, format: PipelineInputFormat): GeoJsonFeatureCollection {
  try {
    const parsed = JSON.parse(text) as unknown;
    if (format === "osm-overpass") return osmOverpassToGeoJson(parsed as OsmOverpassSnapshot);
    const geoJson = parsed as GeoJsonFeatureCollection;
    if (geoJson.type !== "FeatureCollection" || !Array.isArray(geoJson.features)) {
      throw new Error("PIPELINE_SOURCE_GEOJSON_REQUIRED");
    }
    return geoJson;
  } catch (error) {
    if (error instanceof Error && error.message === "PIPELINE_SOURCE_GEOJSON_REQUIRED") throw error;
    if (error instanceof Error && error.message === "OSM_OVERPASS_SNAPSHOT_INVALID") {
      throw new Error("PIPELINE_SOURCE_OSM_INVALID");
    }
    throw new Error("PIPELINE_SOURCE_JSON_INVALID");
  }
}

function safeErrorCode(error: unknown) {
  if (error instanceof Error && /^[A-Z0-9_]+$/.test(error.message)) return error.message;
  return "PIPELINE_EXECUTION_FAILED";
}

export async function runPipeline(argumentsList: string[]) {
  const options = parseArguments(argumentsList);
  const configText = await Bun.file(options.configPath)
    .text()
    .catch(() => {
      throw new Error("PIPELINE_CONFIG_READ_FAILED");
    });
  let rawConfig: unknown;
  try {
    rawConfig = JSON.parse(configText);
  } catch {
    throw new Error("PIPELINE_CONFIG_JSON_INVALID");
  }
  const config = parsePipelineConfig(rawConfig);
  const source = parseSource(
    await readInput(options.configPath, config.input),
    config.input.format,
  );

  let overrides: WorldOverrideDocument | undefined;
  if (config.overridesPath) {
    try {
      const overridesText = await Bun.file(
        relativeToConfig(options.configPath, config.overridesPath),
      ).text();
      overrides = JSON.parse(overridesText) as WorldOverrideDocument;
    } catch {
      throw new Error("PIPELINE_OVERRIDES_READ_FAILED");
    }
  }

  let conflationRules: ConflationRule[] | undefined;
  if (config.conflationRulesPath) {
    try {
      const rulesText = await Bun.file(
        relativeToConfig(options.configPath, config.conflationRulesPath),
      ).text();
      conflationRules = JSON.parse(rulesText) as ConflationRule[];
    } catch {
      throw new Error("PIPELINE_CONFLATION_RULES_READ_FAILED");
    }
  }

  let confirmedEmptyLots: WorldData["lots"] | undefined;
  if (config.confirmedEmptyLotsPath) {
    try {
      const lotsText = await Bun.file(
        relativeToConfig(options.configPath, config.confirmedEmptyLotsPath),
      ).text();
      confirmedEmptyLots = JSON.parse(lotsText) as WorldData["lots"];
    } catch {
      throw new Error("PIPELINE_EMPTY_LOTS_READ_FAILED");
    }
  }

  const buildOptions: BuildWorldPackageOptions = {};
  if (overrides !== undefined) buildOptions.overrides = overrides;
  if (conflationRules !== undefined) buildOptions.conflationRules = conflationRules;
  if (confirmedEmptyLots !== undefined) buildOptions.confirmedEmptyLots = confirmedEmptyLots;

  const result = buildWorldPackage(source, config, buildOptions);

  if (!options.dryRun) {
    const packagePath = relativeToConfig(options.configPath, config.output.packagePath);
    const reportPath = relativeToConfig(options.configPath, config.output.reportPath);
    try {
      await Bun.write(packagePath, JSON.stringify(result.package));
      await Bun.write(reportPath, JSON.stringify(result.report));
    } catch {
      throw new Error("PIPELINE_OUTPUT_WRITE_FAILED");
    }
  }

  return result.report;
}

if (import.meta.main) {
  runPipeline(Bun.argv.slice(2))
    .then((report) => {
      console.log(JSON.stringify(report));
    })
    .catch((error: unknown) => {
      console.error(JSON.stringify({ status: "error", code: safeErrorCode(error) }));
      process.exitCode = 1;
    });
}
