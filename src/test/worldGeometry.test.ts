import { describe, expect, it } from "vitest";
import { surfaceAreaIntersects, validateSurfaceGeometry } from "@/world/geometry";
import type { LinearRing, PolygonGeometry, WorldData } from "@/world/schema";
import { validateWorld } from "@/world/validate";

function syntheticWorld(): WorldData {
  return {
    manifest: {
      schemaVersion: "1.0",
      datasetRevision: "synthetic-test-r1",
      units: "metres",
      frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
      isSynthetic: true,
      chunks: [],
      assetHashes: {},
      licences: ["Synthetic fixture"],
      coverage: { quality: "synthetic", sourceCount: 1 },
    },
    roads: [],
    buildings: [],
    lots: [
      {
        localId: "lot-empty",
        status: "empty",
        confirmed: true,
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [-2, -2],
              [2, -2],
              [2, 2],
              [-2, 2],
              [-2, -2],
            ],
          ],
        },
        provenance: { source: "synthetic", quality: "synthetic" },
      },
    ],
  };
}

describe("world geometry gate", () => {
  it("reports same-layer crossing roads without explicit connectors instead of auto-connecting them", () => {
    const world = syntheticWorld();
    world.roads.push(
      {
        localId: "road-horizontal",
        polylineENU: [
          [-4, 0],
          [4, 0],
        ],
        connectorIds: [],
        roadClass: "residential",
        elevationLayer: 0,
        direction: "both",
        provenance: { source: "synthetic", quality: "synthetic" },
      },
      {
        localId: "road-vertical",
        polylineENU: [
          [0, -4],
          [0, 4],
        ],
        connectorIds: [],
        roadClass: "residential",
        elevationLayer: 0,
        direction: "both",
        provenance: { source: "synthetic", quality: "synthetic" },
      },
    );

    const report = validateWorld(world);

    expect(report.issues).toContainEqual(
      expect.objectContaining({
        severity: "warning",
        code: "ROAD_INTERSECTION_UNLINKED",
        featureIds: ["road-horizontal", "road-vertical"],
      }),
    );
  });

  it("detects a building spanning a confirmed empty lot even when all building vertices lie outside it", () => {
    const world = syntheticWorld();
    world.buildings.push({
      localId: "building-crosses-lot",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4, -1],
            [4, -1],
            [4, 1],
            [-4, 1],
            [-4, -1],
          ],
        ],
      },
      footprintKind: "footprint",
      wallHeight: 7,
      roofType: "flat",
      provenance: { source: "synthetic", quality: "synthetic" },
    });

    const report = validateWorld(world);

    expect(report.valid).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "BUILDING_INTERSECTS_CONFIRMED_EMPTY_LOT",
        featureIds: ["building-crosses-lot", "lot-empty"],
      }),
    );
  });

  it("rejects polygon where hole extends outside outer ring", () => {
    const outer: LinearRing = [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ];
    // Hole starts inside at (2,2) but extends to x=12 outside outer boundary
    const holeExtendingOut: LinearRing = [
      [2, 2],
      [12, 2],
      [12, 8],
      [2, 8],
      [2, 2],
    ];
    const geometry: PolygonGeometry = {
      type: "Polygon",
      coordinates: [outer, holeExtendingOut],
    };

    const issues = validateSurfaceGeometry(geometry);
    expect(issues).toContain("POLYGON_0_HOLE_0_OUTSIDE_OUTER_RING");
  });

  it("adjacent building parts sharing an edge have zero area overlap and are valid", () => {
    const partA: PolygonGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [5, 0],
          [5, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    };
    // Part B shares edge from (5,0) to (5,10)
    const partB: PolygonGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [5, 0],
          [10, 0],
          [10, 10],
          [5, 10],
          [5, 0],
        ],
      ],
    };

    expect(surfaceAreaIntersects(partA, partB)).toBe(false);
  });
});
