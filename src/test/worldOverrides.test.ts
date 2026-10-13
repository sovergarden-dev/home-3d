import { describe, expect, it } from "vitest";
import type { WorldData, WorldOverrideDocument } from "@/world/schema";
import { applyWorldOverrides } from "@/world/overrides";

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
});
