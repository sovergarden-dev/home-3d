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
