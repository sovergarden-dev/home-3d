import type { WorldDataProvider } from "@/world/privateWorldSession";
import { describe, expect, it, vi } from "vitest";
import {
  classifyWmoCode,
  createOpenMeteoWeatherAdapter,
  parseOpenMeteoCurrent,
} from "@/atmosphere/weatherOpenMeteo";

const current = {
  time: "2026-10-21T12:00+07:00",
  temperature_2m: 29,
  relative_humidity_2m: 70,
  apparent_temperature: 31,
  is_day: 1,
  precipitation: 0,
  rain: 0,
  showers: 0,
  snowfall: 0,
  weather_code: 1,
  cloud_cover: 10,
  wind_speed_10m: 12,
  wind_direction_10m: 90,
};
const units = {
  temperature_2m: "°C",
  relative_humidity_2m: "%",
  apparent_temperature: "°C",
  is_day: "",
  precipitation: "mm",
  rain: "mm",
  showers: "mm",
  snowfall: "cm",
  weather_code: "wmo code",
  cloud_cover: "%",
  wind_speed_10m: "km/h",
  wind_direction_10m: "°",
};
const payload = {
  timezone: "Asia/Ho_Chi_Minh",
  utc_offset_seconds: 25200,
  current: { time: "2026-10-21T12:00", temperature_2m: 29, weather_code: 1 },
  current_units: { temperature_2m: "°C", weather_code: "wmo code" },
};
function provider(overrides: Record<string, unknown> = {}) {
  const snapshot = {
    mode: "private",
    packageEpoch: 1,
    georeferenceReady: true,
    world: { manifest: { isSynthetic: true } },
    centerConfirmation: {
      status: "confirmed",
      provenance: { source: "owner", method: "explicit-user-confirmation" },
    },
    ...overrides,
  } as unknown as ReturnType<WorldDataProvider["getSnapshot"]>;
  return {
    getSnapshot: () => snapshot,
    getGeoreference: () => ({ origin: { latitude: 10, longitude: 106 } }),
    getPackageEpoch: () => 1,
    subscribe: () => () => {},
  } as unknown as WorldDataProvider;
}

describe("P8-D Open-Meteo adapter", () => {
  it("maps WMO classes and rejects unknown codes", () => {
    expect(classifyWmoCode(0)).toBe("sunny");
    expect(classifyWmoCode(3)).toBe("cloudy");
    expect(classifyWmoCode(63)).toBe("rain");
    expect(classifyWmoCode(95)).toBe("storm");
    expect(classifyWmoCode(4)).toBeNull();
  });
  it("parses only exact timezone, units and ISO offset timestamp", () => {
    expect(parseOpenMeteoCurrent(payload).kind).toBe("sunny");
    expect(() => parseOpenMeteoCurrent({ ...payload, timezone: "UTC" })).toThrow(
      "MALFORMED_RESPONSE",
    );
    expect(() =>
      parseOpenMeteoCurrent({ ...payload, current_units: { ...units, temperature_2m: "F" } }),
    ).toThrow("MALFORMED_RESPONSE");
    expect(() =>
      parseOpenMeteoCurrent({ ...payload, current: { ...current, time: "2026-10-21 12:00" } }),
    ).toThrow("MALFORMED_RESPONSE");
  });
  it("does not construct a location request before separate disclosure confirmation", async () => {
    const fetchImpl = vi.fn();
    const adapter = createOpenMeteoWeatherAdapter({ provider: provider(), fetchImpl });
    await adapter.load("2026-10-21");
    expect(adapter.getSnapshot().errorCode).toBe("CONSENT_REQUIRED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("fails closed for missing georeference and unverified center", async () => {
    const fetchImpl = vi.fn();
    const missing = createOpenMeteoWeatherAdapter({
      provider: provider({ georeferenceReady: false }),
      fetchImpl,
    });
    missing.setDisclosureConfirmed(true);
    await missing.load("2026-10-21");
    expect(missing.getSnapshot().errorCode).toBe("BLOCKED_MISSING_GEOREFERENCE");
    const unverified = createOpenMeteoWeatherAdapter({
      provider: provider({ centerConfirmation: undefined }),
      fetchImpl,
    });
    unverified.setDisclosureConfirmed(true);
    await unverified.load("2026-10-21");
    expect(unverified.getSnapshot().errorCode).toBe("REAL_WORLD_NOT_VERIFIED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("does not request historical or future selected dates", async () => {
    const fetchImpl = vi.fn();
    const adapter = createOpenMeteoWeatherAdapter({
      provider: provider(),
      fetchImpl,
      now: () => new Date("2026-10-21T04:00:00Z"),
    });
    adapter.setDisclosureConfirmed(true);
    await adapter.load("2026-10-20");
    expect(adapter.getSnapshot().errorCode).toBe("HISTORICAL_OR_FUTURE_NOT_SUPPORTED");
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

it("accepts valid second-resolution timestamps and rejects impossible seconds/dates", () => {
  expect(
    parseOpenMeteoCurrent({
      ...payload,
      current: { ...payload.current, time: "2026-10-21T12:00:59" },
    }).timestamp,
  ).toBe("2026-10-21T12:00:59");
  for (const time of [
    "2026-10-21T12:00:60",
    "2026-02-30T12:00",
    "2026-10-21T24:00",
    "2026-10-21T12:00+07:00",
  ])
    expect(() =>
      parseOpenMeteoCurrent({ ...payload, current: { ...payload.current, time } }),
    ).toThrow("MALFORMED_RESPONSE");
});
