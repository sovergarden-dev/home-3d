import * as THREE from "three";
import type { WorldData } from "@/world/schema";
import { useAppStore } from "@/state/appStore";
import { createLifeSimulation, type LifeSettings } from "./simulation";
import { createLifeRenderer } from "./rendering";
import { createPovController } from "./pov";
import type { CollisionBox } from "./collision";
import { updateLifeStatus } from "./session";

/** Owns a presentation layer, not the source world. Driven only by demoScene's RAF. */
export function createLifeRuntime(options: {
  world: WorldData;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  target: THREE.Vector3;
  reducedMotion: boolean;
  invalidate: () => void;
}) {
  const simulation = createLifeSimulation(options.world, 90421);
  const rendering = createLifeRenderer(simulation);
  let disposed = false;
  let transitioning = false;
  const obstaclePool: CollisionBox[] = Array.from({ length: 2000 }, () => ({
    minX: 0,
    maxX: 0,
    minZ: 0,
    maxZ: 0,
  }));
  const obstacles: CollisionBox[] = [];
  const pov = createPovController({
    dynamicObstacles: obstacles,
    camera: options.camera,
    canvas: options.canvas,
    world: options.world,
    orbitTarget: options.target,
    reducedMotion: options.reducedMotion,
    onInvalidate: options.invalidate,
    onStateChange(mode) {
      if (
        !mode &&
        !disposed &&
        !transitioning &&
        ["walk", "ride"].includes(useAppStore.getState().viewMode)
      )
        useAppStore.getState().setViewMode("diorama");
      options.invalidate();
    },
  });
  const settings: LifeSettings = {};
  const cpu = new Float64Array(600);
  const sortedCpu = new Float64Array(600);
  const metricSnapshot = { ...simulation.diagnostics, cpuSamples: 0, cpuP50Ms: 0, cpuP95Ms: 0 };
  const endedStatus = { rideEnded: false };
  let cpuIndex = 0,
    cpuCount = 0;
  updateLifeStatus({
    graphReady: simulation.graph.enabled,
    reason: simulation.graph.disabledReason ?? null,
  });
  function configure() {
    const state = useAppStore.getState();
    settings.speed = state.realTimeEnabled ? 1 : state.timeSpeed;
    settings.visible = state.lifeEnabled && state.viewMode !== "topdown" && !document.hidden;
    settings.tier = "mid";
    settings.hour = state.timeOfDayMinutes / 60;
    settings.weather =
      state.realWeatherEnabled && state.realWeatherKind ? state.realWeatherKind : state.weather;
    settings.festival = state.festival;
    settings.floodLevel = state.floodLevel;
    // The same density setting is presentation-only and never edits the package.
    (settings as LifeSettings & { density: number }).density = state.lifeDensity;
    rendering.setDiorama(state.viewMode === "diorama");
    rendering.setVisible(Boolean(settings.visible));
  }
  return {
    group: rendering.group,
    simulation,
    pov,
    configure,
    setMode(mode: "walk" | "ride" | null) {
      transitioning = true;
      pov.setMode(mode);
      transitioning = false;
      configure();
    },
    update(dt: number, fps?: number) {
      if (disposed) return;
      configure();
      if (fps !== undefined) settings.fps = fps;
      const started = performance.now();
      rendering.update(dt, settings);
      cpu[cpuIndex] = performance.now() - started;
      cpuIndex = (cpuIndex + 1) % cpu.length;
      cpuCount = Math.min(cpu.length, cpuCount + 1);
      let count = 0;
      if (settings.visible)
        for (const agent of simulation.agents) {
          if (
            !agent.active ||
            agent.fade < 0.05 ||
            (agent.kind !== "motorbike" &&
              agent.kind !== "car" &&
              agent.kind !== "bus" &&
              agent.kind !== "tricycle" &&
              agent.kind !== "bicycle")
          )
            continue;
          const halfLength = agent.kind === "bus" ? 2.3 : agent.kind === "car" ? 1.4 : 0.9;
          const halfWidth = agent.kind === "bus" ? 0.65 : agent.kind === "car" ? 0.5 : 0.3;
          const c = Math.abs(Math.cos(agent.rotation)),
            t = Math.abs(Math.sin(agent.rotation));
          const x = halfLength * c + halfWidth * t,
            z = halfLength * t + halfWidth * c;
          const box = obstaclePool[count]!;
          box.minX = agent.x - x;
          box.maxX = agent.x + x;
          box.minZ = agent.z - z;
          box.maxZ = agent.z + z;
          obstacles[count++] = box;
        }
      obstacles.length = count;
      const state = useAppStore.getState();
      pov.pause(state.viewMode === "ride" && (state.ridePaused || settings.speed === 0));
      pov.update(state.viewMode === "ride" ? dt * (settings.speed ?? 0) : dt);
      const data = pov.diagnostics();
      if (endedStatus.rideEnded !== data.rideEnded) {
        endedStatus.rideEnded = data.rideEnded;
        updateLifeStatus(endedStatus);
      }
    },
    active() {
      const state = useAppStore.getState();
      return (
        !document.hidden &&
        ((state.lifeEnabled &&
          state.viewMode !== "topdown" &&
          (state.realTimeEnabled || state.timeSpeed !== 0)) ||
          ((state.viewMode === "walk" || state.viewMode === "ride") && pov.active()))
      );
    },
    metrics() {
      for (let i = 0; i < sortedCpu.length; i++) sortedCpu[i] = i < cpuCount ? cpu[i]! : Infinity;
      sortedCpu.sort();
      Object.assign(metricSnapshot, simulation.diagnostics);
      metricSnapshot.cpuSamples = cpuCount;
      metricSnapshot.cpuP50Ms = cpuCount
        ? sortedCpu[Math.max(0, Math.ceil(cpuCount * 0.5) - 1)]!
        : 0;
      metricSnapshot.cpuP95Ms = cpuCount
        ? sortedCpu[Math.max(0, Math.ceil(cpuCount * 0.95) - 1)]!
        : 0;
      return metricSnapshot;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pov.dispose();
      rendering.dispose();
      simulation.dispose();
    },
  };
}
