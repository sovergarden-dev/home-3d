import { expect, test } from "bun:test";
import { normalizeGeoJsonSource } from "./normalize";

const origin = { longitude: 0.6, latitude: 0.4, altitude: 0 };

test("normalizes a synthetic GeoJSON road and footprint into ENU world geometry with provenance", () => {
  const world = normalizeGeoJsonSource(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "synthetic-road",
          properties: { highway: "residential", width: "6", oneway: "yes" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0.5999, 0.3999],
              [0.6001, 0.4001],
            ],
          },
        },
        {
          type: "Feature",
          id: "synthetic-building",
          properties: { building: "yes", "building:levels": "2", roof: "flat" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0.60002, 0.40002],
                [0.60008, 0.40002],
                [0.60008, 0.40008],
                [0.60002, 0.40008],
                [0.60002, 0.40002],
              ],
            ],
          },
        },
      ],
    },
    {
      origin,
      datasetRevision: "synthetic-source-v1",
      source: { kind: "osm", revision: "synthetic", licence: "ODbL-1.0" },
    },
  );

  expect(world.manifest.datasetRevision).toBe("synthetic-source-v1");
  expect(world.roads).toHaveLength(1);
  expect(world.buildings).toHaveLength(1);
  expect(world.roads[0]?.direction).toBe("forward");
  expect(world.roads[0]?.carriagewayWidth).toBe(6);
  expect(world.buildings[0]?.levels).toBe(2);
  expect(world.buildings[0]?.provenance).toMatchObject({ source: "osm", quality: "source_only" });
  expect(world.buildings[0]?.geometry.coordinates[0]?.[0]?.[0]).not.toBeCloseTo(0.60002);
});

test("marks an absent height as an inferred class prior rather than a verified fact", () => {
  const world = normalizeGeoJsonSource(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "height-unknown",
          properties: { building: "yes" },
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0.60002, 0.40002],
                [0.60008, 0.40002],
                [0.60008, 0.40008],
                [0.60002, 0.40008],
                [0.60002, 0.40002],
              ],
            ],
          },
        },
      ],
    },
    {
      origin,
      datasetRevision: "synthetic-source-v2",
      source: { kind: "osm", revision: "synthetic", licence: "ODbL-1.0" },
    },
  );

  expect(world.buildings[0]?.wallHeight).toBe(6);
  expect(world.buildings[0]?.attributes?.wallHeight?.quality).toBe("inferred");
});

test("stableLocalId remains invariant under feature reordering in source collection", () => {
  const featA = {
    type: "Feature" as const,
    id: "way-1001",
    properties: { building: "yes", height: 8 },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [0.6, 0.4],
          [0.6001, 0.4],
          [0.6001, 0.4001],
          [0.6, 0.4001],
          [0.6, 0.4],
        ],
      ],
    },
  };
  const featB = {
    type: "Feature" as const,
    id: "way-2002",
    properties: { building: "yes", height: 12 },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [0.6002, 0.4],
          [0.6003, 0.4],
          [0.6003, 0.4001],
          [0.6002, 0.4001],
          [0.6002, 0.4],
        ],
      ],
    },
  };

  const world1 = normalizeGeoJsonSource(
    { type: "FeatureCollection", features: [featA, featB] },
    {
      origin,
      datasetRevision: "order-test-1",
      source: { kind: "osm", revision: "rev-1", licence: "ODbL-1.0" },
    },
  );

  const world2 = normalizeGeoJsonSource(
    { type: "FeatureCollection", features: [featB, featA] },
    {
      origin,
      datasetRevision: "order-test-2",
      source: { kind: "osm", revision: "rev-2", licence: "ODbL-1.0" },
    },
  );

  const bA1 = world1.buildings.find((b) => b.localId.includes("1001"));
  const bA2 = world2.buildings.find((b) => b.localId.includes("1001"));
  const bB1 = world1.buildings.find((b) => b.localId.includes("2002"));
  const bB2 = world2.buildings.find((b) => b.localId.includes("2002"));

  expect(bA1?.localId).toBeDefined();
  expect(bA1?.localId).toBe(bA2?.localId);
  expect(bB1?.localId).toBeDefined();
  expect(bB1?.localId).toBe(bB2?.localId);
});

test("widthless road receives inferred class width and connects shared endpoints", () => {
  const world = normalizeGeoJsonSource(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "road-main",
          properties: { highway: "primary" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0.6, 0.4],
              [0.6001, 0.4],
            ],
          },
        },
        {
          type: "Feature",
          id: "road-branch",
          properties: { highway: "residential" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0.6001, 0.4],
              [0.6001, 0.4001],
            ],
          },
        },
      ],
    },
    {
      origin,
      datasetRevision: "widthless-test",
      source: { kind: "osm", revision: "rev-1", licence: "ODbL-1.0" },
    },
  );

  expect(world.roads).toHaveLength(2);
  const r1 = world.roads.find((r) => r.localId.includes("road-main"));
  const r2 = world.roads.find((r) => r.localId.includes("road-branch"));

  expect(r1?.carriagewayWidth).toBe(12);
  expect(r1?.attributes.carriagewayWidth.quality).toBe("inferred");
  expect(r2?.carriagewayWidth).toBe(6);
  expect(r2?.attributes.carriagewayWidth.quality).toBe("inferred");

  expect(r1?.connectorIds).toContain(r2!.localId);
  expect(r2?.connectorIds).toContain(r1!.localId);
});

test("parent and part ordering independence: [parent, part] and [part, parent] yield identical structures", () => {
  const parentFeat = {
    type: "Feature" as const,
    id: "building-alpha",
    properties: { building: "yes", height: 10 },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [0.6, 0.4],
          [0.6002, 0.4],
          [0.6002, 0.4002],
          [0.6, 0.4002],
          [0.6, 0.4],
        ],
      ],
    },
  };
  const partFeat = {
    type: "Feature" as const,
    id: "part-alpha-tower",
    properties: { "building:part": "yes", "building:parent": "building-alpha", height: 18 },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [0.60005, 0.40005],
          [0.60015, 0.40005],
          [0.60015, 0.40015],
          [0.60005, 0.40015],
          [0.60005, 0.40005],
        ],
      ],
    },
  };

  const worldOrderA = normalizeGeoJsonSource(
    { type: "FeatureCollection", features: [parentFeat, partFeat] },
    {
      origin,
      datasetRevision: "order-a",
      source: { kind: "osm", revision: "1", licence: "ODbL-1.0" },
    },
  );

  const worldOrderB = normalizeGeoJsonSource(
    { type: "FeatureCollection", features: [partFeat, parentFeat] },
    {
      origin,
      datasetRevision: "order-b",
      source: { kind: "osm", revision: "1", licence: "ODbL-1.0" },
    },
  );

  expect(worldOrderA.buildings).toHaveLength(1);
  expect(worldOrderB.buildings).toHaveLength(1);

  const bldA = worldOrderA.buildings[0]!;
  const bldB = worldOrderB.buildings[0]!;

  expect(bldA.localId).toBe(bldB.localId);
  expect(bldA.parts).toHaveLength(1);
  expect(bldB.parts).toHaveLength(1);
  expect(bldA.parts?.[0]?.localId).toBe(bldB.parts?.[0]?.localId);
  expect(bldA.parts?.[0]?.wallHeight).toBe(18);
  expect(bldB.parts?.[0]?.wallHeight).toBe(18);
});

test("two MultiPolygons without source IDs at different locations receive distinct stable IDs", () => {
  const mp1 = {
    type: "Feature" as const,
    properties: { building: "yes" },
    geometry: {
      type: "MultiPolygon" as const,
      coordinates: [
        [
          [
            [0.6001, 0.4001],
            [0.6002, 0.4001],
            [0.6002, 0.4002],
            [0.6001, 0.4002],
            [0.6001, 0.4001],
          ],
        ],
      ],
    },
  };
  const mp2 = {
    type: "Feature" as const,
    properties: { building: "yes" },
    geometry: {
      type: "MultiPolygon" as const,
      coordinates: [
        [
          [
            [0.6005, 0.4005],
            [0.6006, 0.4005],
            [0.6006, 0.4006],
            [0.6005, 0.4006],
            [0.6005, 0.4005],
          ],
        ],
      ],
    },
  };

  const world = normalizeGeoJsonSource(
    { type: "FeatureCollection", features: [mp1, mp2] },
    {
      origin,
      datasetRevision: "mp-test",
      source: { kind: "osm", revision: "1", licence: "ODbL-1.0" },
    },
  );

  expect(world.buildings).toHaveLength(2);
  expect(world.buildings[0]!.localId).not.toBe(world.buildings[1]!.localId);
});

test("source ids that sanitise lossily never collapse to the same localId", () => {
  const makeFeature = (id: string) => ({
    type: "Feature" as const,
    id,
    properties: { building: "yes", height: 6 },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [0.6, 0.4],
          [0.6001, 0.4],
          [0.6001, 0.4001],
          [0.6, 0.4001],
          [0.6, 0.4],
        ],
      ],
    },
  });

  const world = normalizeGeoJsonSource(
    {
      type: "FeatureCollection",
      features: [
        makeFeature("synthetic/a"),
        makeFeature("synthetic_a"),
        makeFeature("synthetic-a"),
      ],
    },
    {
      origin,
      datasetRevision: "collision-test",
      source: { kind: "osm", revision: "1", licence: "ODbL-1.0" },
    },
  );

  expect(world.buildings).toHaveLength(3);
  const ids = world.buildings.map((building) => building.localId);
  expect(new Set(ids).size).toBe(3);
});

test("roads on different layers do not connect and bridge='no' is not classified as bridge", () => {
  const world = normalizeGeoJsonSource(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "ground-road",
          properties: { highway: "residential", layer: "0", bridge: "no" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0.6, 0.4],
              [0.6001, 0.4],
            ],
          },
        },
        {
          type: "Feature",
          id: "flyover-road",
          properties: { highway: "residential", layer: "1", bridge: "yes" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0.6001, 0.4],
              [0.6002, 0.4],
            ],
          },
        },
      ],
    },
    {
      origin,
      datasetRevision: "layer-test",
      source: { kind: "osm", revision: "1", licence: "ODbL-1.0" },
    },
  );

  expect(world.roads).toHaveLength(2);
  const ground = world.roads.find((r) => r.localId.includes("ground-road"))!;
  const flyover = world.roads.find((r) => r.localId.includes("flyover-road"))!;

  expect(ground.structure).toBe("surface");
  expect(ground.elevationLayer).toBe(0);
  expect(flyover.structure).toBe("bridge");
  expect(flyover.elevationLayer).toBe(1);

  // Even though they touch at [0.6001, 0.4], their layers differ (0 vs 1), so they must NOT connect!
  expect(ground.connectorIds).toEqual([]);
  expect(flyover.connectorIds).toEqual([]);
});
