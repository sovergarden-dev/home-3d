import { expect, it } from "vitest";
import { createLifeSimulation } from "@/engine/life/simulation";
import { road, world } from "./fixtures/p9-longrun-world";

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
