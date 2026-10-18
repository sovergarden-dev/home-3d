import { describe, expect, it } from "vitest";
import {
  surfaceArea,
  surfaceAreaIntersects,
  surfaceIntersectionArea,
  validateSurfaceGeometry,
} from "@/world/geometry";
import type { LinearRing, MultiPolygonGeometry, PolygonGeometry, WorldData } from "@/world/schema";
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

  it("detects exact 3 m2 aligned-edge intersection with confirmed empty lot (Reviewer Case)", () => {
    const lotGeo: PolygonGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
      ],
    };
    // Building: [9.7, 0] to [19.7, 10], intersection area = 0.3 * 10 = 3 m2
    const buildingGeo: PolygonGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [9.7, 0],
          [19.7, 0],
          [19.7, 10],
          [9.7, 10],
          [9.7, 0],
        ],
      ],
    };

    expect(surfaceAreaIntersects(lotGeo, buildingGeo)).toBe(true);

    const world = syntheticWorld();
    world.lots = [
      {
        localId: "lot-empty-square",
        geometry: lotGeo,
        confirmed: true,
        status: "empty",
        provenance: { source: "synthetic", quality: "synthetic" },
      },
    ];
    world.buildings.push({
      localId: "building-invading-3sqm",
      geometry: buildingGeo,
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
        featureIds: ["building-invading-3sqm", "lot-empty-square"],
      }),
    );
  });
});

describe("surface area boolean with holes and components", () => {
  const outer = [
    [0, 0],
    [10, 0],
    [10, 10],
    [0, 10],
    [0, 0],
  ] as LinearRing;
  const squareHole = (minX: number, minZ: number, maxX: number, maxZ: number): LinearRing => [
    [minX, minZ],
    [maxX, minZ],
    [maxX, maxZ],
    [minX, maxZ],
    [minX, minZ],
  ];

  it("uses inclusion-exclusion for identical and partially intersecting courtyard holes symmetrically", () => {
    const identical: PolygonGeometry = {
      type: "Polygon",
      coordinates: [outer, squareHole(1, 1, 9, 9)],
    };
    expect(surfaceArea(identical)).toBeCloseTo(36, 8);
    expect(surfaceIntersectionArea(identical, identical)).toBeCloseTo(36, 8);
    expect(surfaceAreaIntersects(identical, identical)).toBe(true);

    const courtyardA: PolygonGeometry = {
      type: "Polygon",
      coordinates: [outer, squareHole(1, 1, 7, 7)],
    };
    const courtyardB: PolygonGeometry = {
      type: "Polygon",
      coordinates: [outer, squareHole(5, 5, 9, 9)],
    };
    expect(surfaceIntersectionArea(courtyardA, courtyardB)).toBeCloseTo(52, 8);
    expect(surfaceIntersectionArea(courtyardB, courtyardA)).toBeCloseTo(52, 8);
  });

  it("subtracts multiple non-overlapping holes and sums MultiPolygon components", () => {
    const manyHoles: PolygonGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [20, 0],
          [20, 10],
          [0, 10],
          [0, 0],
        ],
        squareHole(2, 2, 4, 4),
        squareHole(10, 2, 12, 4),
      ],
    };
    expect(surfaceArea(manyHoles)).toBeCloseTo(192, 8);
    expect(surfaceIntersectionArea(manyHoles, manyHoles)).toBeCloseTo(192, 8);

    const multi: MultiPolygonGeometry = {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [0, 0],
            [10, 0],
            [10, 10],
            [0, 10],
            [0, 0],
          ],
          squareHole(1, 1, 3, 3),
        ],
        [
          [
            [20, 0],
            [30, 0],
            [30, 10],
            [20, 10],
            [20, 0],
          ],
          squareHole(21, 1, 23, 3),
        ],
      ],
    };
    expect(surfaceArea(multi)).toBeCloseTo(192, 8);
    expect(surfaceIntersectionArea(multi, multi)).toBeCloseTo(192, 8);
  });

  it("keeps shared-boundary-only contact at zero area", () => {
    const left: PolygonGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    };
    const right: PolygonGeometry = {
      type: "Polygon",
      coordinates: [
        [
          [1, 0],
          [2, 0],
          [2, 1],
          [1, 1],
          [1, 0],
        ],
      ],
    };
    expect(surfaceIntersectionArea(left, right)).toBeCloseTo(0, 8);
    expect(surfaceAreaIntersects(left, right)).toBe(false);
  });
});
