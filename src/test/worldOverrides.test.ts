import { describe, expect, it } from "vitest";
import type { WorldData, WorldOverrideDocument } from "@/world/schema";
import { applyWorldOverrides } from "@/world/overrides";
import { createWorldDataProvider } from "@/world/privateWorldSession";

function baseWorld(wallHeight = 6): WorldData {
  return {
    manifest: {
      schemaVersion: "1.0",
      datasetRevision: "synthetic-base",
      units: "metres",
      frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
      isSynthetic: true,
      chunks: [],
      assetHashes: {},
      licences: ["Synthetic fixture"],
      coverage: { quality: "synthetic", sourceCount: 1 },
    },
    lots: [],
    trees: [],
    props: [],
    buildings: [
      {
        localId: "b-stable",
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [4, 0],
              [4, 8],
              [0, 8],
              [0, 0],
            ],
          ],
        },
        footprintKind: "footprint",
        wallHeight,
        roofType: "flat",
        provenance: { source: "synthetic", quality: "synthetic" },
      },
    ],
    roads: [
      {
        localId: "road-stable",
        polylineENU: [
          [-5, -2],
          [5, -2],
        ],
        connectorIds: [],
        roadClass: "residential",
        carriagewayWidth: 5,
        elevationLayer: 0,
        direction: "both",
        provenance: { source: "synthetic", quality: "synthetic" },
      },
    ],
  };
}

const overrides: WorldOverrideDocument = {
  schemaVersion: "1.0",
  overrides: [
    {
      localId: "override-height",
      revision: 1,
      reason: "synthetic survey correction",
      provenance: { source: "manual_override", quality: "synthetic" },
      patch: { operation: "patch_building", featureId: "b-stable", patch: { wallHeight: 11 } },
    },
    {
      localId: "override-road",
      revision: 1,
      reason: "synthetic road alignment correction",
      provenance: { source: "manual_override", quality: "synthetic" },
      patch: {
        operation: "patch_road",
        featureId: "road-stable",
        patch: {
          polylineENU: [
            [-6, -2],
            [6, -2],
          ],
          carriagewayWidth: 6,
        },
      },
    },
  ],
};

describe("stable private world overrides", () => {
  it("reapplies stable feature overrides after a rebuild without mutating base data", () => {
    const original = baseWorld();
    const firstBuild = applyWorldOverrides(original, overrides);
    const rebuiltSource = baseWorld(7);
    const rebuilt = applyWorldOverrides(rebuiltSource, overrides);

    expect(firstBuild.issues).toEqual([]);
    expect(firstBuild.world.buildings[0]?.wallHeight).toBe(11);
    expect(firstBuild.world.roads[0]?.carriagewayWidth).toBe(6);
    expect(rebuilt.world.buildings[0]?.wallHeight).toBe(11);
    expect(rebuilt.world.roads[0]?.polylineENU).toEqual([
      [-6, -2],
      [6, -2],
    ]);
    expect(original.buildings[0]?.wallHeight).toBe(6);
    expect(rebuiltSource.buildings[0]?.wallHeight).toBe(7);
  });

  it("reports OVERRIDE_TARGET_NOT_FOUND for a stale target without dropping other operations", () => {
    const stale = structuredClone(overrides) as WorldOverrideDocument;
    stale.overrides = [
      ...stale.overrides,
      {
        localId: "override-stale",
        revision: 2,
        reason: "stale target from a previous dataset revision",
        provenance: { source: "manual_override", quality: "inferred" },
        patch: {
          operation: "patch_building",
          featureId: "building-removed-in-rebuild",
          patch: { wallHeight: 20 },
        },
      },
    ];

    const result = applyWorldOverrides(baseWorld(), stale);
    expect(result.issues).toContainEqual("OVERRIDE_TARGET_NOT_FOUND:building-removed-in-rebuild");
    expect(result.world.buildings[0]?.wallHeight).toBe(11);
    expect(result.world.roads[0]?.carriagewayWidth).toBe(6);
  });
});

describe("editor mutation gate keeps the last valid world", () => {
  function worldWithEmptyLot(): WorldData {
    const world = baseWorld();
    world.lots.push({
      localId: "lot-empty-gate",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [20, 20],
            [24, 20],
            [24, 24],
            [20, 24],
            [20, 20],
          ],
        ],
      },
      confirmed: true,
      status: "empty",
      provenance: { source: "survey", quality: "verified" },
    });
    return world;
  }

  it("refuses a geometry mutation that invades a confirmed empty lot and keeps the previous valid state", () => {
    const world = worldWithEmptyLot();
    const before = JSON.stringify(world.buildings[0]!.geometry);
    const provider = createWorldDataProvider(world);

    provider.applyOverrides({
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "ov-invade-lot",
          revision: 1,
          reason: "synthetic editor mutation into a confirmed empty lot",
          provenance: { source: "manual_override", quality: "inferred" },
          patch: {
            operation: "replace_building_geometry",
            featureId: "b-stable",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [21, 21],
                  [23, 21],
                  [23, 23],
                  [21, 23],
                  [21, 21],
                ],
              ],
            },
          },
        },
      ],
    });

    const snapshot = provider.getSnapshot();
    if (snapshot.mode === "private-error")
      throw new Error("expected last-valid state, got error mode");
    expect(snapshot.lastError).toBe("BUILDING_INTERSECTS_CONFIRMED_EMPTY_LOT");
    expect(JSON.stringify(snapshot.world.buildings[0]!.geometry)).toBe(before);
  });

  it("applies a valid mutation, tracks the override document, and clears the error state", () => {
    const provider = createWorldDataProvider(worldWithEmptyLot());
    provider.applyOverrides({
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "ov-valid-height",
          revision: 1,
          reason: "synthetic valid height correction",
          provenance: { source: "manual_override", quality: "inferred" },
          patch: { operation: "patch_building", featureId: "b-stable", patch: { wallHeight: 9 } },
        },
      ],
    });

    const snapshot = provider.getSnapshot();
    if (snapshot.mode === "private-error") throw new Error("unexpected error mode");
    expect(snapshot.lastError).toBeNull();
    expect(snapshot.world.buildings[0]?.wallHeight).toBe(9);
    expect(snapshot.overrides?.overrides).toHaveLength(1);
  });

  it("routes a private package through valid → invalid mutation → reload → private again", () => {
    const world = worldWithEmptyLot();
    const pkgText = JSON.stringify({
      manifest: world.manifest,
      world,
      overrides: { schemaVersion: "1.0", overrides: [] },
    });
    const provider = createWorldDataProvider(worldWithEmptyLot());

    provider.openText(pkgText);
    expect(provider.getSnapshot().mode).toBe("private");

    const before = JSON.stringify(world.buildings[0]!.geometry);
    provider.applyOverrides({
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "ov-route-invade",
          revision: 1,
          reason: "synthetic mutation into the confirmed empty lot",
          provenance: { source: "manual_override", quality: "inferred" },
          patch: {
            operation: "replace_building_geometry",
            featureId: "b-stable",
            geometry: {
              type: "Polygon",
              coordinates: [
                [
                  [21, 21],
                  [23, 21],
                  [23, 23],
                  [21, 23],
                  [21, 21],
                ],
              ],
            },
          },
        },
      ],
    });

    const invalid = provider.getSnapshot();
    if (invalid.mode === "private-error") throw new Error("expected last-valid private state");
    expect(invalid.mode).toBe("private");
    expect(invalid.lastError).toBe("BUILDING_INTERSECTS_CONFIRMED_EMPTY_LOT");
    expect(JSON.stringify(invalid.world.buildings[0]!.geometry)).toBe(before);

    provider.openText("{ not valid json");
    expect(provider.getSnapshot().mode).toBe("private-error");

    provider.openText(pkgText);
    const recovered = provider.getSnapshot();
    expect(recovered.mode).toBe("private");
    if (recovered.mode === "private-error") throw new Error("unreachable");
    expect(recovered.lastError).toBeFalsy();
    expect(recovered.world.buildings[0]?.localId).toBe("b-stable");
  });
});
