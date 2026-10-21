import { describe, expect, it } from "vitest";
import { assessLifecycleMemory } from "../../scripts/h6-lifecycle-memory.mjs";

type Metrics = {
  Documents: number;
  Nodes: number;
  JSEventListeners: number;
  JSHeapUsedSize: number;
};

const row = (cycle: number, metrics: Metrics) => ({
  stage: `cycle-${cycle}`,
  ...metrics,
});

const stableRows = [
  row(5, { Documents: 1, Nodes: 1000, JSEventListeners: 3, JSHeapUsedSize: 10_000_000 }),
  row(10, { Documents: 1, Nodes: 1002, JSEventListeners: 4, JSHeapUsedSize: 10_300_000 }),
  row(15, { Documents: 1, Nodes: 999, JSEventListeners: 3, JSHeapUsedSize: 10_100_000 }),
  row(20, { Documents: 1, Nodes: 1001, JSEventListeners: 4, JSHeapUsedSize: 10_200_000 }),
];

describe("assessLifecycleMemory", () => {
  it("passes stable post-warm-up samples despite light GC and JIT jitter", () => {
    const result = assessLifecycleMemory(stableRows);
    expect(result.passed).toBe(true);
    expect(result.warmStage).toBe("cycle-5");
    expect(result.endStage).toBe("cycle-20");
    expect(result.growth).toEqual({
      Documents: 0,
      Nodes: 1,
      JSEventListeners: 1,
      JSHeapUsedSize: 200_000,
    });
    expect(result.reasonCodes).toEqual([]);
  });

  it("does not label a small monotonic warm-up within the fixed budget a proven leak", () => {
    const samples = [5, 10, 15, 20].map((cycle, index) =>
      row(cycle, {
        Documents: 1,
        Nodes: 1000,
        JSEventListeners: 3,
        JSHeapUsedSize: 10_000_000 + index * 100_000,
      }),
    );
    expect(assessLifecycleMemory(samples).passed).toBe(true);
    expect(assessLifecycleMemory(samples).limits.JSHeapUsedSize).toBe(4 * 1024 * 1024);
  });

  it("fails the old synthetic linear leak before soak and keeps actual growth", () => {
    const result = assessLifecycleMemory([
      row(5, { Documents: 1, Nodes: 21_711, JSEventListeners: 441, JSHeapUsedSize: 36_000_000 }),
      row(10, { Documents: 1, Nodes: 39_641, JSEventListeners: 646, JSHeapUsedSize: 40_000_000 }),
      row(15, { Documents: 1, Nodes: 57_576, JSEventListeners: 851, JSHeapUsedSize: 45_000_000 }),
      row(20, { Documents: 1, Nodes: 75_501, JSEventListeners: 1056, JSHeapUsedSize: 49_000_000 }),
    ]);
    expect(result.passed).toBe(false);
    expect(result.growth).toEqual({
      Documents: 0,
      Nodes: 53_790,
      JSEventListeners: 615,
      JSHeapUsedSize: 13_000_000,
    });
    expect(result.reasonCodes).toEqual(
      expect.arrayContaining([
        "NODES_GROWTH",
        "JS_EVENT_LISTENERS_GROWTH",
        "JS_HEAP_GROWTH",
        "LINEAR_NODES_GROWTH",
        "LINEAR_JSEVENTLISTENERS_GROWTH",
        "LINEAR_JSHEAPUSEDSIZE_GROWTH",
      ]),
    );
  });

  it("fails heap-only growth and preserves negative growth values", () => {
    const result = assessLifecycleMemory([
      row(5, { Documents: 2, Nodes: 100, JSEventListeners: 10, JSHeapUsedSize: 1_000_000 }),
      row(10, { Documents: 2, Nodes: 98, JSEventListeners: 9, JSHeapUsedSize: 2_000_000 }),
      row(15, { Documents: 2, Nodes: 97, JSEventListeners: 8, JSHeapUsedSize: 3_000_000 }),
      row(20, { Documents: 2, Nodes: 95, JSEventListeners: 7, JSHeapUsedSize: 6_000_000 }),
    ]);
    expect(result.passed).toBe(false);
    expect(result.growth).toEqual({
      Documents: 0,
      Nodes: -5,
      JSEventListeners: -3,
      JSHeapUsedSize: 5_000_000,
    });
    expect(result.reasonCodes).toContain("JS_HEAP_GROWTH");
  });

  it("continues the same assessment through soak rows after cycle-20", () => {
    const result = assessLifecycleMemory([
      row(5, { Documents: 1, Nodes: 100, JSEventListeners: 2, JSHeapUsedSize: 1_000_000 }),
      row(10, { Documents: 1, Nodes: 105, JSEventListeners: 3, JSHeapUsedSize: 1_100_000 }),
      row(20, { Documents: 1, Nodes: 110, JSEventListeners: 4, JSHeapUsedSize: 1_200_000 }),
      {
        stage: "soak-1",
        Documents: 1,
        Nodes: 350,
        JSEventListeners: 20,
        JSHeapUsedSize: 6_000_000,
      },
    ]);
    expect(result.passed).toBe(false);
    expect(result.endStage).toBe("soak-1");
    expect(result.growth).toEqual({
      Documents: 0,
      Nodes: 250,
      JSEventListeners: 18,
      JSHeapUsedSize: 5_000_000,
    });
  });

  it("throws loudly for empty, missing, non-finite, or insufficient rows", () => {
    expect(() => assessLifecycleMemory([])).toThrow(TypeError);
    expect(() => assessLifecycleMemory([{ stage: "cycle-5" } as never])).toThrow(/Documents/);
    expect(() =>
      assessLifecycleMemory([
        row(5, { Documents: 1, Nodes: 1, JSEventListeners: 1, JSHeapUsedSize: Number.NaN }),
        row(10, { Documents: 1, Nodes: 1, JSEventListeners: 1, JSHeapUsedSize: 1 }),
        row(20, { Documents: 1, Nodes: 1, JSEventListeners: 1, JSHeapUsedSize: 1 }),
      ]),
    ).toThrow(/JSHeapUsedSize/);
    expect(() =>
      assessLifecycleMemory([
        row(5, { Documents: 1, Nodes: 1, JSEventListeners: 1, JSHeapUsedSize: 1 }),
        row(20, { Documents: 1, Nodes: 1, JSEventListeners: 1, JSHeapUsedSize: 1 }),
      ]),
    ).toThrow(/at least three/);
  });
});
