import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildPovRoute } from "@/engine/life/pov";
import { EPSILON, pointInPolygon, surfaceBounds } from "@/world/geometry";
import { HOME_NEIGHBORHOOD } from "@/world/homeNeighborhood";
import type { PolygonGeometry } from "@/world/schema";

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

  it("keeps on-boundary hits inside the EPSILON-padded broadphase bounds", () => {
    const square: PolygonGeometry = {
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
    const bounds = surfaceBounds(square);
    // Just outside the ring but within EPSILON of an edge: pointInPolygon still counts it,
    // so the broadphase must not reject it.
    const onEdge: [number, number] = [bounds.maxX + EPSILON / 2, 0];
    expect(pointInPolygon(onEdge, square)).toBe(true);
    expect(onEdge[0] <= bounds.maxX + EPSILON).toBe(true);
    // Beyond EPSILON the exact test rejects too, so skipping it there changes nothing.
    expect(pointInPolygon([bounds.maxX + EPSILON * 2, 0], square)).toBe(false);
  });
});
