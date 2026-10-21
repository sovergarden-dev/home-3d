import { describe, expect, it } from "vitest";
import {
  festivalForDate,
  getEffectiveFestival,
  getEffectiveSeason,
  parseIsoDate,
  solarToLunar,
} from "@/atmosphere/calendar";
const d = (s: string) => parseIsoDate(s)!;
// Independent civil-date evidence and URLs are recorded in docs/P8_CALENDAR_GOLDENS.md.
const goldens = [
  [2025, "2025-01-29", "2025-10-06"],
  [2026, "2026-02-17", "2026-09-25"],
  [2027, "2027-02-06", "2027-09-15"],
  [2028, "2028-01-26", "2028-10-03"],
  [2029, "2029-02-13", "2029-09-22"],
  [2030, "2030-02-02", "2030-09-12"],
  [2031, "2031-01-23", "2031-10-01"],
  [2032, "2032-02-11", "2032-09-19"],
  [2033, "2033-01-31", "2033-09-08"],
  [2034, "2034-02-19", "2034-09-26"],
  [2035, "2035-02-08", "2035-09-16"],
] as const;
const offset = (date: string, days: number) =>
  new Date(Date.parse(`${date}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
describe("P8 Vietnamese UTC+7 calendar", () => {
  for (const [year, tet, mid] of goldens) {
    it(`computes Tet ${year} including lunar year and three-day window`, () => {
      expect(solarToLunar(d(tet))).toEqual({ year, month: 1, day: 1, leap: false });
      for (let i = 0; i < 3; i++) expect(festivalForDate(d(offset(tet, i)))).toBe("tet");
      for (const i of [-1, 3]) expect(festivalForDate(d(offset(tet, i)))).toBe("normal");
    });
    it(`computes Vietnamese Mid-Autumn ${year}`, () => {
      expect(solarToLunar(d(mid))).toEqual({ year, month: 8, day: 15, leap: false });
      expect(festivalForDate(d(mid))).toBe("midautumn");
      for (const i of [-1, 1]) expect(festivalForDate(d(offset(mid, i)))).not.toBe("midautumn");
    });
  }
  it("distinguishes Vietnamese UTC+7 from UTC+8 at the 2030 Tet boundary", () => {
    expect(solarToLunar(d("2030-02-02"), 7)).toMatchObject({ year: 2030, month: 1, day: 1 });
    expect(solarToLunar(d("2030-02-02"), 8)).toMatchObject({ year: 2029, month: 12, day: 30 });
  });
  it("identifies leap-six 2025 and does not shift Tet or Mid-Autumn into it", () => {
    expect(solarToLunar(d("2025-07-25"))).toEqual({ year: 2025, month: 6, day: 1, leap: true });
    expect(festivalForDate(d("2025-07-25"))).toBe("normal");
  });
  it("supports fixed-date festivals and explicit manual Everyday override", () => {
    for (const date of ["2026-12-24", "2026-12-25"])
      expect(festivalForDate(d(date))).toBe("christmas");
    expect(festivalForDate(d("2026-04-30"))).toBe("reunification");
    expect(festivalForDate(d("2026-09-02"))).toBe("national");
    expect(
      getEffectiveFestival({ festivalAuto: false, festival: "normal", selectedDate: "2026-02-17" }),
    ).toBe("normal");
    expect(
      getEffectiveFestival({ festivalAuto: false, festival: "tet", selectedDate: "2026-06-21" }),
    ).toBe("tet");
  });
  it("bounds valid dates and uses a declared simulated season convention", () => {
    for (const date of ["2026-02-29", "2028-02-30", "2026-13-01", "1899-01-01", "2101-01-01", ""])
      expect(parseIsoDate(date)).toBeNull();
    expect(parseIsoDate("2028-02-29")).toEqual({ year: 2028, month: 2, day: 29 });
    expect(() => solarToLunar({ year: 2026, month: 2, day: 30 })).toThrow("CALENDAR_DATE_INVALID");
    for (const month of [5, 11])
      expect(
        getEffectiveSeason({
          season: "auto",
          selectedDate: `2026-${String(month).padStart(2, "0")}-01`,
        }),
      ).toBe("wet");
    for (const month of [1, 4, 12])
      expect(
        getEffectiveSeason({
          season: "auto",
          selectedDate: `2026-${String(month).padStart(2, "0")}-01`,
        }),
      ).toBe("dry");
    expect(getEffectiveSeason({ season: "wet", selectedDate: "2026-01-01" })).toBe("wet");
  });
});
