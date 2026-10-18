import type { GeoJsonFeature, GeoJsonFeatureCollection } from "./normalize";

interface OsmNode {
  type: "node";
  id: number;
  lon: number;
  lat: number;
}

interface OsmWay {
  type: "way";
  id: number;
  nodes: number[];
  tags?: Record<string, string>;
}

interface OsmRelation {
  type: "relation";
  id: number;
  members: { type: "way"; ref: number; role: "outer" | "inner" | "" }[];
  tags?: Record<string, string>;
}

export interface OsmOverpassSnapshot {
  version: number;
  elements: Array<OsmNode | OsmWay | OsmRelation>;
}

function isFinitePosition(node: OsmNode) {
  return (
    Number.isFinite(node.lon) &&
    Number.isFinite(node.lat) &&
    node.lon >= -180 &&
    node.lon <= 180 &&
    node.lat >= -90 &&
    node.lat <= 90
  );
}

function coordinatesForWay(way: OsmWay, nodes: Map<number, OsmNode>) {
  const coordinates: number[][] = [];
  for (const nodeId of way.nodes) {
    const node = nodes.get(nodeId);
    if (!node || !isFinitePosition(node)) return null;
    coordinates.push([node.lon, node.lat]);
  }
  return coordinates;
}

function isClosed(coordinates: number[][]) {
  const first = coordinates[0];
  const last = coordinates.at(-1);
  return Boolean(first && last && first[0] === last[0] && first[1] === last[1]);
}

function tagsFor(way: OsmWay | OsmRelation) {
  return way.tags ?? {};
}

function isBuilding(tags: Record<string, string>) {
  return Boolean(tags["building"] || tags["building:part"]);
}

function isRoad(tags: Record<string, string>) {
  return Boolean(tags["highway"]);
}

function feature(
  id: string,
  properties: Record<string, string>,
  geometry: GeoJsonFeature["geometry"],
): GeoJsonFeature {
  return { type: "Feature", id, properties, geometry };
}

export function osmOverpassToGeoJson(snapshot: OsmOverpassSnapshot): GeoJsonFeatureCollection {
  if (!Number.isFinite(snapshot.version) || !Array.isArray(snapshot.elements)) {
    throw new Error("OSM_OVERPASS_SNAPSHOT_INVALID");
  }
  const nodes = new Map<number, OsmNode>();
  const ways = new Map<number, OsmWay>();
  snapshot.elements.forEach((element) => {
    if (element.type === "node") nodes.set(element.id, element);
    if (element.type === "way") ways.set(element.id, element);
  });

  const features: GeoJsonFeature[] = [];
  for (const way of ways.values()) {
    const tags = tagsFor(way);
    const coordinates = coordinatesForWay(way, nodes);
    if (!coordinates) continue;
    if (isBuilding(tags) && coordinates.length >= 4 && isClosed(coordinates)) {
      features.push(
        feature(`way/${way.id}`, tags, { type: "Polygon", coordinates: [coordinates] }),
      );
      continue;
    }
    if (isRoad(tags) && coordinates.length >= 2) {
      features.push(feature(`way/${way.id}`, tags, { type: "LineString", coordinates }));
    }
  }

  for (const relation of snapshot.elements.filter(
    (element): element is OsmRelation => element.type === "relation",
  )) {
    const tags = tagsFor(relation);
    if (!isBuilding(tags) || tags["type"] !== "multipolygon") continue;
    const outer: number[][][] = [];
    const inner: number[][][] = [];
    let valid = true;
    for (const member of relation.members) {
      const way = ways.get(member.ref);
      const coordinates = way ? coordinatesForWay(way, nodes) : null;
      if (!coordinates || coordinates.length < 4 || !isClosed(coordinates)) {
        valid = false;
        break;
      }
      if (member.role === "outer") outer.push(coordinates);
      if (member.role === "inner") inner.push(coordinates);
    }
    if (!valid || outer.length === 0) continue;
    const polygons = outer.map((ring, index) => [ring, ...(index === 0 ? inner : [])]);
    features.push(
      feature(`relation/${relation.id}`, tags, { type: "MultiPolygon", coordinates: polygons }),
    );
  }

  return { type: "FeatureCollection", features };
}
