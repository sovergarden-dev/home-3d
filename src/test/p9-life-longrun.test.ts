import { describe, expect, it } from "vitest";
import { createLifeSimulation, lifeRadius, type LifeKind } from "@/engine/life/simulation";
import type { Lot, Position2, RoadSegment, WorldData } from "@/world/schema";

const provenance = { source: "synthetic" as const, quality: "synthetic" as const };
const road = (id: string, points: Position2[], width = 8): RoadSegment => ({
  localId: id,
  polylineENU: points,
  connectorIds: [],
  roadClass: "residential",
  carriagewayWidth: width,
  elevationLayer: 0,
  direction: "both",
  provenance,
});
const world = (roads: RoadSegment[], lots: Lot[] = []): WorldData => ({
  manifest: {
    schemaVersion: "1.0",
    datasetRevision: "p9-longrun",
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
const vehicles = new Set<LifeKind>(["motorbike", "car", "bus", "tricycle", "bicycle"]);

const emptyLot = (status: Lot["status"] = "empty"): Lot => ({
  localId: "empty",
  status,
  confirmed: false,
  geometry: { type: "Polygon", coordinates: [[]] },
  provenance,
});

describe("P9 life long-run invariants", () => {
  it("runs 600 seconds over a synthetic crossing with separation on every sampled step", () => {
    const crossing = world([
      road("east-west", [
        [-80, 0],
        [80, 0],
      ]),
      road("north-south", [
        [0, -80],
        [0, 80],
      ]),
    ]);
    const sim = createLifeSimulation(crossing, 17);
    let moved = 0,
      lateMoved = 0;
    for (let step = 0; step < 18_000; step++) {
      const before = sim.agents.map((agent) => `${agent.x}:${agent.z}`);
      sim.update(1 / 30, { speed: 1, tier: "mid", hour: 12 });
      if (step % 10 === 0) {
        const activeVehicles = sim.agents.filter(
          (agent) => agent.active && vehicles.has(agent.kind),
        );
        for (let i = 0; i < activeVehicles.length; i++)
          for (let j = i + 1; j < activeVehicles.length; j++)
            expect(
              Math.hypot(
                activeVehicles[i]!.x - activeVehicles[j]!.x,
                activeVehicles[i]!.z - activeVehicles[j]!.z,
              ),
            ).toBeGreaterThanOrEqual(
              lifeRadius(activeVehicles[i]!.kind) + lifeRadius(activeVehicles[j]!.kind) + 0.1,
            );
      }
      if (sim.agents.some((agent, index) => `${agent.x}:${agent.z}` !== before[index])) {
        moved++;
        if (step > 16200) lateMoved++;
      }
    }
    expect(sim.clock).toBeGreaterThanOrEqual(599.99);
    expect(moved).toBeGreaterThan(100);
    expect(lateMoved).toBeGreaterThan(100);
    expect(sim.diagnostics.edgeTransitions).toBeGreaterThan(10);
    expect(sim.diagnostics.droppedCatchup).toBe(0);
  }, 20_000);

  it("is deterministic across fixed-step partitions and supports all speed modes", () => {
    const crossing = world([
      road(
        "east-west",
        [
          [-40, 0],
          [40, 0],
        ],
        9,
      ),
      road(
        "north-south",
        [
          [0, -40],
          [0, 40],
        ],
        9,
      ),
    ]);
    const one = createLifeSimulation(crossing, 99),
      two = createLifeSimulation(crossing, 99);
    for (let i = 0; i < 900; i++) one.update(1 / 30, { speed: 1, tier: "low" });
    for (let i = 0; i < 900; i++) {
      two.update(1 / 60, { speed: 1, tier: "low" });
      two.update(1 / 60, { speed: 1, tier: "low" });
    }
    expect(two.agents).toEqual(one.agents);
    const paused = createLifeSimulation(crossing, 2);
    paused.update(1, { speed: 0, tier: "low" });
    expect(paused.clock).toBe(0);
    const accelerated = createLifeSimulation(crossing, 2);
    accelerated.update(1, { speed: 4, tier: "low" });
    expect(accelerated.clock).toBeGreaterThan(0);
  });

  it("handles density zero, empty or malformed geometry, vendor schedules, and bus widths", () => {
    const wide = createLifeSimulation(
      world([
        road(
          "wide",
          [
            [-400, 0],
            [400, 0],
          ],
          8,
        ),
      ]),
      4,
    );
    wide.update(1, { density: 1, tier: "high", hour: 22 });
    expect(wide.agents.some((agent) => agent.kind === "bus")).toBe(true);
    expect(
      wide.agents
        .filter((agent) => agent.kind === "vendor")
        .every((agent) => agent.fade === 0 && agent.targetSpeed === 0),
    ).toBe(true);
    expect(
      wide.agents
        .filter((agent) => agent.kind === "bus")
        .every((agent) => agent.edge >= 0 && wide.graph.edges[agent.edge]!.width >= 7),
    ).toBe(true);
    const noAnimals = createLifeSimulation(
      world([
        road("road", [
          [-20, 0],
          [20, 0],
        ]),
      ]),
      4,
    );
    noAnimals.update(1, { density: 0, tier: "low" });
    expect(noAnimals.agents).toHaveLength(0);
    const empty = createLifeSimulation(world([], [emptyLot()]), 4);
    empty.update(1, { tier: "low" });
    expect(empty.graph.enabled).toBe(false);
    expect(empty.agents).toHaveLength(0);
    const malformed = createLifeSimulation(world([road("bad", [[NaN, 0]])]), 4);
    malformed.update(1, { tier: "low" });
    expect(malformed.diagnostics.graphEnabled).toBe(false);
    expect(malformed.agents).toHaveLength(0);
  });

  it("keeps 200-actor updates within the 4ms p95 target", () => {
    const sim = createLifeSimulation(
      world([
        road(
          "long",
          [
            [-1600, 0],
            [1600, 0],
          ],
          9,
        ),
      ]),
      123,
    );
    const samples: number[] = [];
    for (let frame = 0; frame < 600; frame++) {
      const start = performance.now();
      sim.update(1 / 30, { tier: "mid", speed: 1 });
      samples.push(performance.now() - start);
    }
    samples.sort((a, b) => a - b);
    const p50 = samples[Math.floor(samples.length * 0.5)]!,
      p95 = samples[Math.floor(samples.length * 0.95)]!;
    console.info(
      `P9 life update performance: actors=${sim.agents.length} frames=600 p50=${p50.toFixed(3)}ms p95=${p95.toFixed(3)}ms`,
    );
    expect(sim.agents.length).toBeGreaterThanOrEqual(100);
    expect(p95).toBeLessThanOrEqual(4);
  });
});

it("never places or moves agents into source footprints or an empty lot, and leaves source untouched", () => {
  const input = world([
    road("blocked-building", [
      [-40, 0],
      [40, 0],
    ]),
    road("blocked-empty-lot", [
      [-40, 20],
      [40, 20],
    ]),
    road("safe", [
      [-80, 50],
      [80, 50],
    ]),
  ]);
  const polygon = (z: number) => ({
    type: "Polygon" as const,
    coordinates: [
      [
        [-8, z - 6],
        [8, z - 6],
        [8, z + 6],
        [-8, z + 6],
        [-8, z - 6],
      ],
    ],
  });
  input.buildings.push({
    localId: "synthetic-footprint",
    geometry: polygon(0),
    footprintKind: "footprint",
    provenance,
  } as WorldData["buildings"][number]);
  input.lots.push({
    localId: "synthetic-empty",
    geometry: polygon(20),
    status: "empty",
    confirmed: false,
    provenance,
  } as Lot);
  const before = JSON.stringify(input),
    sim = createLifeSimulation(input, 3);
  expect(sim.agents.some((a) => a.active)).toBe(true);
  for (let frame = 0; frame < 900; frame++) {
    sim.update(1 / 30, { speed: 1, tier: "mid", hour: 12 });
    for (const agent of sim.agents)
      if (agent.active) {
        expect(Math.abs(agent.x) > 8 || Math.abs(agent.z) > 6).toBe(true);
        expect(Math.abs(agent.x) > 8 || Math.abs(agent.z - 20) > 6).toBe(true);
      }
  }
  expect(JSON.stringify(input)).toBe(before);
});

it("keeps exact tier caps, disables low-tier animals and degrades on observed FPS", () => {
  const input = world([
    road(
      "long",
      [
        [-20000, 0],
        [20000, 0],
      ],
      9,
    ),
  ]);
  const sim = createLifeSimulation(input, 7);
  for (const [tier, cap] of [
    ["low", 60],
    ["mid", 200],
    ["high", 800],
    ["ultra", 2000],
  ] as const) {
    sim.update(0, { speed: 0, tier, fps: 60 });
    expect(sim.agents.length).toBeLessThanOrEqual(cap);
    expect(sim.agents.length).toBeGreaterThan(0);
    if (tier === "low")
      expect(sim.agents.some((a) => ["dog", "cat", "chicken"].includes(a.kind))).toBe(false);
  }
  sim.update(0, { tier: "ultra", fps: 15, speed: 0 });
  expect(sim.diagnostics.tier).toBe("low");
  expect(sim.agents.length).toBeLessThanOrEqual(60);
});
