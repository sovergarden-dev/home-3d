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
  return { scene, atmosphere, wet, sky, sun, moon, hemisphere };
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

  it("removes an unlit moon from daytime light work and retains readable night ambient", () => {
    const { atmosphere, moon, hemisphere } = layer();
    atmosphere.update(state(), true);
    const daylightAmbient = hemisphere.intensity;
    expect(moon.intensity).toBe(0);
    expect(moon.visible).toBe(false);
    atmosphere.update(state({ timeOfDayMinutes: 1380 }), true);
    expect(moon.visible).toBe(true);
    expect(hemisphere.intensity).toBeGreaterThanOrEqual(0.85);
    expect(hemisphere.intensity).toBeLessThan(daylightAmbient);
    atmosphere.update(state(), true);
    expect(moon.visible).toBe(false);
    atmosphere.update(state({ timeOfDayMinutes: 1380, atmosphereEnabled: false }), true);
    expect(moon.visible).toBe(false);
    atmosphere.dispose();
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
    atmosphere.invalidateWorld();
    atmosphere.update(state({ weather: "rain" }), true);
    expect(wet).toEqual([true, false, true, true]);
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

  it("warms selectable variants without combinations and restores render state", () => {
    const { atmosphere, scene, wet, sky, sun } = layer();
    const externalFog = new THREE.FogExp2("#123456", 0.25);
    atmosphere.update(state({ weather: "rain", festival: "tet", floodLevel: 0.4 }), true);
    const ownedFog = scene.fog as THREE.FogExp2;
    const ownedFogColor = ownedFog.color.clone();
    const ownedFogDensity = ownedFog.density;
    scene.fog = externalFog;
    const group = atmosphere.group;
    group.visible = false;
    const rain = group.getObjectByName("rain-particles")!;
    const tet = group.getObjectByName("festival-decoration-tet")!;
    rain.visible = false;
    tet.visible = false;
    const before = {
      sky: sky.clone(),
      sunPosition: sun.position.clone(),
      groupVisible: group.visible,
      rainVisible: rain.visible,
      tetVisible: tet.visible,
      camera: new THREE.PerspectiveCamera(),
    };
    before.camera.position.set(2, 3, 4);
    before.camera.updateMatrixWorld();
    const compileStates: Array<{
      rain: boolean;
      festival: string;
      fog: THREE.Fog | THREE.FogExp2 | null;
      moon: boolean;
      flood: boolean;
    }> = [];
    const renderer = {
      compile: (_scene: THREE.Scene, _camera: THREE.Camera) => {
        compileStates.push({
          rain: rain.visible,
          festival:
            ["tet", "midautumn", "christmas", "reunification", "national"].find(
              (name) => group.getObjectByName(`festival-decoration-${name}`)?.visible,
            ) ?? "normal",
          fog: scene.fog,
          moon: group.getObjectByName("moon-phase-disc")?.visible ?? false,
          flood: group.getObjectByName("simulation-flood-water")?.visible ?? false,
        });
      },
    } as unknown as THREE.WebGLRenderer;
    const cameraBefore = before.camera.matrixWorld.clone();
    atmosphere.warm(renderer, before.camera);
    expect(compileStates).toHaveLength(18);
    expect(compileStates.slice(0, 12).every(({ fog }) => fog instanceof THREE.FogExp2)).toBe(true);
    expect(compileStates[12]!.fog).toBeNull();
    expect(compileStates.filter(({ rain }) => rain).map(({ festival }) => festival)).toEqual([
      "normal",
      "normal",
      "normal",
    ]);
    expect(compileStates[10]!.moon).toBe(true);
    expect(compileStates[11]!.flood).toBe(true);
    expect(compileStates[12]!.flood).toBe(false);
    expect(scene.fog).toBe(externalFog);
    expect(ownedFog.color.equals(ownedFogColor)).toBe(true);
    expect(ownedFog.density).toBe(ownedFogDensity);
    expect(sky.equals(before.sky)).toBe(true);
    expect(sun.position.equals(before.sunPosition)).toBe(true);
    expect(group.visible).toBe(before.groupVisible);
    expect(rain.visible).toBe(before.rainVisible);
    expect(tet.visible).toBe(before.tetVisible);
    expect(before.camera.matrixWorld.equals(cameraBefore)).toBe(true);
    expect(wet).toEqual([true]);
    atmosphere.dispose();
  });
});
