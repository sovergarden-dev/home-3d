import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createAtmosphereLayer, solarPosition } from "@/engine/atmosphere";

function layer() {
  const scene = new THREE.Scene();
  const sky = new THREE.Color();
  const hemisphere = new THREE.HemisphereLight();
  const sun = new THREE.DirectionalLight();
  const moon = new THREE.DirectionalLight();
  scene.add(hemisphere, sun, moon);
  const wet: boolean[] = [];
  const atmosphere = createAtmosphereLayer({
    scene,
    sky,
    hemisphere,
    sun,
    moon,
    onRoadWet: (v) => wet.push(v),
    tier: "low",
  });
  return { scene, atmosphere, wet, sky, sun };
}

const state = (
  overrides: Partial<Parameters<ReturnType<typeof layer>["atmosphere"]["update"]>[0]> = {},
) => ({
  timeOfDayMinutes: 720,
  weather: "sunny" as const,
  festival: "normal" as const,
  ...overrides,
});

describe("P8 atmosphere rendering contract", () => {
  it("uses a deterministic art fallback with noon bright, midnight dark, and morning east", () => {
    expect(solarPosition({ timeOfDayMinutes: 720 }).elevationDeg).toBeGreaterThan(40);
    expect(solarPosition({ timeOfDayMinutes: 0 }).elevationDeg).toBeLessThan(0);
    expect(solarPosition({ timeOfDayMinutes: 360 }).azimuthDeg).toBeGreaterThan(0);
    expect(solarPosition({ timeOfDayMinutes: 360 }).azimuthDeg).toBeLessThan(180);
  });

  it("keeps one rain buffer/material and applies dry-wet-dry without mutating world geometry", () => {
    const { atmosphere, scene, wet } = layer();
    const group = atmosphere.group;
    const rain = group.getObjectByName("rain-particles") as THREE.Points;
    const positions = rain.geometry.getAttribute("position");
    const material = rain.material;
    atmosphere.update(state({ weather: "rain" }), true);
    expect(rain.visible).toBe(true);
    atmosphere.tick(0.016);
    atmosphere.update(state(), true);
    expect(rain.visible).toBe(false);
    atmosphere.update(state({ weather: "rain" }), true);
    expect(rain.geometry.getAttribute("position")).toBe(positions);
    expect(rain.material).toBe(material);
    expect(wet).toEqual([true, false, true]);
    atmosphere.dispose();
    expect(scene.getObjectByName("atmosphere-layer")).toBeUndefined();
  });

  it("renders flood as a broad monotonic water plane and disables all effects when off/topdown", () => {
    const { atmosphere, wet, sun } = layer();
    const water = atmosphere.group.getObjectByName("simulation-flood-water") as THREE.Mesh;
    const mat = water.material as THREE.MeshStandardMaterial;
    atmosphere.update(state({ floodLevel: 0.2 }), true);
    const low = mat.opacity;
    const lowHeight = water.position.y;
    expect(water.visible).toBe(true);
    atmosphere.update(state({ floodLevel: 0.8 }), true);
    expect(mat.opacity).toBeGreaterThan(low);
    expect(water.position.y).toBeGreaterThan(lowHeight);
    atmosphere.update(state({ weather: "rain", floodLevel: 1, festival: "tet" }), false);
    expect(water.visible).toBe(false);
    expect(atmosphere.rainVisible).toBe(false);
    expect(sun.intensity).toBe(1);
    expect(wet.at(-1)).toBe(false);
    atmosphere.dispose();
  });

  it("accepts real astronomy directions and does not invent a location when astronomy is null", () => {
    const { atmosphere, sun } = layer();
    atmosphere.update(state({ astronomy: { sunAzimuthDeg: 90, sunElevationDeg: 35 } }), true);
    expect(sun.position.x).toBeGreaterThan(0);
    expect(sun.position.y).toBeGreaterThan(0);
    atmosphere.update(state({ astronomy: null, timeOfDayMinutes: 0 }), true);
    expect(sun.position.y).toBeLessThan(0);
    atmosphere.dispose();
  });

  it("creates materially distinct festival illustrations, including five-point mid-autumn stars", () => {
    const { atmosphere } = layer();
    const childNames: string[] = [];
    for (const festival of ["tet", "midautumn", "christmas", "national"] as const) {
      atmosphere.update(state({ festival }), true);
      const d = atmosphere.group.getObjectByName(`festival-decoration-${festival}`)!;
      childNames.push(`${festival}:${d.children.length}`);
    }
    expect(new Set(childNames.map((x) => x.split(":")[1])).size).toBeGreaterThan(1);
    const mid = atmosphere.group.getObjectByName("festival-decoration-midautumn")!;
    expect(
      mid.children.some(
        (o) =>
          o instanceof THREE.Mesh &&
          o.geometry instanceof THREE.ShapeGeometry &&
          !Array.isArray(o.geometry.parameters.shapes) &&
          o.geometry.parameters.shapes.getPoints().length === 11,
      ),
    ).toBe(true);
    atmosphere.dispose();
  });
});
