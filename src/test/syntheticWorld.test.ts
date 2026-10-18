import { describe, expect, it } from "vitest";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import { validateWorld } from "@/world/validate";

describe("synthetic H6 neighborhood fixture", () => {
  it("keeps one validated synthetic world with a true courtyard, multipolygon and empty lot", () => {
    const report = validateWorld(SYNTHETIC_NEIGHBORHOOD);
    const courtyard = SYNTHETIC_NEIGHBORHOOD.buildings.find(
      (building) => building.localId === "building-courtyard",
    );
    const multiPart = SYNTHETIC_NEIGHBORHOOD.buildings.find(
      (building) => building.localId === "building-multipolygon",
    );
    const emptyLot = SYNTHETIC_NEIGHBORHOOD.lots.find((lot) => lot.localId === "lot-home-empty");

    expect(SYNTHETIC_NEIGHBORHOOD.manifest.isSynthetic).toBe(true);
    expect(report.valid).toBe(true);
    expect(courtyard?.geometry.type).toBe("Polygon");
    expect(courtyard?.geometry.type === "Polygon" && courtyard.geometry.coordinates).toHaveLength(
      2,
    );
    expect(multiPart?.geometry.type).toBe("MultiPolygon");
    expect(emptyLot).toMatchObject({ status: "empty", confirmed: true });
  });
});
