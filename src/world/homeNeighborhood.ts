import { parseWorldPackage } from "./package";
import { parsePackageGeoreference, type PackageGeoreference } from "./packageGeoreference";
import homeGeoreferenceDocument from "./data/homeNeighborhood.georef.json";
import homePackageDocument from "./data/homeNeighborhood.json";
import type { CenterConfirmation, WorldData, WorldPackage } from "./schema";

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

const parsedHomePackage = parseWorldPackage(JSON.stringify(homePackageDocument));
if (!parsedHomePackage.ok) {
  throw new Error(`HOME_NEIGHBORHOOD_PACKAGE_INVALID:${parsedHomePackage.errorCode}`);
}

const homePackage = parsedHomePackage.package as WorldPackage;
if (!homePackage.centerConfirmation) {
  throw new Error("HOME_NEIGHBORHOOD_CENTER_CONFIRMATION_MISSING");
}

const parsedGeoreference = parsePackageGeoreference(JSON.stringify(homeGeoreferenceDocument));
if (!parsedGeoreference) {
  throw new Error("HOME_NEIGHBORHOOD_GEOREFERENCE_INVALID");
}

const homeWorld = structuredClone(parsedHomePackage.world);
homeWorld.manifest.verificationStatus = "REAL_WORLD_NOT_VERIFIED";

export const HOME_NEIGHBORHOOD = deepFreeze<WorldData>(homeWorld);
export const HOME_CENTER_CONFIRMATION = deepFreeze<CenterConfirmation>(
  homePackage.centerConfirmation,
);
export const HOME_GEOREFERENCE = deepFreeze<PackageGeoreference>(parsedGeoreference);
