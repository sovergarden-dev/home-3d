import { expect, test } from "bun:test";
import { normalizeGeoJsonSource, normalizeGeoJsonSourceWithAliases } from "./normalize";

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

test("T-junction branch landing mid-segment of the trunk connects on the same layer only", () => {
  const world = normalizeGeoJsonSource(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "trunk-road",
          properties: { highway: "residential" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0.6, 0.4],
              [0.601, 0.4],
            ],
          },
        },
        {
          type: "Feature",
          id: "branch-road",
          properties: { highway: "residential", bridge: "yes" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0.6005, 0.4],
              [0.6005, 0.4005],
            ],
          },
        },
      ],
    },
    {
      origin,
      datasetRevision: "t-junction-test",
      source: { kind: "osm", revision: "1", licence: "ODbL-1.0" },
    },
  );

  const trunk = world.roads.find((r) => r.localId.includes("trunk-road"))!;
  const branch = world.roads.find((r) => r.localId.includes("branch-road"))!;
  // Same XY footprint but different layers: must NOT connect even though the branch
  // endpoint touches the trunk interior.
  expect(trunk.connectorIds).toEqual([]);
  expect(branch.connectorIds).toEqual([]);

  const worldSameLayer = normalizeGeoJsonSource(
    {
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          id: "trunk-road",
          properties: { highway: "residential" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0.6, 0.4],
              [0.601, 0.4],
            ],
          },
        },
        {
          type: "Feature",
          id: "branch-road",
          properties: { highway: "residential" },
          geometry: {
            type: "LineString",
            coordinates: [
              [0.6005, 0.4],
              [0.6005, 0.4005],
            ],
          },
        },
      ],
    },
    {
      origin,
      datasetRevision: "t-junction-test-2",
      source: { kind: "osm", revision: "1", licence: "ODbL-1.0" },
    },
  );

  const trunk2 = worldSameLayer.roads.find((r) => r.localId.includes("trunk-road"))!;
  const branch2 = worldSameLayer.roads.find((r) => r.localId.includes("branch-road"))!;
  expect(trunk2.connectorIds).toContain(branch2.localId);
  expect(branch2.connectorIds).toContain(trunk2.localId);
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

test("full geometry fingerprints separate old sampled-point collisions and expose ambiguous legacy aliases", () => {
  const makeFeature = (coordinates: number[][]) => ({
    type: "Feature" as const,
    properties: { building: "yes" },
    geometry: { type: "Polygon" as const, coordinates: [coordinates] },
  });
  const first = makeFeature([
    [0.6, 0.4],
    [0.6001, 0.4],
    [0.6001, 0.4001],
    [0.6, 0.4001],
    [0.6, 0.4],
  ]);
  const second = makeFeature([
    [0.6, 0.4],
    [0.6002, 0.4],
    [0.6001, 0.4001],
    [0.5999, 0.4001],
    [0.6, 0.4],
  ]);
  const result = normalizeGeoJsonSourceWithAliases(
    { type: "FeatureCollection", features: [first, second] },
    {
      origin,
      datasetRevision: "sampled-collision-v1",
      source: { kind: "osm", namespace: "primary", revision: "rev-1", licence: "ODbL-1.0" },
    },
  );

  expect(result.world.buildings).toHaveLength(2);
  expect(result.world.buildings[0]!.localId).not.toBe(result.world.buildings[1]!.localId);
  expect(result.idAliases).toHaveLength(2);
  expect(result.idAliases[0]!.legacyId).toBe(result.idAliases[1]!.legacyId);
  expect(new Set(result.idAliases.map((alias) => alias.localId)).size).toBe(2);
});

test("explicit feature IDs are source-namespaced and stable across revisions and inserted features", () => {
  const feature = {
    type: "Feature" as const,
    id: 123,
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
  const world = (namespace: string, revision: string, features = [feature]) =>
    normalizeGeoJsonSource(
      { type: "FeatureCollection", features },
      {
        origin,
        datasetRevision: `dataset-${revision}`,
        source: { kind: "overture", namespace, revision, licence: "CC-BY-4.0" },
      },
    );

  const original = world("overture", "rev-1");
  const rebuilt = world("overture", "rev-2", [
    {
      ...feature,
      id: "unrelated-insert",
      geometry: {
        ...feature.geometry,
        coordinates: [
          [
            [0.601, 0.4],
            [0.6011, 0.4],
            [0.6011, 0.4001],
            [0.601, 0.4001],
            [0.601, 0.4],
          ],
        ],
      },
    },
    feature,
  ]);
  const primary = world("primary", "rev-1");

  expect(original.buildings[0]?.localId).toBe("building-overture-123");
  expect(
    rebuilt.buildings.find((building) => building.localId === original.buildings[0]?.localId),
  ).toBeDefined();
  expect(primary.buildings[0]?.localId).toBe("building-123");
  expect(primary.buildings[0]?.localId).not.toBe(original.buildings[0]?.localId);
});

test("MultiLineString component IDs survive component reorder", () => {
  const feature = {
    type: "Feature" as const,
    id: "multi-road",
    properties: { highway: "residential" },
    geometry: {
      type: "MultiLineString" as const,
      coordinates: [
        [
          [0.6, 0.4],
          [0.6001, 0.4],
        ],
        [
          [0.6, 0.4002],
          [0.6001, 0.4002],
        ],
      ],
    },
  };
  const normalize = (coordinates: typeof feature.geometry.coordinates) =>
    normalizeGeoJsonSource(
      {
        type: "FeatureCollection",
        features: [{ ...feature, geometry: { type: "MultiLineString", coordinates } }],
      },
      {
        origin,
        datasetRevision: "multi-line-reorder",
        source: { kind: "osm", namespace: "primary", revision: "rev-1", licence: "ODbL-1.0" },
      },
    )
      .roads.map((road) => road.localId)
      .sort();

  expect(normalize(feature.geometry.coordinates)).toEqual(
    normalize([...feature.geometry.coordinates].reverse()),
  );
});

test("explicit parent references are exact and unresolved references fail closed", () => {
  const parent = {
    type: "Feature" as const,
    id: "building-alpha",
    properties: { building: "yes" },
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
  const part = {
    type: "Feature" as const,
    id: "part-alpha",
    properties: { "building:part": "yes", "building:parent": "alpha" },
    geometry: {
      type: "Polygon" as const,
      coordinates: [
        [
          [0.60005, 0.40005],
          [0.6001, 0.40005],
          [0.6001, 0.4001],
          [0.60005, 0.4001],
          [0.60005, 0.40005],
        ],
      ],
    },
  };

  expect(() =>
    normalizeGeoJsonSource(
      { type: "FeatureCollection", features: [parent, part] },
      {
        origin,
        datasetRevision: "parent-exact",
        source: { kind: "osm", revision: "rev-1", licence: "ODbL-1.0" },
      },
    ),
  ).toThrow("GEOJSON_PART_PARENT_NOT_FOUND");
});

test("unclassified polygons and unsupported geometry types are rejected rather than omitted", () => {
  const polygon = {
    type: "Feature" as const,
    properties: { landuse: "grass" },
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
  expect(() =>
    normalizeGeoJsonSource(
      { type: "FeatureCollection", features: [polygon] },
      {
        origin,
        datasetRevision: "unclassified",
        source: { kind: "osm", revision: "1", licence: "ODbL-1.0" },
      },
    ),
  ).toThrow("GEOJSON_POLYGON_UNCLASSIFIED");

  const point = {
    type: "Feature",
    properties: { amenity: "bench" },
    geometry: { type: "Point", coordinates: [0.6, 0.4] },
  } as unknown as import("./normalize").GeoJsonFeature;
  expect(() =>
    normalizeGeoJsonSource(
      { type: "FeatureCollection", features: [point] },
      {
        origin,
        datasetRevision: "unsupported-point",
        source: { kind: "osm", revision: "1", licence: "ODbL-1.0" },
      },
    ),
  ).toThrow("GEOJSON_GEOMETRY_TYPE_UNSUPPORTED");
});
