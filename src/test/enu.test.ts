import { describe, expect, it } from "vitest";
import { enuToGeodetic, geodeticToEnu } from "@/geo/enu";

describe("WGS84 / ENU projection", () => {
  it("round-trips a synthetic point within one centimetre around a private origin", () => {
    const origin = { longitude: 0.6, latitude: 0.4, altitude: 12 };
    const point = { longitude: 0.608, latitude: 0.406, altitude: 19 };

    const enu = geodeticToEnu(point, origin);
    const restored = enuToGeodetic(enu, origin);

    expect(enu.east).toBeGreaterThan(0);
    expect(enu.north).toBeGreaterThan(0);
    expect(Math.abs(restored.longitude - point.longitude)).toBeLessThan(1e-7);
    expect(Math.abs(restored.latitude - point.latitude)).toBeLessThan(1e-7);
    expect(Math.abs(restored.altitude - point.altitude)).toBeLessThan(0.01);
  });
});
