import { describe, expect, it } from "vitest";
import { loadVerdict, type LoadRow } from "../../scripts/load-verdict.mjs";

const row = (cache: LoadRow["cache"], overrides: Partial<LoadRow> = {}): LoadRow => ({
  cache,
  navigationThrottleObserved: true,
  serviceWorkerThrottled: true,
  shellBudget: true,
  worldBudget: true,
  ...overrides,
});
const rows = [row("cold"), row("cold"), row("warm"), row("warm")];

describe("loadVerdict", () => {
  it("meets or misses a budget only when every sample paid the emulated network", () => {
    expect(loadVerdict(rows, "cold", "shellBudget", [])).toBe("MET");
    expect(loadVerdict(rows, "warm", "worldBudget", [])).toBe("MET");
    expect(
      loadVerdict([...rows, row("cold", { worldBudget: false })], "cold", "worldBudget", []),
    ).toBe("NOT_MET");
  });
  it("cannot verify a sample that finished faster than the emulated latency", () => {
    const fast = [...rows, row("warm", { navigationThrottleObserved: false, worldBudget: false })];
    expect(loadVerdict(fast, "warm", "worldBudget", [])).toBe("NOT_VERIFIED");
  });
  it("needs each warm sample's own worker throttled, whatever the total count", () => {
    const unthrottled = [...rows, row("warm", { serviceWorkerThrottled: false })];
    expect(loadVerdict(unthrottled, "warm", "shellBudget", [])).toBe("NOT_VERIFIED");
    // Cold navigations do not go through the worker.
    const cold = [...rows, row("cold", { serviceWorkerThrottled: false })];
    expect(loadVerdict(cold, "cold", "shellBudget", [])).toBe("MET");
  });
  it("leaves every verdict unverified after a throttle failure or without samples", () => {
    expect(loadVerdict(rows, "cold", "shellBudget", ["CDP_ERROR attach"])).toBe("NOT_VERIFIED");
    expect(loadVerdict([], "warm", "worldBudget", [])).toBe("NOT_VERIFIED");
  });
});
