import { expect, test } from "bun:test";
import { conflateWorlds } from "./conflate";
import type { WorldData } from "../../src/world/schema";

function world(id: string, buildingId: string): WorldData {
  return {
    manifest: {
      schemaVersion: "1.0",
      datasetRevision: id,
      units: "metres",
      frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
      isSynthetic: true,
      coverage: { quality: "synthetic", sourceCount: 1 },
    },
    roads: [],
    lots: [],
    buildings: [
      {
        localId: buildingId,
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
        wallHeight: 6,
        roofType: "unknown",
        provenance: { source: "synthetic", quality: "synthetic" },
      },
    ],
  };
}

test("conflation keeps an explicit resolver decision and never deletes overlap candidates blindly", () => {
  const result = conflateWorlds(
    [world("first", "building-a"), world("second", "building-b")],
    [
      {
        primaryBuildingId: "building-a",
        duplicateBuildingId: "building-b",
        reason: "synthetic source mapping",
      },
    ],
  );

  expect(result.world.buildings.map((building) => building.localId)).toEqual(["building-a"]);
  expect(result.report.resolved).toContainEqual(
    expect.objectContaining({ reason: "synthetic source mapping" }),
  );
  expect(result.report.unresolved).toEqual([]);
});

test("conflation reports high-overlap candidates without merging them when no resolver rule exists", () => {
  const result = conflateWorlds([world("first", "building-a"), world("second", "building-b")], []);

  expect(result.world.buildings).toHaveLength(2);
  expect(result.report.unresolved).toContainEqual(
    expect.objectContaining({ buildingIds: ["building-a", "building-b"] }),
  );
});
