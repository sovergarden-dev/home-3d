import type { GeodeticPoint } from "../../src/geo/enu";

export type PipelineInputFormat = "geojson" | "osm-overpass";

export interface PipelineConfig {
  schemaVersion: "1.0";
  datasetRevision: string;
  origin: GeodeticPoint;
  input:
    | { kind: "file"; path: string; format: PipelineInputFormat }
    | { kind: "url"; url: string; allowedHost: string; format: PipelineInputFormat };
  secondaryInputs?: {
    kind: "file";
    path: string;
    format: PipelineInputFormat;
    source: PipelineConfig["source"];
  }[];
  conflationRulesPath?: string | undefined;
  overridesPath?: string | undefined;
  confirmedEmptyLotsPath?: string | undefined;
  source: {
    kind: "osm" | "overture" | "survey" | "synthetic";
    revision: string;
    licence: string;
    observedAt?: string;
  };
  output: {
    packagePath: string;
    reportPath: string;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value: unknown, errorCode: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(errorCode);
  return value;
}

function parseOrigin(value: unknown): GeodeticPoint {
  if (!isRecord(value)) throw new Error("PIPELINE_CONFIG_ORIGIN_REQUIRED");
  const longitude = value["longitude"];
  const latitude = value["latitude"];
  const altitude = value["altitude"];
  if (typeof longitude !== "number" || typeof latitude !== "number") {
    throw new Error("PIPELINE_CONFIG_ORIGIN_REQUIRED");
  }
  if (!Number.isFinite(longitude) || !Number.isFinite(latitude)) {
    throw new Error("PIPELINE_CONFIG_ORIGIN_INVALID");
  }
  if (altitude !== undefined && (typeof altitude !== "number" || !Number.isFinite(altitude))) {
    throw new Error("PIPELINE_CONFIG_ORIGIN_INVALID");
  }
  return altitude === undefined ? { longitude, latitude } : { longitude, latitude, altitude };
}

function parseInputFormat(value: unknown): PipelineInputFormat {
  if (value === undefined) return "geojson";
  if (value === "geojson" || value === "osm-overpass") return value;
  throw new Error("PIPELINE_CONFIG_INPUT_FORMAT_INVALID");
}

function parseInput(value: unknown): PipelineConfig["input"] {
  if (!isRecord(value)) throw new Error("PIPELINE_CONFIG_INPUT_REQUIRED");
  const kind = value["kind"];
  if (kind === "file")
    return {
      kind,
      path: nonEmptyString(value["path"], "PIPELINE_CONFIG_INPUT_PATH_REQUIRED"),
      format: parseInputFormat(value["format"]),
    };
  if (kind === "url") {
    const url = nonEmptyString(value["url"], "PIPELINE_CONFIG_INPUT_URL_REQUIRED");
    const allowedHost = nonEmptyString(
      value["allowedHost"],
      "PIPELINE_CONFIG_ALLOWED_HOST_REQUIRED",
    );
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error("PIPELINE_CONFIG_INPUT_URL_INVALID");
    }
    if (parsed.protocol !== "https:" || parsed.hostname !== allowedHost) {
      throw new Error("PIPELINE_CONFIG_INPUT_URL_NOT_ALLOWED");
    }
    return { kind, url, allowedHost, format: parseInputFormat(value["format"]) };
  }
  throw new Error("PIPELINE_CONFIG_INPUT_KIND_INVALID");
}

function parseSource(value: unknown): PipelineConfig["source"] {
  if (!isRecord(value)) throw new Error("PIPELINE_CONFIG_SOURCE_REQUIRED");
  const kind = value["kind"];
  if (kind !== "osm" && kind !== "overture" && kind !== "survey" && kind !== "synthetic") {
    throw new Error("PIPELINE_CONFIG_SOURCE_KIND_INVALID");
  }
  const observedAt = value["observedAt"];
  if (observedAt !== undefined && typeof observedAt !== "string")
    throw new Error("PIPELINE_CONFIG_OBSERVED_AT_INVALID");
  return {
    kind,
    revision: nonEmptyString(value["revision"], "PIPELINE_CONFIG_SOURCE_REVISION_REQUIRED"),
    licence: nonEmptyString(value["licence"], "PIPELINE_CONFIG_SOURCE_LICENCE_REQUIRED"),
    ...(observedAt === undefined ? {} : { observedAt }),
  };
}

function parseOutput(value: unknown): PipelineConfig["output"] {
  if (!isRecord(value)) throw new Error("PIPELINE_CONFIG_OUTPUT_REQUIRED");
  return {
    packagePath: nonEmptyString(value["packagePath"], "PIPELINE_CONFIG_PACKAGE_PATH_REQUIRED"),
    reportPath: nonEmptyString(value["reportPath"], "PIPELINE_CONFIG_REPORT_PATH_REQUIRED"),
  };
}

function parseOptionalPath(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string" || !value.trim()) throw new Error("PIPELINE_CONFIG_PATH_INVALID");
  return value;
}

function parseSecondaryInputs(value: unknown): PipelineConfig["secondaryInputs"] {
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value)) throw new Error("PIPELINE_CONFIG_SECONDARY_INPUTS_INVALID");
  return value.map((item) => {
    if (!isRecord(item)) throw new Error("PIPELINE_CONFIG_SECONDARY_INPUT_INVALID");
    const kind = item["kind"];
    if (kind !== "file") throw new Error("PIPELINE_CONFIG_SECONDARY_INPUT_KIND_INVALID");
    const path = nonEmptyString(item["path"], "PIPELINE_CONFIG_SECONDARY_INPUT_PATH_REQUIRED");
    const format = parseInputFormat(item["format"]);
    const source = parseSource(item["source"]);
    return { kind: "file", path, format, source };
  });
}

export function parsePipelineConfig(value: unknown): PipelineConfig {
  if (!isRecord(value)) throw new Error("PIPELINE_CONFIG_OBJECT_REQUIRED");
  if (value["schemaVersion"] !== "1.0")
    throw new Error("PIPELINE_CONFIG_SCHEMA_VERSION_UNSUPPORTED");

  const conflationRulesPath = parseOptionalPath(value["conflationRulesPath"]);
  const overridesPath = parseOptionalPath(value["overridesPath"]);
  const confirmedEmptyLotsPath = parseOptionalPath(value["confirmedEmptyLotsPath"]);
  const secondaryInputs = parseSecondaryInputs(value["secondaryInputs"]);

  const result: PipelineConfig = {
    schemaVersion: "1.0",
    datasetRevision: nonEmptyString(
      value["datasetRevision"],
      "PIPELINE_CONFIG_DATASET_REVISION_REQUIRED",
    ),
    origin: parseOrigin(value["origin"]),
    input: parseInput(value["input"]),
    source: parseSource(value["source"]),
    output: parseOutput(value["output"]),
    ...(conflationRulesPath !== undefined ? { conflationRulesPath } : {}),
    ...(overridesPath !== undefined ? { overridesPath } : {}),
    ...(confirmedEmptyLotsPath !== undefined ? { confirmedEmptyLotsPath } : {}),
    ...(secondaryInputs !== undefined ? { secondaryInputs } : {}),
  };
  return result;
}
