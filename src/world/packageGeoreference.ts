import type { GeodeticPoint } from "../geo/enu";

export const PACKAGE_GEOREFERENCE_SCHEMA_VERSION = "1.0" as const;

export interface PackageGeoreference {
  schemaVersion: typeof PACKAGE_GEOREFERENCE_SCHEMA_VERSION;
  packageSha256: string;
  origin: GeodeticPoint;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isOrigin(value: unknown): value is GeodeticPoint {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.some((key) => key !== "latitude" && key !== "longitude" && key !== "altitude"))
    return false;
  if (!isFiniteNumber(value["latitude"]) || value["latitude"] <= -90 || value["latitude"] >= 90)
    return false;
  if (!isFiniteNumber(value["longitude"]) || value["longitude"] < -180 || value["longitude"] > 180)
    return false;
  return value["altitude"] === undefined || isFiniteNumber(value["altitude"]);
}

export function parsePackageGeoreference(text: string): PackageGeoreference | null {
  if (typeof text !== "string" || !text.trim()) return null;
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const keys = Object.keys(value).sort();
  if (keys.join(",") !== "origin,packageSha256,schemaVersion") return null;
  if (
    value["schemaVersion"] !== PACKAGE_GEOREFERENCE_SCHEMA_VERSION ||
    typeof value["packageSha256"] !== "string" ||
    !/^[a-f0-9]{64}$/.test(value["packageSha256"]) ||
    !isOrigin(value["origin"])
  )
    return null;
  const origin = value["origin"];
  return {
    schemaVersion: PACKAGE_GEOREFERENCE_SCHEMA_VERSION,
    packageSha256: value["packageSha256"],
    origin: {
      latitude: origin.latitude,
      longitude: origin.longitude,
      ...(origin.altitude === undefined ? {} : { altitude: origin.altitude }),
    },
  };
}

export async function sha256Text(text: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
