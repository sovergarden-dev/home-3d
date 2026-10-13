import { expect, test } from "bun:test";
import { osmOverpassToGeoJson } from "./osm";

test("converts a synthetic OSM Overpass node/way snapshot to GeoJSON without guessing geometry", () => {
  const result = osmOverpassToGeoJson({
    version: 0.6,
    elements: [
      { type: "node", id: 1, lon: 0.6, lat: 0.4 },
      { type: "node", id: 2, lon: 0.6001, lat: 0.4 },
      { type: "node", id: 3, lon: 0.6001, lat: 0.4001 },
      { type: "node", id: 4, lon: 0.6, lat: 0.4001 },
      {
        type: "way",
        id: 10,
        nodes: [1, 2, 3, 4, 1],
        tags: { building: "yes", "building:levels": "2" },
      },
      { type: "way", id: 11, nodes: [1, 3], tags: { highway: "residential", oneway: "yes" } },
    ],
  });

  expect(result.type).toBe("FeatureCollection");
  expect(result.features).toHaveLength(2);
  expect(result.features.find((feature) => feature.id === "way/10")?.geometry?.type).toBe(
    "Polygon",
  );
  expect(result.features.find((feature) => feature.id === "way/11")?.geometry?.type).toBe(
    "LineString",
  );
});
