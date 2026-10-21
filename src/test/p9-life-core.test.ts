import { describe, expect, it } from "vitest";
import { buildLifeGraph } from "@/engine/life/graph";
import { createLifeSimulation } from "@/engine/life/simulation";
import type { Lot, Position2, RoadSegment, WorldData } from "@/world/schema";

const road = (
  id: string,
  points: Position2[],
  width: number | undefined = 6,
  direction: RoadSegment["direction"] = "both",
): RoadSegment => ({
  localId: id,
  polylineENU: points,
  connectorIds: [],
  roadClass: "residential",
  carriagewayWidth: width,
  elevationLayer: 0,
  direction,
  provenance: { source: "synthetic", quality: "synthetic" },
});
const world = (roads: RoadSegment[], lots: Lot[] = []): WorldData => ({
  manifest: {
    schemaVersion: "1.0",
    datasetRevision: "p9-test",
    units: "metres",
    frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
    isSynthetic: true,
    chunks: [],
    assetHashes: {},
    licences: ["test"],
    coverage: { quality: "synthetic", sourceCount: 1 },
  },
  roads,
  buildings: [],
  lots,
});

describe("P9 life graph and simulation", () => {
  it("is deterministic, fixed-step, speed aware, and capped by tier", () => {
    const w = world([
      road("main", [
        [-30, 0],
        [30, 0],
      ]),
    ]);
    const a = createLifeSimulation(w, 42),
      b = createLifeSimulation(w, 42);
    a.update(2, { speed: 1, tier: "low", visible: true });
    b.update(2, { speed: 1, tier: "low", visible: true });
    expect(a.diagnostics.agentCount).toBeLessThanOrEqual(60);
    expect(a.agents).toEqual(b.agents);
    const before = a.clock;
    a.update(1, { speed: 0, tier: "low", visible: true });
    expect(a.clock).toBe(before);
  });
  it("disables invalid graphs and tolerates NaN, short and duplicate roads", () => {
    const graph = buildLifeGraph(
      world([
        road("bad", [[NaN, 0]], NaN),
        road("dup", [
          [0, 0],
          [0, 0],
        ]),
      ]),
    );
    expect(graph.enabled).toBe(false);
    expect(graph.disabledReason).toBeTruthy();
  });
  it("preserves one-way direction and infers missing road dimensions", () => {
    const graph = buildLifeGraph(
      world([
        road(
          "one",
          [
            [0, 0],
            [20, 0],
          ],
          Number.NaN,
          "forward",
        ),
      ]),
    );
    expect(graph.enabled).toBe(true);
    expect(
      graph.edges.every(
        (edge) => edge.width > 0 && edge.inferredWidth && edge.direction === "forward",
      ),
    ).toBe(true);
    expect(graph.edges).toHaveLength(1);
  });
  it("never places agents inside footprint lots", () => {
    const lot = {
      localId: "lot",
      status: "final" as const,
      confirmed: true,
      geometry: {
        type: "Polygon" as const,
        coordinates: [
          [
            [-8, -8] as Position2,
            [8, -8] as Position2,
            [8, 8] as Position2,
            [-8, 8] as Position2,
            [-8, -8] as Position2,
          ],
        ],
      },
      provenance: { source: "synthetic" as const, quality: "synthetic" as const },
    };
    const sim = createLifeSimulation(
      world(
        [
          road("edge", [
            [-30, 0],
            [30, 0],
          ]),
        ],
        [lot],
      ),
      3,
    );
    sim.update(10, { speed: 1, tier: "mid", visible: true });
    for (const agent of sim.agents)
      expect(Math.abs(agent.x) > 8 || Math.abs(agent.z) > 8).toBe(true);
  });
});
