import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDemoLayout, daylightAt, overlapsHome, seededRandom } from "@/engine/demoLayout";
import { DEMO_CONFIG } from "@/config/demo";
import { vietnamTime } from "@/lib/vietnamTime";
import { bindCapture, captureDemoFrame } from "@/engine/capture";
import { useAppStore } from "@/state/appStore";
const initialState = useAppStore.getState();
beforeEach(() => {
  useAppStore.setState(initialState, true);
  bindCapture(null);
});
describe("fictional public demo", () => {
  it("has an empty origin plot and a bounded, deterministic invented layout", () => {
    const layout = createDemoLayout();
    expect(layout).toEqual(createDemoLayout());
    expect(layout.length).toBeGreaterThan(40);
    expect(layout.every((b) => !overlapsHome(b))).toBe(true);
    expect(layout.every((b) => b.floors >= 1 && b.floors <= 4 && Math.abs(b.x) <= 54)).toBe(true);
    expect(createDemoLayout(42)).not.toEqual(layout);
  });
  it("never enables live location, live weather or real street data", () => {
    expect(DEMO_CONFIG).toMatchObject({
      mode: "fictional",
      realStreetEnabled: false,
      realWeatherEnabled: false,
      privateDataEnabled: false,
    });
    expect(Object.keys(DEMO_CONFIG).join(" ")).not.toMatch(/latitude|longitude|address|endpoint/i);
  });
  it("has repeatable random values and correct day/night intensity", () => {
    const a = seededRandom(9),
      b = seededRandom(9);
    for (let i = 0; i < 20; i++) {
      const value = a();
      expect(value).toBe(b());
      expect(value).toBeGreaterThanOrEqual(0);
      expect(value).toBeLessThan(1);
    }
    expect(daylightAt(0)).toBe(0);
    expect(daylightAt(720)).toBeCloseTo(1);
    expect(daylightAt(1200)).toBe(0);
  });
});
describe("Vietnam time independent of host timezone", () => {
  it("rolls over to the next weekday at UTC+7 midnight", () => {
    expect(vietnamTime(new Date("2026-10-12T17:30:00Z"))).toEqual({ minutes: 30, weekday: 2 });
    expect(vietnamTime(new Date("2026-10-12T16:59:00Z"))).toEqual({ minutes: 1439, weekday: 1 });
  });
});
describe("demo captures and reset", () => {
  it("does not claim capture success until a renderer is bound", () => {
    expect(captureDemoFrame()).toBeNull();
    bindCapture(() => "data:image/png;base64,demo");
    expect(captureDemoFrame()).toBe("data:image/png;base64,demo");
    bindCapture(() => {
      throw new Error("lost context");
    });
    expect(captureDemoFrame()).toBeNull();
  });
  it("keeps only four captures in memory and can clear them", () => {
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(1)
      .mockReturnValueOnce(2)
      .mockReturnValueOnce(3)
      .mockReturnValueOnce(4)
      .mockReturnValueOnce(5);
    for (let i = 0; i < 5; i++)
      useAppStore.getState().addMoment(`data:image/png;base64,${btoa(`image-${i}`)}`);
    expect(useAppStore.getState().moments).toHaveLength(4);
    expect(useAppStore.getState().moments[0]).not.toHaveProperty("image");
    expect(JSON.stringify(useAppStore.getState().moments)).not.toContain("image-");
    useAppStore.getState().clearMoments();
    expect(useAppStore.getState().moments).toEqual([]);
    vi.restoreAllMocks();
  });
  it("returns to the home-centred diorama and starts with time paused", () => {
    expect(useAppStore.getState().timeSpeed).toBe(0);
    useAppStore.getState().setViewMode("walk");
    useAppStore.getState().setHeading(90);
    useAppStore.getState().zoomIn();
    useAppStore.getState().resetView();
    expect(useAppStore.getState()).toMatchObject({ heading: 0, zoom: 1, viewMode: "diorama" });
    const revision = useAppStore.getState().viewReset;
    useAppStore.getState().resetView();
    expect(useAppStore.getState().viewReset).toBe(revision + 1);
  });
});
