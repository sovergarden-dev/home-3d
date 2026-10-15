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

test("conflation preserves every supported secondary category and aggregates source metadata", () => {
  const primary = world("primary", "building-a");
  primary.manifest.licences = ["CC0-1.0"];
  primary.manifest.sources = [
    { namespace: "primary", kind: "synthetic", revision: "p1", licence: "CC0-1.0" },
  ];
  const secondary = world("secondary", "building-b");
  secondary.manifest.licences = ["CC-BY-4.0"];
  secondary.manifest.sources = [
    { namespace: "overture", kind: "overture", revision: "s1", licence: "CC-BY-4.0" },
  ];
  secondary.roads = [
    {
      localId: "road-secondary",
      polylineENU: [
        [0, 0],
        [10, 0],
      ],
      connectorIds: [],
      roadClass: "residential",
      carriagewayWidth: 5,
      elevationLayer: 0,
      direction: "both",
      provenance: { source: "overture", quality: "source_only", sourceNamespace: "overture" },
    },
  ];
  secondary.lots = [
    {
      localId: "lot-secondary",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [20, 20],
            [25, 20],
            [25, 25],
            [20, 25],
            [20, 20],
          ],
        ],
      },
      status: "unknown",
      confirmed: false,
      provenance: { source: "overture", quality: "source_only", sourceNamespace: "overture" },
    },
  ];
  secondary.trees = [
    {
      localId: "tree-secondary",
      position: [30, 30],
      height: 4,
      provenance: { source: "overture", quality: "source_only", sourceNamespace: "overture" },
    },
  ];
  secondary.props = [
    {
      localId: "prop-secondary",
      position: [40, 40],
      kind: "bench",
      provenance: { source: "overture", quality: "source_only", sourceNamespace: "overture" },
    },
  ];

  const result = conflateWorlds([primary, secondary], []);
  expect(result.world.roads.map((road) => road.localId)).toEqual(["road-secondary"]);
  expect(result.world.lots.map((lot) => lot.localId)).toEqual(["lot-secondary"]);
  expect(result.world.trees?.map((tree) => tree.localId)).toEqual(["tree-secondary"]);
  expect(result.world.props?.map((prop) => prop.localId)).toEqual(["prop-secondary"]);
  expect(result.world.manifest.licences).toEqual(["CC-BY-4.0", "CC0-1.0"]);
  expect(result.world.manifest.sources?.map((source) => source.namespace)).toEqual([
    "primary",
    "overture",
  ]);
  expect(result.world.manifest.coverage.sourceCount).toBe(2);
});
