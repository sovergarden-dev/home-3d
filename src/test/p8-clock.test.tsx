import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { advanceClock, vietnamDateTime } from "@/atmosphere/clock";
import { useClock } from "@/components/overlay/useClock";
import { useAppStore } from "@/state/appStore";
const initial = useAppStore.getState();
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval", "performance"] });
  vi.setSystemTime(new Date("2026-12-31T16:59:59Z"));
  useAppStore.setState(initial, true);
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});
afterEach(() => {
  vi.useRealTimers();
  Object.defineProperty(document, "hidden", { configurable: true, value: false });
});
describe("P8 elapsed clock and lifecycle", () => {
  it.each([
    ["2028-02-28", "2028-02-29"],
    ["2028-02-29", "2028-03-01"],
    ["2026-12-31", "2027-01-01"],
  ])("rolls %s to %s atomically", (date, next) => {
    const result = advanceClock({ minutes: 1439.5, date, lastNow: 0 }, 1000, 1);
    expect(result.date).toBe(next);
    expect(result.minutes).toBeCloseTo(0.5);
  });
  it("does not discard visible elapsed time or drift with irregular ticks", () => {
    const a = advanceClock({ minutes: 100, date: "2026-01-01", lastNow: 0 }, 500, 4);
    const b = advanceClock(a, 22500, 4);
    expect(b.minutes).toBe(190);
    expect(advanceClock(b, 99999, 0).minutes).toBe(190);
    expect(advanceClock(b, Number.NaN, 4)).toBe(b);
  });
  it("pauses hidden duration and resumes without catch-up", () => {
    const paused = advanceClock({ minutes: 100, date: "2026-01-01", lastNow: 0 }, 60000, 4, false);
    const resumed = advanceClock(paused, 61000, 4, true);
    expect(resumed.minutes).toBe(104);
  });
  it.each(["UTC", "America/Los_Angeles", "Asia/Tokyo"])(
    "keeps Vietnam civil date independent of %s machine TZ",
    (tz) => {
      const old = process.env["TZ"];
      process.env["TZ"] = tz;
      try {
        expect(vietnamDateTime(new Date("2028-02-28T17:00:00Z"))).toEqual({
          date: "2028-02-29",
          minutes: 0,
        });
        expect(vietnamDateTime(new Date("2026-12-31T17:00:00Z"))).toEqual({
          date: "2027-01-01",
          minutes: 0,
        });
      } finally {
        if (old === undefined) delete process.env["TZ"];
        else process.env["TZ"] = old;
      }
    },
  );
  it("reanchors after manual preset/date changes, keeps one timer and cleans it up", () => {
    useAppStore.setState({ selectedDate: "2028-02-28", timeOfDayMinutes: 1439, timeSpeed: 1 });
    const h = renderHook(() => useClock());
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(2000));
    expect(useAppStore.getState()).toMatchObject({
      selectedDate: "2028-02-29",
      timeOfDayMinutes: 1,
    });
    act(() => {
      useAppStore.getState().setSelectedDate("2026-06-21");
      useAppStore.getState().setTimeOfDayMinutes(720);
      useAppStore.getState().setTimeSpeed(4);
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(useAppStore.getState()).toMatchObject({
      selectedDate: "2026-06-21",
      timeOfDayMinutes: 724,
    });
    h.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
  it("stops timer while hidden and while paused; realtime restores full Vietnam date", () => {
    useAppStore.setState({ selectedDate: "2026-01-01", timeOfDayMinutes: 100, timeSpeed: 4 });
    const h = renderHook(() => useClock());
    act(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(60000));
    expect(useAppStore.getState().timeOfDayMinutes).toBe(100);
    act(() => {
      Object.defineProperty(document, "hidden", { configurable: true, value: false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    expect(vi.getTimerCount()).toBe(1);
    act(() => vi.advanceTimersByTime(1000));
    expect(useAppStore.getState().timeOfDayMinutes).toBe(104);
    act(() => useAppStore.getState().setTimeSpeed(0));
    expect(vi.getTimerCount()).toBe(0);
    act(() => useAppStore.getState().setRealTimeEnabled(true));
    expect(useAppStore.getState()).toMatchObject({
      selectedDate: "2027-01-01",
      timeOfDayMinutes: 1,
    });
    expect(vi.getTimerCount()).toBe(1);
    h.unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
