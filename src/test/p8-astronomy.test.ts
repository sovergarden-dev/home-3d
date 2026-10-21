import { describe, expect, it } from "vitest";
import { getAstronomy, phaseMoon, sunEvents } from "@/atmosphere/astronomy";
const hanoi = { latitude: 21.0285, longitude: 105.8542 };
describe("p8 astronomy", () => {
  it("handles invalid and polar inputs without NaN", () => {
    expect(getAstronomy("bad", 0, hanoi).sun).toBeNull();
    expect(sunEvents("2026-06-21", { latitude: 91, longitude: 0 })).toBeNull();
    expect(sunEvents("2026-06-21", { latitude: 90, longitude: 0 })?.sunriseMinutes).toBeNull();
  });
  it("matches Hanoi June 21 sunrise/sunset reference", () => {
    const e = sunEvents("2026-06-21", hanoi)!;
    expect(e.sunriseMinutes!).toBeGreaterThanOrEqual(313);
    expect(e.sunriseMinutes!).toBeLessThanOrEqual(317);
    expect(e.sunsetMinutes!).toBeGreaterThanOrEqual(1118);
    expect(e.sunsetMinutes!).toBeLessThanOrEqual(1122);
  });
  it("provides a synthetic Vietnam fallback and phase", () => {
    expect(getAstronomy("2026-06-21", 720, null).synthetic).toBe(true);
    expect(phaseMoon("2026-06-21")).toBeGreaterThanOrEqual(0);
  });
});

// NREL SPA tester published numeric output, not derived from this implementation.
it("matches the independent NREL SPA public example to within 0.5 degrees", () => {
  const s = getAstronomy("2003-10-18", 150.5, { latitude: 39.742476, longitude: -105.1786 }).sun!;
  expect(Math.abs(s.azimuth - 194.340241)).toBeLessThan(0.5);
  expect(Math.abs(s.elevation - (90 - 50.111622))).toBeLessThan(0.5);
});

it("rejects dates/minutes outside the documented approximation domain", () => {
  for (const [date, minute] of [
    ["1899-12-31", 720],
    ["2101-01-01", 720],
    ["2026-01-01", -1],
    ["2026-01-01", 1441],
  ] as const)
    expect(getAstronomy(date, minute, null).sun).toBeNull();
});
