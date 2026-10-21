import { describe, expect, it } from "vitest";
import { applyWorldOverrides } from "@/world/overrides";
import { parseWorldPackage } from "@/world/package";
import { createWorldDataProvider } from "@/world/privateWorldSession";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import type { WorldData, WorldOverrideDocument } from "@/world/schema";

function world() {
  return structuredClone(SYNTHETIC_NEIGHBORHOOD) as WorldData;
}
function override(patch: unknown, localId = "h6-boundary") {
  return {
    schemaVersion: "1.0" as const,
    overrides: [{ localId, revision: 1, reason: "boundary test", patch }],
  } as unknown as WorldOverrideDocument;
}
function packageText(extra: Record<string, unknown> = {}) {
  const value = world();
  return JSON.stringify({ manifest: value.manifest, world: value, ...extra });
}

describe("H6 package and override data boundaries", () => {
  it("rejects contradictory badges and nested parts outside the schema", () => {
    const value = world();
    expect(
      parseWorldPackage(
        JSON.stringify({
          manifest: { ...value.manifest, isSynthetic: !value.manifest.isSynthetic },
          world: value,
        }),
      ),
    ).toEqual({ ok: false, errorCode: "WORLD_PACKAGE_MANIFEST_MISMATCH" });
    Object.assign(value.buildings[0]!, {
      parts: [{ ...value.buildings[0]!, parts: [{ ...value.buildings[0]! }] }],
    });
    expect(parseWorldPackage(JSON.stringify({ manifest: value.manifest, world: value }))).toEqual({
      ok: false,
      errorCode: "WORLD_PACKAGE_PROVENANCE_INVALID",
    });
  });
  it("rejects malformed source provenance but preserves valid old metadata without manifest.sources", () => {
    for (const mutate of [
      (value: WorldData) =>
        Object.assign(value.buildings[0]!.provenance, { source: "unrecognised" }),
      (value: WorldData) => Object.assign(value.buildings[0]!.provenance, { quality: "trusted" }),
      (value: WorldData) =>
        Object.assign(value.buildings[0]!, {
          attributes: { wallHeight: { source: "survey", quality: "verified", observedAt: 4 } },
        }),
      (value: WorldData) =>
        Object.assign(value.buildings[0]!, {
          frontageCandidates: [
            {
              ringIndex: 0,
              edgeIndex: 0,
              provenance: { source: "survey", quality: "verified", injected: true },
            },
          ],
        }),
    ]) {
      const value = world();
      mutate(value);
      expect(parseWorldPackage(JSON.stringify({ manifest: value.manifest, world: value }))).toEqual(
        { ok: false, errorCode: "WORLD_PACKAGE_PROVENANCE_INVALID" },
      );
    }
    const value = world();
    delete value.manifest.sources;
    value.buildings[0]!.attributes = { wallHeight: { source: "survey", quality: "verified" } };
    expect(parseWorldPackage(JSON.stringify({ manifest: value.manifest, world: value })).ok).toBe(
      true,
    );
  });
  it("rejects malformed operation discriminators and confirmation metadata", () => {
    const value = world();
    const malformed = applyWorldOverrides(value, override({ operation: 7 }));
    expect(malformed.issues).toContain("OVERRIDE_PATCH_INVALID:h6-boundary");
    expect(
      parseWorldPackage(
        packageText({
          centerConfirmation: {
            status: "confirmed",
            provenance: { source: "owner", method: "explicit-user-confirmation", forged: true },
          },
        }),
      ),
    ).toEqual({ ok: false, errorCode: "WORLD_PACKAGE_CENTER_CONFIRMATION_INVALID" });
    expect(
      parseWorldPackage(
        packageText({
          centerConfirmation: {
            status: "not-confirmed",
            provenance: { source: "owner", method: "explicit-user-confirmation" },
          },
        }),
      ),
    ).toEqual({ ok: false, errorCode: "WORLD_PACKAGE_CENTER_CONFIRMATION_INVALID" });
  });

  it("rejects injected identity/provenance/parts fields in building, part, and road patches", () => {
    const value = world();
    const building = value.buildings[0]!;
    const road = value.roads[0]!;
    building.parts = [
      {
        localId: "part-boundary",
        geometry: structuredClone(building.geometry),
        wallHeight: building.wallHeight,
        roofType: building.roofType,
        provenance: structuredClone(building.provenance),
      },
    ];
    const patches = [
      {
        operation: "patch_building",
        featureId: building.localId,
        patch: { wallHeight: 9, localId: "forged" },
      },
      {
        operation: "patch_building_part",
        buildingId: building.localId,
        partId: "part-boundary",
        patch: { wallHeight: 9, provenance: { source: "owner" } },
      },
      { operation: "patch_road", featureId: road.localId, patch: { direction: "both", parts: [] } },
    ];
    for (const patch of patches) {
      const result = applyWorldOverrides(value, override(patch, `bad-${patch.operation}`));
      expect(
        result.issues.some((issue) => issue.startsWith("OVERRIDE_PATCH_FIELD_UNSUPPORTED")),
      ).toBe(true);
    }
  });

  it("keeps the last valid provider state after a rejected injected patch", () => {
    const value = world();
    const provider = createWorldDataProvider(value);
    const id = value.buildings[0]!.localId;
    const valid = override(
      { operation: "patch_building", featureId: id, patch: { wallHeight: 12 } },
      "valid",
    );
    expect(provider.applyOverrides(valid)).toBe(true);
    const before = provider.getSnapshot();
    const rejected = override(
      {
        operation: "patch_building",
        featureId: id,
        patch: { wallHeight: 13, provenance: { source: "owner" } },
      },
      "bad",
    );
    expect(provider.applyOverrides(rejected)).toBe(false);
    const after = provider.getSnapshot();
    expect("world" in after && after.world.buildings[0]?.["wallHeight"]).toBe(12);
    expect("lastError" in after && after.lastError).toMatch(/^OVERRIDE_PATCH_FIELD_UNSUPPORTED/);
    expect("world" in before && before.world.buildings[0]?.attributes?.["wallHeight"]).toEqual({
      source: "manual_override",
      quality: "inferred",
    });
  });

  it("preserves valid field provenance while applying an allowed patch", () => {
    const value = world();
    const id = value.buildings[0]!.localId;
    const result = applyWorldOverrides(
      value,
      override({ operation: "patch_building", featureId: id, patch: { wallHeight: 10 } }),
    );
    expect(result.issues).toEqual([]);
    expect(result.world.buildings[0]?.["wallHeight"]).toBe(10);
    expect(result.world.buildings[0]?.attributes?.["wallHeight"]).toEqual({
      source: "manual_override",
      quality: "inferred",
    });
    expect(value.buildings[0]?.attributes?.["wallHeight"]).toEqual({
      source: "synthetic",
      quality: "synthetic",
    });
  });
});
