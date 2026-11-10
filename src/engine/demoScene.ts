import { createIllustrativeDetails } from "./illustration/details";
import { createLifeRuntime } from "./life/runtime";
import { bindLifeCommands, resetLifeSession, updateLifeStatus } from "./life/session";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { bindCapture } from "./capture";
import { bindRealStreetView } from "./view/externalMapView";
import { createDemoAudio } from "./demoAudio";
import { createAtmosphereLayer } from "./atmosphere";
import { getAstronomy, phaseMoon } from "@/atmosphere/astronomy";
import { getEffectiveSeason } from "@/atmosphere/calendar";
import { buildWorldMeshes, type WorldMeshBundle } from "./world/buildWorldMeshes";
import { createFrameMetrics } from "./quality/frameMetrics";
import {
  configurePlanCamera,
  isPlanCameraZenith,
  metresPerCssPixel,
  type PlanCameraConfig,
} from "./view/planCamera";
import {
  clampPrivatePlanCentre,
  derivePrivateWorldPlanFrame,
  type PrivateWorldPlanFrame,
} from "./view/privateWorldPlanFrame";
import { projectMarkerAndCull } from "./view/cameraFrame";
import { useAppStore } from "@/state/appStore";
import { SITE_CONFIG } from "@/config/site";
import { surfaceCentroid } from "@/world/geometry";
import { homeWorldSession } from "@/world/homeWorldSession";
import type { WorldData } from "@/world/schema";
import { runStartupSequence, type StartupOutcome } from "./startupSequence";

const STARTUP_PROGRAM_POLL_MS = 10;
const STARTUP_PROGRAM_TIMEOUT_MS = 10_000;

export interface SceneRuntime {
  setLabel: (label: string) => void;
  dispose: () => void;
  /**
   * Settles "interactive" once input may start: the first frame was drawn (or skipped while
   * the page is hidden or the host has no size; the next visibility change or resize draws
   * it) and every weather/festival variant was compiled. Each wait for shader programs is
   * capped by STARTUP_PROGRAM_TIMEOUT_MS. Settles "stopped" when the scene is disposed or its
   * context is lost, which onContextLost reports. Rejects when a startup step throws.
   */
  ready: Promise<StartupOutcome>;
}

function worldSpan(world: WorldData) {
  const positions = [
    ...world.roads.flatMap((road) => road.polylineENU),
    ...world.lots.flatMap((lot) =>
      lot.geometry.type === "Polygon"
        ? lot.geometry.coordinates.flat()
        : lot.geometry.coordinates.flat(2),
    ),
    ...world.buildings.flatMap((building) =>
      building.geometry.type === "Polygon"
        ? building.geometry.coordinates.flat()
        : building.geometry.coordinates.flat(2),
    ),
  ];
  if (positions.length === 0) return 100;
  const bounds = positions.reduce(
    (value, [x, z]) => ({
      minX: Math.min(value.minX, x),
      maxX: Math.max(value.maxX, x),
      minZ: Math.min(value.minZ, z),
      maxZ: Math.max(value.maxZ, z),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
  return Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ, 50) * 1.25;
}

function perspectiveFrame(world: WorldData) {
  return {
    centre: worldCameraCentre(),
    span: worldSpan(world),
  };
}

export function worldCameraCentre() {
  const [x, z] = SITE_CONFIG.heroCenter;
  return new THREE.Vector3(x, 0, z);
}

export function worldHomeCentre(world: WorldData) {
  const homeLot = world.lots.find((lot) => lot.confirmed && lot.status === "empty");
  if (!homeLot) return new THREE.Vector3(0, 0, 0);
  const [x, z] = surfaceCentroid(homeLot.geometry);
  return new THREE.Vector3(x, 0, z);
}

export function createDemoScene(
  host: HTMLDivElement,
  marker: HTMLDivElement,
  onContextLost: () => void,
): SceneRuntime {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!context) throw new Error("WEBGL_UNAVAILABLE");

  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1 : 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  // Keep offscreen postcard pixels on the same display-referred path as the canvas.
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const sky = new THREE.Color("#ecdfca");
  scene.background = sky;
  const perspectiveCamera = new THREE.PerspectiveCamera(42, 1, 0.1, 800);
  const planCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 800);
  let activeCamera: THREE.Camera = perspectiveCamera;
  const controls = new OrbitControls(perspectiveCamera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.09;
  controls.minPolarAngle = 0.3;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  controls.minDistance = 16;
  controls.maxDistance = 380;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.75;
  controls.screenSpacePanning = true;

  const hemisphere = new THREE.HemisphereLight("#fff8e8", "#5e6658", 2.2);
  const sun = new THREE.DirectionalLight("#fff0cd", 3.3);
  const moon = new THREE.DirectionalLight("#b9d5ff", 0);
  sun.position.set(-45, 70, 36);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -90,
    right: 90,
    top: 90,
    bottom: -90,
    near: 1,
    far: 250,
  });
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.12;
  scene.add(hemisphere, sun, moon);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(800, 800),
    new THREE.MeshStandardMaterial({ color: "#cfc5ad", roughness: 0.95 }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const markerPosition = new THREE.Vector3();
  const materialFactory = (color: string, roughness = 0.82, metalness = 0) => {
    const key = `${color}:${roughness}:${metalness}`;
    let material = materials.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.set(key, material);
    }
    return material;
  };

  let worldBundle: WorldMeshBundle | null = null;
  let currentWorld = homeWorldSession.getSnapshot();
  const fallbackWorld = "world" in currentWorld ? currentWorld.world : null;
  const initialPerspectiveFrame = fallbackWorld ? perspectiveFrame(fallbackWorld) : null;
  let centre = initialPerspectiveFrame?.centre ?? new THREE.Vector3();
  let homeCentre = fallbackWorld ? worldHomeCentre(fallbackWorld) : new THREE.Vector3();
  const planCentre = worldCameraCentre();
  let span = initialPerspectiveFrame?.span ?? 100;
  let privatePlanFrame: PrivateWorldPlanFrame | null = null;
  function resetPlanCentre() {
    if (privatePlanFrame) {
      planCentre.set(privatePlanFrame.centre.x, 0, privatePlanFrame.centre.z);
      return;
    }
    planCentre.copy(worldCameraCentre());
  }
  let planPanRevision = 0;
  const planPointers = new Map<number, THREE.Vector2>();
  const planPointerStarts = new Map<number, THREE.Vector2>();
  let lastPinchDistance: number | null = null;
  let disposed = false;
  // Nothing draws before the startup sequence's first frame; see runStartupSequence().
  let firstFrameReady = false;
  let animationFrame = 0;
  let lastFrame = 0;
  let renderRevision = 0;
  const audio = createDemoAudio({
    onStateChange: () => {
      lastLifeMetricsAt = 0;
      render();
    },
  });
  let life: ReturnType<typeof createLifeRuntime> | null = null;
  let lastLifeMetricsAt = 0;
  let lastPassbyAt = 0;
  const passbyPosition: [number, number, number] = [0, 0, 0];
  const passbyEvent = {
    sourceId: "fixture-scooter-1",
    position: passbyPosition,
    kind: "scooter" as const,
    level: 0.025,
    durationMs: 250,
  };
  let restorePovCamera = false;
  const frameMetrics = createFrameMetrics();
  let frameSnapshot = frameMetrics.snapshot();
  let lastMetricsSnapshotAt = 0;
  let updatingControls = false;
  let syncingControlsState = false;
  let interactionActive = false;
  let interactionTimer = 0;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let illustrativeDetails: ReturnType<typeof createIllustrativeDetails> | null = null;

  function mountWorld() {
    const snapshot = homeWorldSession.getSnapshot();
    currentWorld = snapshot;
    if (!("world" in snapshot)) return;
    life?.dispose();
    life = null;
    audio.notifyPackageReplaced();
    if (useAppStore.getState().soundOn) useAppStore.setState({ soundOn: false });
    illustrativeDetails?.dispose();
    illustrativeDetails = null;
    worldBundle?.dispose();
    const meshBuildStartedAt = performance.now();
    worldBundle = buildWorldMeshes(snapshot.world, materialFactory);
    atmosphere.invalidateWorld();
    host.dataset["meshBuildLatencyMs"] = String(performance.now() - meshBuildStartedAt);
    scene.add(worldBundle.group);
    const frame = perspectiveFrame(snapshot.world);
    centre = frame.centre;
    homeCentre = worldHomeCentre(snapshot.world);
    privatePlanFrame = derivePrivateWorldPlanFrame(snapshot.world, {
      x: SITE_CONFIG.heroCenter[0],
      z: SITE_CONFIG.heroCenter[1],
    });
    resetPlanCentre();
    span = frame.span;
    life = createLifeRuntime({
      world: snapshot.world,
      camera: perspectiveCamera,
      canvas,
      target: controls.target,
      reducedMotion: motion.matches,
      invalidate: scheduleFrame,
    });
    scene.add(life.group);
    planPanRevision = 0;
    // Effects anchor to the mounted world frame instead of a fixed origin.
    atmosphere.group.position.set(homeCentre.x, 0, homeCentre.z);
    applyView(true);
  }

  function disposeWorld() {
    life?.dispose();
    life = null;
    audio.notifyPackageReplaced();
    if (useAppStore.getState().soundOn) useAppStore.setState({ soundOn: false });
    illustrativeDetails?.dispose();
    illustrativeDetails = null;
    worldBundle?.dispose();
    worldBundle = null;
  }

  function worldRenderable() {
    return currentWorld.mode !== "private-error" && worldBundle !== null;
  }

  function planConfig(state = useAppStore.getState()): PlanCameraConfig {
    const verticalSpanMetres = privatePlanFrame?.verticalSpanMetres ?? span;
    host.dataset["planCoreVerticalSpanMetres"] = String(verticalSpanMetres);
    host.dataset["planCameraZoom"] = String(state.zoom);
    host.dataset["planVisibleVerticalSpanMetres"] = String(verticalSpanMetres / state.zoom);
    host.dataset["planCentreAtPrivateOrigin"] = String(
      Boolean(privatePlanFrame) && Math.abs(planCentre.x) < 0.001 && Math.abs(planCentre.z) < 0.001,
    );
    return {
      centre: planCentre,
      verticalSpanMetres,
      viewportWidthCss: Math.max(host.clientWidth, 1),
      viewportHeightCss: Math.max(host.clientHeight, 1),
      zoom: state.zoom,
    };
  }

  function updatePlanMeasurement() {
    const measurement = metresPerCssPixel(planCamera, Math.max(host.clientHeight, 1));
    renderRevision += 1;
    useAppStore
      .getState()
      .setPlanMeasurement({ metresPerCssPixel: measurement, revision: renderRevision });
  }

  function applyPerspective(state = useAppStore.getState()) {
    const theta = THREE.MathUtils.degToRad(state.heading);
    const povMode = state.viewMode === "walk" || state.viewMode === "ride" ? state.viewMode : null;
    const wasPov = life?.pov.diagnostics().mode != null;
    if (povMode) {
      controls.enabled = false;
      activeCamera = perspectiveCamera;
      scene.fog = null;
      delete host.dataset["planZenith"];
      useAppStore.getState().setPlanMeasurement(null);
      life?.setMode(povMode);
      if (!motion.matches) scheduleFrame();
      return;
    }
    if (wasPov) {
      life?.setMode(null);
      restorePovCamera = true;
    }
    if (restorePovCamera) {
      restorePovCamera = false;
      controls.enabled = true;
      activeCamera = perspectiveCamera;
      // Do not reconstruct the orbit pose after POV; the controller restored its exact snapshot.
      return;
    }
    const walk = false;
    const distance = (walk ? 22 : span * 1.15) / state.zoom;
    const height = walk ? 2.5 : distance * 0.66;
    const radius = walk ? distance : distance * 0.77;
    const targetY = walk ? 1.6 : 0.8;
    controls.object = perspectiveCamera;
    controls.enabled = true;
    controls.enableRotate = true;
    controls.enablePan = true;
    controls.minPolarAngle = 0.3;
    controls.maxPolarAngle = Math.PI / 2 - 0.06;
    controls.minDistance = walk ? 4 : 16;
    controls.maxDistance = walk ? 50 : 380;
    controls.target.set(centre.x, targetY, centre.z);
    perspectiveCamera.position.set(
      centre.x + Math.sin(theta) * radius,
      height,
      centre.z + Math.cos(theta) * radius,
    );
    perspectiveCamera.lookAt(controls.target);
    updateControls();
    activeCamera = perspectiveCamera;
    scene.fog = null;
    delete host.dataset["planZenith"];
    useAppStore.getState().setPlanMeasurement(null);
  }

  function applyPlan(state = useAppStore.getState()) {
    configurePlanCamera(planCamera, planConfig(state));
    controls.enabled = false;
    activeCamera = planCamera;
    scene.fog = null;
    host.dataset["planZenith"] = String(isPlanCameraZenith(planCamera));
    updatePlanMeasurement();
  }

  function applyView(force = false) {
    if (disposed || !host.clientWidth || !host.clientHeight) return;
    const state = useAppStore.getState();
    if (state.viewMode === "topdown") {
      life?.setMode(null);
      applyPlan(state);
    } else applyPerspective(state);
    if (force) render();
  }

  // One non-pickable atmosphere layer: decorations and weather never enter world geometry.
  const atmosphere = createAtmosphereLayer({
    scene,
    sky,
    hemisphere,
    sun,
    moon,
    onRoadWet: (wet) => worldBundle?.setRoadWet(wet),
    host,
    tier: renderer.capabilities.maxTextureSize <= 4096 ? "low" : "mid",
  });

  function applyEnvironment() {
    const state = useAppStore.getState();
    const effectiveWeather = state.weather;
    const selectedDate = state.selectedDate;
    const astronomy = getAstronomy(selectedDate, state.timeOfDayMinutes, null);
    const effectiveFestival = "normal" as const;
    const effectiveSeason = getEffectiveSeason(state);
    const presentationVisible =
      state.atmosphereEnabled && worldRenderable() && state.viewMode !== "topdown";
    worldBundle?.setAtmospherePresentation(
      presentationVisible ? effectiveSeason : null,
      presentationVisible &&
        (astronomy?.sun?.elevation ??
          -Math.cos((state.timeOfDayMinutes / 1440) * Math.PI * 2) * 60) < -6,
    );
    atmosphere.update(
      {
        timeOfDayMinutes: state.timeOfDayMinutes,
        weather: effectiveWeather,
        festival: effectiveFestival,
        selectedDate,
        season: effectiveSeason,
        atmosphereEnabled: state.atmosphereEnabled,
        floodLevel: 0,
        moonPhase: phaseMoon(selectedDate, state.timeOfDayMinutes) ?? 0.5,
        astronomy:
          astronomy?.sun && astronomy.moon
            ? {
                sunAzimuthDeg: astronomy.sun.azimuth,
                sunElevationDeg: astronomy.sun.elevation,
                moonAzimuthDeg: astronomy.moon.azimuth,
                moonElevationDeg: astronomy.moon.elevation,
              }
            : null,
      },
      worldRenderable() && state.viewMode !== "topdown",
      homeCentre,
    );
    audio.set(
      state.soundOn && !document.hidden && worldRenderable(),
      effectiveWeather === "rain" || effectiveWeather === "storm",
      {
        minutes: state.timeOfDayMinutes,
        weather: effectiveWeather,
        fixture: true,
      },
    );
    life?.configure();
    life?.update(0);
    lastLifeMetricsAt = 0;
    host.dataset["weather"] = effectiveWeather;
    host.dataset["selectedDate"] = selectedDate;
    host.dataset["timeMinutes"] = String(state.timeOfDayMinutes);
    host.dataset["festival"] = effectiveFestival;
    host.dataset["astronomySynthetic"] = String(astronomy?.synthetic ?? false);
    host.dataset["simulationLabel"] = "simulation";
  }

  function updateLayerVisibility() {
    const showDetails =
      useAppStore.getState().illustrativeDetails && useAppStore.getState().viewMode === "diorama";
    if (showDetails && "world" in currentWorld && !illustrativeDetails) {
      illustrativeDetails = createIllustrativeDetails(
        currentWorld.world,
        renderer.capabilities.maxTextureSize <= 4096 ? "low" : "mid",
      );
    }
    if (showDetails && illustrativeDetails) scene.add(illustrativeDetails.group);
    else illustrativeDetails?.group.removeFromParent();
    host.dataset["illustrativeDetails"] = String(showDetails);
    host.dataset["illustrativeInstances"] = String(
      showDetails ? (illustrativeDetails?.instances ?? 0) : 0,
    );

    if (!worldBundle) return;
    const state = useAppStore.getState();
    worldBundle.setLayerVisible("trees", state.showTrees);
    worldBundle.setLayerVisible("labels", state.showLabels);
    host.dataset["treesVisible"] = String(state.showTrees);
    host.dataset["labelsVisible"] = String(state.showLabels);
  }

  function render(activeAnimation = false) {
    if (disposed || !firstFrameReady || document.hidden || !host.clientWidth || !host.clientHeight)
      return;
    if (currentWorld.mode === "private-error" || !worldBundle) {
      marker.style.visibility = "hidden";
      useAppStore.getState().setPlanMeasurement(null);
      renderer.clear();
      renderer.render(scene, activeCamera);
      host.dataset["activeWorlds"] = "0";
      host.dataset["worldMode"] = currentWorld.mode;
      return;
    }
    renderer.render(scene, activeCamera);
    host.dataset["memoryTextures"] = String(renderer.info.memory.textures);
    host.dataset["memoryGeometries"] = String(renderer.info.memory.geometries);
    const renderedAt = performance.now();
    frameMetrics.record(
      renderedAt,
      interactionActive || activeAnimation || atmosphere.rainVisible ? "active" : "idle",
    );
    if (lastMetricsSnapshotAt === 0 || renderedAt - lastMetricsSnapshotAt >= 250) {
      frameSnapshot = frameMetrics.snapshot();
      lastMetricsSnapshotAt = renderedAt;
    }
    markerPosition.set(homeCentre.x, 0.35, homeCentre.z);
    const projected = projectMarkerAndCull(activeCamera, markerPosition, -0.06);
    marker.style.transform = `translate(-50%, -100%) translate(${projected.x * host.clientWidth}px, ${projected.y * host.clientHeight - 10}px)`;
    marker.style.visibility = projected.visible ? "visible" : "hidden";
    host.dataset["drawCalls"] = String(renderer.info.render.calls);
    host.dataset["triangles"] = String(renderer.info.render.triangles);
    host.dataset["renderedFrames"] = String(frameSnapshot.renderedFrames);
    host.dataset["frameP50Ms"] = String(frameSnapshot.p50Ms ?? "");
    host.dataset["frameP95Ms"] = String(frameSnapshot.p95Ms ?? "");
    host.dataset["frameLongestMs"] = String(frameSnapshot.longestMs ?? "");
    host.dataset["frameSampleCount"] = String(frameSnapshot.sampleCount);
    host.dataset["idleRenderedFrames"] = String(frameMetrics.phaseSnapshot("idle").renderedFrames);
    host.dataset["worldMode"] = currentWorld.mode;
    host.dataset["worldRevision"] = String(currentWorld.revision);
    host.dataset["activeWorlds"] = worldBundle ? "1" : "0";
    host.dataset["cameraType"] = activeCamera.type;
    if (life && (lastLifeMetricsAt === 0 || renderedAt - lastLifeMetricsAt >= 250)) {
      const m = life.metrics();
      host.dataset["lifeAgents"] = String(m.agentCount);
      host.dataset["lifeClock"] = String(m.simulatedSeconds);
      host.dataset["lifeVisible"] = String(life.group.visible);
      host.dataset["lifeCpuP50Ms"] = String(m.cpuP50Ms);
      host.dataset["lifeCpuP95Ms"] = String(m.cpuP95Ms);
      host.dataset["lifeCpuSamples"] = String(m.cpuSamples);
      host.dataset["lifeGraphReady"] = String(m.graphEnabled);
      host.dataset["lifeTier"] = m.tier;
      host.dataset["povMode"] = life.pov.diagnostics().mode ?? "none";
      host.dataset["audioContexts"] = String(Number(audio.getDiagnostics().contextCreated));
      const audioMetrics = audio.getDiagnostics();
      host.dataset["audioVoices"] = String(audioMetrics.activeVoices);
      host.dataset["audioNodes"] = String(audioMetrics.nodeCount);
      host.dataset["audioTotalNodes"] = String(audioMetrics.totalNodeCount);
      host.dataset["audioState"] = audioMetrics.contextState;
      host.dataset["audioListeners"] = String(audioMetrics.listenerCount);
      lastLifeMetricsAt = renderedAt;
    }
  }

  function lifeActive() {
    return life?.active() ?? false;
  }

  function scheduleFrame() {
    if (
      disposed ||
      !firstFrameReady ||
      document.hidden ||
      (motion.matches && !lifeActive()) ||
      animationFrame !== 0
    )
      return;
    animationFrame = requestAnimationFrame(tick);
  }

  function updateControls() {
    updatingControls = true;
    try {
      return controls.update();
    } finally {
      updatingControls = false;
    }
  }

  function tick(now: number) {
    animationFrame = 0;
    if (disposed || document.hidden || (motion.matches && !lifeActive())) return;
    const delta = lastFrame === 0 ? 0.016 : Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    atmosphere.tick(delta);
    // Input can dirty a stationary POV without requiring another moving frame.
    // Keep that final draw even when update() consumes the pending pose change.
    const lifeFrameRequested = lifeActive();
    life?.update(delta, frameSnapshot.p50Ms ? 1000 / frameSnapshot.p50Ms : 60);
    if (life && now - lastPassbyAt > 1000 && useAppStore.getState().soundOn) {
      lastPassbyAt = now;
      const agent = life.simulation.agents.find((a) => a.active && a.kind === "motorbike");
      if (agent) {
        passbyPosition[0] = agent.x - perspectiveCamera.position.x;
        passbyPosition[1] = agent.y - perspectiveCamera.position.y;
        passbyPosition[2] = agent.z - perspectiveCamera.position.z;
        if (Math.hypot(passbyPosition[0], passbyPosition[2]) < 35) audio.passby(passbyEvent);
      }
    }

    const controlsChanged = controls.enabled ? updateControls() : false;
    if (controlsChanged || atmosphere.rainVisible || lifeFrameRequested || lifeActive()) {
      render(true);
      scheduleFrame();
    }
  }

  function resize() {
    if (disposed || !host.clientWidth || !host.clientHeight) return;
    perspectiveCamera.aspect = host.clientWidth / host.clientHeight;
    perspectiveCamera.updateProjectionMatrix();
    renderer.setSize(host.clientWidth, host.clientHeight, false);
    applyView();
    render();
  }

  function onControlChange() {
    if (disposed || !controls.enabled || !worldRenderable()) return;
    const heading =
      (Math.atan2(
        perspectiveCamera.position.x - centre.x,
        perspectiveCamera.position.z - centre.z,
      ) *
        180) /
      Math.PI;
    const zoom = THREE.MathUtils.clamp(
      (span * 1.15) / perspectiveCamera.position.distanceTo(controls.target),
      0.25,
      4,
    );
    syncingControlsState = true;
    try {
      useAppStore.setState({ heading: (heading + 360) % 360, zoom });
    } finally {
      syncingControlsState = false;
    }
    if (!updatingControls) {
      render();
      scheduleFrame();
    }
  }

  function onControlStart() {
    interactionActive = true;
  }
  function onControlEnd() {
    interactionActive = false;
    frameMetrics.reset();
    window.clearTimeout(interactionTimer);
  }

  function transientInteraction() {
    interactionActive = true;
    window.clearTimeout(interactionTimer);
    interactionTimer = window.setTimeout(() => {
      interactionActive = planPointers.size > 0;
      if (!interactionActive) frameMetrics.reset();
    }, 120);
  }

  function onPlanPointerDown(event: PointerEvent) {
    if (!worldRenderable()) return;
    const isPlan = useAppStore.getState().viewMode === "topdown";
    if (isPlan) canvas.setPointerCapture(event.pointerId);
    interactionActive = true;
    planPointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
    planPointerStarts.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
    if (planPointers.size === 2) {
      const [first, second] = [...planPointers.values()];
      lastPinchDistance = first && second ? first.distanceTo(second) : null;
    }
    event.preventDefault();
  }

  function clampPlanCentre() {
    if (privatePlanFrame) {
      const clamped = clampPrivatePlanCentre(planCentre, privatePlanFrame.panBounds);
      planCentre.set(clamped.x, 0, clamped.z);
      return;
    }
    const limit = span * 0.4;
    planCentre.x = THREE.MathUtils.clamp(planCentre.x, centre.x - limit, centre.x + limit);
    planCentre.z = THREE.MathUtils.clamp(planCentre.z, centre.z - limit, centre.z + limit);
  }

  function applyPlanPan(deltaX: number, deltaY: number) {
    const metres = metresPerCssPixel(planCamera, Math.max(host.clientHeight, 1));
    planCentre.x -= deltaX * metres;
    planCentre.z -= deltaY * metres;
    clampPlanCentre();
    planPanRevision += 1;
    host.dataset["planPanRevision"] = String(planPanRevision);
    applyPlan();
    render();
  }

  function onPlanPointerMove(event: PointerEvent) {
    if (!worldRenderable()) return;
    if (useAppStore.getState().viewMode !== "topdown") return;
    const previous = planPointers.get(event.pointerId);
    if (!previous) return;
    const next = new THREE.Vector2(event.clientX, event.clientY);
    planPointers.set(event.pointerId, next);
    if (planPointers.size === 1) {
      applyPlanPan(next.x - previous.x, next.y - previous.y);
    } else if (planPointers.size === 2) {
      const [first, second] = [...planPointers.values()];
      const currentDistance = first && second ? first.distanceTo(second) : null;
      if (currentDistance && lastPinchDistance && lastPinchDistance > 0) {
        const state = useAppStore.getState();
        state.setZoom(state.zoom * (currentDistance / lastPinchDistance));
      }
      lastPinchDistance = currentDistance;
    }
    event.preventDefault();
  }

  function onPlanPointerEnd(event: PointerEvent) {
    planPointers.delete(event.pointerId);
    planPointerStarts.delete(event.pointerId);
    interactionActive = planPointers.size > 0;
    if (!interactionActive) frameMetrics.reset();
    if (planPointers.size < 2) lastPinchDistance = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function onPlanWheel(event: WheelEvent) {
    if (!worldRenderable()) return;
    if (useAppStore.getState().viewMode !== "topdown") return;
    event.preventDefault();
    transientInteraction();
    const state = useAppStore.getState();
    state.setZoom(state.zoom * (event.deltaY < 0 ? 1.12 : 0.89));
  }

  function onVisibility() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastFrame = 0;
    frameMetrics.reset();
    applyEnvironment();
    if (document.hidden) audio.suspend();
    if (!document.hidden && !disposed) {
      render();
      scheduleFrame();
    }
  }

  function onMotion() {
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastFrame = 0;
    frameMetrics.reset();
    render();
    if (!motion.matches && !document.hidden && !disposed) scheduleFrame();
  }

  function onKey(event: KeyboardEvent) {
    if (!worldRenderable()) return;
    if (event.target !== canvas) return;
    const state = useAppStore.getState();
    if (state.viewMode === "walk" || state.viewMode === "ride") return;
    transientInteraction();
    if (state.viewMode === "topdown") {
      const key = event.key.toLowerCase();
      const deltas: Record<string, readonly [number, number]> = {
        arrowleft: [24, 0],
        a: [24, 0],
        arrowright: [-24, 0],
        d: [-24, 0],
        arrowup: [0, 24],
        w: [0, 24],
        arrowdown: [0, -24],
        s: [0, -24],
      };
      const delta = deltas[key];
      if (delta) {
        event.preventDefault();
        applyPlanPan(delta[0], delta[1]);
      }
      if (key === "r") {
        event.preventDefault();
        state.resetView();
      }
      if (key === "+" || key === "=") {
        event.preventDefault();
        state.zoomIn();
      }
      if (key === "-") {
        event.preventDefault();
        state.zoomOut();
      }
      return;
    }
    if (event.key === "ArrowLeft" || event.key.toLowerCase() === "a") {
      event.preventDefault();
      state.setHeading(state.heading - 8);
    }
    if (event.key === "ArrowRight" || event.key.toLowerCase() === "d") {
      event.preventDefault();
      state.setHeading(state.heading + 8);
    }
    if (event.key === "ArrowUp" || event.key.toLowerCase() === "w") {
      event.preventDefault();
      state.zoomIn();
    }
    if (event.key === "ArrowDown" || event.key.toLowerCase() === "s") {
      event.preventDefault();
      state.zoomOut();
    }
    if (event.key.toLowerCase() === "r") {
      event.preventDefault();
      state.resetView();
    }
  }

  function handleContextLost(event: Event) {
    event.preventDefault();
    bindCapture(null);
    onContextLost();
  }

  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  controls.addEventListener("change", onControlChange);
  controls.addEventListener("start", onControlStart);
  controls.addEventListener("end", onControlEnd);
  document.addEventListener("visibilitychange", onVisibility);
  motion.addEventListener("change", onMotion);
  canvas.addEventListener("keydown", onKey);
  canvas.addEventListener("pointerdown", onPlanPointerDown);
  canvas.addEventListener("pointermove", onPlanPointerMove);
  canvas.addEventListener("pointerup", onPlanPointerEnd);
  canvas.addEventListener("pointercancel", onPlanPointerEnd);
  canvas.addEventListener("wheel", onPlanWheel, { passive: false });
  canvas.addEventListener("webglcontextlost", handleContextLost);
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");

  const unsubscribeStore = useAppStore.subscribe((state, previous) => {
    if (disposed) return;
    if (
      state.lifeEnabled !== previous.lifeEnabled ||
      state.lifeDensity !== previous.lifeDensity ||
      state.ridePaused !== previous.ridePaused ||
      state.timeSpeed !== previous.timeSpeed ||
      state.realTimeEnabled !== previous.realTimeEnabled
    ) {
      life?.configure();
      life?.update(0);
      // Publish the paused/configured clock now, not a throttled pre-pause snapshot.
      lastLifeMetricsAt = 0;
      render();
      if (lifeActive()) scheduleFrame();
    }
    if (["walk", "ride"].includes(previous.viewMode) && !["walk", "ride"].includes(state.viewMode))
      restorePovCamera = true;
    if (state.viewReset !== previous.viewReset) {
      resetPlanCentre();
      planPanRevision += 1;
      host.dataset["planPanRevision"] = String(planPanRevision);
    }
    if (
      state.viewMode !== previous.viewMode ||
      state.heading !== previous.heading ||
      state.zoom !== previous.zoom ||
      state.viewReset !== previous.viewReset
    ) {
      if (!syncingControlsState) applyView(state.viewMode === previous.viewMode);
    }
    if (
      state.showTrees !== previous.showTrees ||
      state.showLabels !== previous.showLabels ||
      state.illustrativeDetails !== previous.illustrativeDetails ||
      state.viewMode !== previous.viewMode
    ) {
      updateLayerVisibility();
      render();
    }
    if (
      state.weather !== previous.weather ||
      state.viewMode !== previous.viewMode ||
      state.timeOfDayMinutes !== previous.timeOfDayMinutes ||
      state.soundOn !== previous.soundOn ||
      state.selectedDate !== previous.selectedDate ||
      state.season !== previous.season ||
      state.atmosphereEnabled !== previous.atmosphereEnabled
    ) {
      applyEnvironment();
      render();
      if (atmosphere.rainVisible || lifeActive()) scheduleFrame();
    }
  });

  const unsubscribeWorld = homeWorldSession.subscribe((snapshot) => {
    if (disposed) return;
    currentWorld = snapshot;
    mountWorld();
    applyEnvironment();
    updateLayerVisibility();
    atmosphere.warm(renderer, activeCamera);
    render();
    if (atmosphere.rainVisible || lifeActive()) scheduleFrame();
  });

  bindLifeCommands((command) => {
    if (!life || disposed) return;
    if (command.kind === "soundGesture") audio.gesture();
    if (command.kind === "move") {
      life.pov.move({ x: command.right, z: command.forward });
      scheduleFrame();
    }
    if (command.kind === "pause")
      useAppStore.setState({ ridePaused: !useAppStore.getState().ridePaused });
    if (command.kind === "pointerLock") {
      try {
        const result = canvas.requestPointerLock?.();
        if (result && "catch" in result) void result.catch(() => {});
      } catch {
        /* Unsupported/denied: dragging remains available. */
      }
    }
    if (command.kind === "orientation")
      void life.pov
        .requestOrientationPermission()
        .then((orientation) => updateLifeStatus({ orientation }));
  });
  mountWorld();
  updateLayerVisibility();
  applyEnvironment();
  resize();
  // Queue the visible state's programs; the startup sequence waits for them, then draws.
  renderer.compile(scene, activeCamera);
  const parallelCompile = renderer.extensions.has("KHR_parallel_shader_compile");
  const startup = runStartupSequence(
    {
      // Without the extension a program reports ready at once and links on first use.
      programsPending: () =>
        parallelCompile &&
        (renderer.info.programs ?? []).some(
          (program) => !(program as unknown as { isReady: () => boolean }).isReady(),
        ),
      stopped: () => disposed || renderer.getContext().isContextLost(),
      firstFrame: () => {
        firstFrameReady = true;
        render();
        if (atmosphere.rainVisible || lifeActive()) scheduleFrame();
      },
      warmVariant: (index) => {
        const total = atmosphere.warm(renderer, activeCamera, { start: index, end: index + 1 });
        host.dataset["startupVariants"] = `${Math.min(index + 1, total)}/${total}`;
        return total;
      },
    },
    {
      pollMs: STARTUP_PROGRAM_POLL_MS,
      timeoutMs: STARTUP_PROGRAM_TIMEOUT_MS,
      now: () => performance.now(),
      setTimer: (callback, ms) => window.setTimeout(callback, ms),
      clearTimer: (id) => window.clearTimeout(id),
    },
  );
  bindRealStreetView(() => {
    if (disposed || !worldRenderable()) return null;
    const mode = useAppStore.getState().viewMode;
    if (mode === "real") return null;
    const target =
      mode === "topdown"
        ? planCentre
        : mode === "walk" || mode === "ride"
          ? perspectiveCamera.position
          : controls.target;
    const direction = activeCamera.getWorldDirection(new THREE.Vector3());
    return {
      target: { x: target.x, y: target.y, z: target.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      mode: mode === "ride" ? "walk" : mode,
      zoom: 19,
    };
  });
  bindCapture(() => {
    if (!firstFrameReady || !worldRenderable() || document.hidden) return null;
    const captureStartedAt = performance.now();
    render();
    const image = canvas.toDataURL("image/png");
    host.dataset["captureLatencyMs"] = String(performance.now() - captureStartedAt);
    return image;
  });

  return {
    ready: startup.ready,
    setLabel(label) {
      canvas.setAttribute("aria-label", label);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bindCapture(null);
      bindRealStreetView(null);
      window.clearTimeout(interactionTimer);
      startup.stop();
      cancelAnimationFrame(animationFrame);
      unsubscribeStore();
      unsubscribeWorld();
      resizeObserver.disconnect();
      controls.removeEventListener("start", onControlStart);
      controls.removeEventListener("end", onControlEnd);
      controls.dispose();
      audio.dispose();
      resetLifeSession();
      document.removeEventListener("visibilitychange", onVisibility);
      motion.removeEventListener("change", onMotion);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("pointerdown", onPlanPointerDown);
      canvas.removeEventListener("pointermove", onPlanPointerMove);
      canvas.removeEventListener("pointerup", onPlanPointerEnd);
      canvas.removeEventListener("pointercancel", onPlanPointerEnd);
      canvas.removeEventListener("wheel", onPlanWheel);
      canvas.removeEventListener("webglcontextlost", handleContextLost);
      disposeWorld();
      moon.dispose();
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      materials.forEach((material) => material.dispose());
      atmosphere.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
