import { expect, it, vi } from "vitest";
import { createIllustrativeDetails, planIllustrativeDetails } from "@/engine/illustration/details";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import { useAppStore } from "@/state/appStore";
it("keeps seeded presentation deterministic, bounded and separate from canonical geometry", () => {
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD),
    before = JSON.stringify(world);
  for (const [tier, cap] of [
    ["low", 500],
    ["mid", 1800],
    ["high", 3600],
  ] as const) {
    const a = planIllustrativeDetails(world, tier),
      b = planIllustrativeDetails(world, tier);
    expect(a).toEqual(b);
    expect(a.instances.length).toBeGreaterThan(0);
    expect(a.instances.length).toBeLessThanOrEqual(cap);
    expect(a.categories).toContain("rolling-shutter");
  }
  expect(JSON.stringify(world)).toBe(before);
  useAppStore.getState().setIllustrativeDetails(true);
  expect(useAppStore.getState().illustrativeDetails).toBe(true);
  useAppStore.getState().setIllustrativeDetails(false);
});
it("does not invent a tall facade for unknown real-world height and disposes every owned resource", () => {
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD);
  world.manifest.isSynthetic = false;
  const plan = planIllustrativeDetails(world, "mid");
  expect(plan.categories).not.toContain("balcony");
  const layer = createIllustrativeDetails(SYNTHETIC_NEIGHBORHOOD, "mid");
  expect(layer.group.children.length).toBeLessThanOrEqual(3);
  const disposals = layer.group.children.map((mesh) =>
    vi.spyOn(mesh as unknown as { dispose(): void }, "dispose"),
  );
  layer.dispose();
  layer.dispose();
  expect(layer.group.children).toHaveLength(0);
  for (const dispose of disposals) expect(dispose).toHaveBeenCalledTimes(1);
});
