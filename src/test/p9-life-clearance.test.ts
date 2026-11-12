import { expect, it } from "vitest";
import { createLifeSimulation } from "@/engine/life/simulation";
import type { Lot, Position2, SurfaceGeometry } from "@/world/schema";
import { provenance, road, world } from "./fixtures/p9-longrun-world";

it("excludes distant footprints before sampling road clearance", () => {
  let reads = 0;
  const coordinates: Position2[][] = [
    [
      [-10, 100],
      [10, 100],
      [10, 120],
      [-10, 120],
      [-10, 100],
    ],
  ];
  const geometry: SurfaceGeometry = {
    type: "Polygon",
    get coordinates() {
      reads++;
      return coordinates;
    },
  };
  const remoteLot: Lot = {
    localId: "remote-lot",
    status: "final",
    confirmed: true,
    geometry,
    provenance,
  };
  const roads = [
    road("street", [
      [-50, 0],
      [50, 0],
    ]),
  ];
  const baseline = createLifeSimulation(world(roads), 23);
  const indexed = createLifeSimulation(world(roads, [remoteLot]), 23);
  for (let frame = 0; frame < 60; frame++) {
    baseline.update(1 / 30, { tier: "mid", speed: 1 });
    indexed.update(1 / 30, { tier: "mid", speed: 1 });
  }
  expect(indexed.agents).toEqual(baseline.agents);
  expect(reads).toBeLessThan(100);
  baseline.dispose();
  indexed.dispose();
});

it("handles empty and multipolygon geometry in broadphase without throwing", () => {
  const emptyLot: Lot = {
    localId: "empty-lot",
    status: "final",
    confirmed: true,
    geometry: { type: "Polygon", coordinates: [] },
    provenance,
  };
  const multiLot: Lot = {
    localId: "multi-lot",
    status: "final",
    confirmed: true,
    geometry: {
      type: "MultiPolygon",
      coordinates: [
        [
          [
            [-5, 105],
            [5, 105],
            [5, 115],
            [-5, 115],
            [-5, 105],
          ],
        ],
        [
          [
            [-5, -115],
            [5, -115],
            [5, -105],
            [-5, -105],
            [-5, -115],
          ],
        ],
      ],
    },
    provenance,
  };
  const nearLot: Lot = {
    localId: "near-lot",
    status: "final",
    confirmed: true,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [-5, 5],
          [5, 5],
          [5, 15],
          [-5, 15],
          [-5, 5],
        ],
      ],
    },
    provenance,
  };
  const roads = [
    road("street", [
      [-50, 0],
      [50, 0],
    ]),
  ];
  const sim = createLifeSimulation(world(roads, [emptyLot, multiLot, nearLot]), 42);
  sim.update(1 / 30, { tier: "mid", speed: 1 });
  expect(sim.agents.length).toBeGreaterThan(0);
  sim.dispose();
});
