import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// G1 is pinned as a literal on purpose: the existing package test compares the JSON against
// HOME_GEOREFERENCE.packageSha256, which would still pass if both files were edited together.
const G1 = "a6cdca34ee2f29f374259cca3489ed4c62c19dfbd0f5f31a0bac85f546172c9a";
const dataDir = path.resolve(__dirname, "../world/data");

describe("G1 neighborhood hash pin", () => {
  it("keeps the canonical home neighborhood package byte-for-byte stable", () => {
    const text = readFileSync(path.join(dataDir, "homeNeighborhood.json"), "utf8");
    const sha = createHash("sha256")
      .update(JSON.stringify(JSON.parse(text)))
      .digest("hex");
    expect(sha).toBe(G1);
  });

  it("keeps the georeference bound to G1 with its origin", () => {
    const georef = JSON.parse(
      readFileSync(path.join(dataDir, "homeNeighborhood.georef.json"), "utf8"),
    ) as { packageSha256?: string; origin?: { latitude?: number; longitude?: number } };
    expect(georef.packageSha256).toBe(G1);
    expect(georef.origin).toEqual({ latitude: 10.752187, longitude: 106.659106 });
  });
});
