import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildPovRoute } from "@/engine/life/pov";
import { EPSILON } from "@/world/geometry";
import { HOME_NEIGHBORHOOD } from "@/world/homeNeighborhood";
import type { Position2, WorldData } from "@/world/schema";

// SHA-256 of JSON.stringify(buildPovRoute(HOME_NEIGHBORHOOD)) produced under Node/V8 by the
// exhaustive (pre-broadphase) route builder at b6293467. Regenerate with
// `node scripts/pov-route-golden.mjs <rev>`; see docs/POV_ROUTE_GOLDEN.md.
const G1_POV_ROUTE_SHA256 = "16d5114bf397daaa4123d6af27401e80c6193539efced3a57ed14d6aaf362dc7";
const G1_POV_ROUTE_SEGMENTS = 43;

describe("POV route on the fixed home neighbourhood (G1)", () => {
  it("is byte-identical to the exhaustive point-in-polygon route", () => {
    const route = buildPovRoute(HOME_NEIGHBORHOOD);
    expect(route).toHaveLength(G1_POV_ROUTE_SEGMENTS);
    const hash = createHash("sha256").update(JSON.stringify(route)).digest("hex");
    expect(hash).toBe(G1_POV_ROUTE_SHA256);
  });
});

// G1 never rejects an edge, so the golden above only locks output. This synthetic world
// drives the collision check itself: road "a" (0,0)→(10,0) then road "b" (10,0)→(20,0).
// Probes on "b" sit every 0.5 m along x, at the centreline and ±0.36 m.
const road = (localId: string, polylineENU: Position2[]) => ({
  localId,
  polylineENU,
  roadClass: "residential",
  direction: "both",
  carriagewayWidth: 4,
  sidewalkWidths: [1, 1],
  attributes: {},
});
const building = (localId: string, ring: Position2[]) => ({
  localId,
  geometry: { type: "Polygon", coordinates: [[...ring, ring[0]!]] },
});
const syntheticWorld = (buildings: ReturnType<typeof building>[]) =>
  ({
    manifest: {
      schemaVersion: "1.0",
      datasetRevision: "pov-broadphase",
      units: "metres",
      frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
      isSynthetic: true,
      chunks: [],
      assetHashes: {},
      licences: [],
      coverage: { quality: "synthetic", sourceCount: 1 },
    },
    roads: [
      road("a", [
        [0, 0],
        [10, 0],
      ]),
      road("b", [
        [10, 0],
        [20, 0],
      ]),
    ],
    lots: [],
    buildings,
  }) as unknown as WorldData;
const onlyRoadA = [{ ax: 0, az: 0, bx: 10, bz: 0, length: 10 }];

describe("POV route collision broadphase (synthetic)", () => {
  it("routes over both roads when nothing blocks them", () => {
    expect(buildPovRoute(syntheticWorld([]))).toEqual([
      ...onlyRoadA,
      { ax: 10, az: 0, bx: 20, bz: 0, length: 10 },
    ]);
  });

  it("drops a road edge that a building overlaps", () => {
    const blocker = building("over-b", [
      [14, -1],
      [16, -1],
      [16, 1],
      [14, 1],
    ]);
    expect(buildPovRoute(syntheticWorld([blocker]))).toEqual(onlyRoadA);
  });

  it("drops a road edge whose probe is on a building edge just outside its raw bounds", () => {
    // The sliver's bottom edge is exactly EPSILON north of the centreline probe (15, 0). The
    // probe is outside the raw bbox, yet pointInPolygon counts it as on that edge, so only a
    // broadphase padded by EPSILON with inclusive (>=/<=) bounds keeps the exhaustive result.
    // The sliver is 0.2 m wide and 0.3 m tall, clear of every other probe (14.86, 15.14 and
    // z = ±0.36).
    const edgeZ = EPSILON;
    const sliver = building("touches-b", [
      [14.9, edgeZ],
      [15.1, edgeZ],
      [15.1, 0.3],
      [14.9, 0.3],
    ]);
    expect(buildPovRoute(syntheticWorld([sliver]))).toEqual(onlyRoadA);
  });
});
