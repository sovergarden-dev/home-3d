import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { bindCapture } from "./capture";
import { bindRealStreetView } from "./view/realStreetView";
import { createDemoAudio } from "./demoAudio";
import { daylightAt } from "./demoLayout";
import { buildWorldMeshes, type WorldMeshBundle } from "./world/buildWorldMeshes";
import { createFrameMetrics } from "./quality/frameMetrics";
import {
  configurePlanCamera,
  isPlanCameraZenith,
  metresPerCssPixel,
  type PlanCameraConfig,
} from "./view/planCamera";
import {
  PRIVATE_PLAN_CORE_SPAN_METRES,
  clampPrivatePlanCentre,
  derivePrivateWorldPlanFrame,
  type PrivateWorldPlanFrame,
} from "./view/privateWorldPlanFrame";
import { TEMPORARY_LOT_ILLUSTRATION_POSITION } from "./view/temporaryLotIllustration";
import { projectMarkerAndCull } from "./view/cameraFrame";
import { useAppStore } from "@/state/appStore";
import { surfaceCentroid } from "@/world/geometry";
import { worldDataProvider } from "@/world/privateWorldSession";
import type { WorldData } from "@/world/schema";
import { pickFeature, isTap } from "./interaction/featurePicking";
import {
  isConfidenceVisible,
  getSelectedFeature,
  selectFeature,
  subscribeFeatureSelection,
} from "@/world/featureSelection";

export interface SceneRuntime {
  setLabel: (label: string) => void;
  dispose: () => void;
}

function worldCentre(world: WorldData) {
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
  if (positions.length === 0) return new THREE.Vector3(0, 0, 0);
  const bounds = positions.reduce(
    (value, [x, z]) => ({
      minX: Math.min(value.minX, x),
      maxX: Math.max(value.maxX, x),
      minZ: Math.min(value.minZ, z),
      maxZ: Math.max(value.maxZ, z),
    }),
    { minX: Infinity, maxX: -Infinity, minZ: Infinity, maxZ: -Infinity },
  );
  return new THREE.Vector3((bounds.minX + bounds.maxX) / 2, 0, (bounds.minZ + bounds.maxZ) / 2);
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

function perspectiveFrame(world: WorldData, isPrivateWorld: boolean) {
  return {
    centre: isPrivateWorld ? new THREE.Vector3(0, 0, 0) : worldCentre(world),
    // Keep the supplied origin in view; longer source roads remain available for panning.
    span: isPrivateWorld ? PRIVATE_PLAN_CORE_SPAN_METRES : worldSpan(world),
  };
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
  scene.add(hemisphere, sun);

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
  let currentWorld = worldDataProvider.getSnapshot();
  const fallbackWorld = "world" in currentWorld ? currentWorld.world : null;
  const initialPerspectiveFrame = fallbackWorld
    ? perspectiveFrame(fallbackWorld, currentWorld.mode === "private")
    : null;
  let centre = initialPerspectiveFrame?.centre ?? new THREE.Vector3();
  let homeCentre = fallbackWorld ? worldHomeCentre(fallbackWorld) : new THREE.Vector3();
  const planCentre = homeCentre.clone();
  let span = initialPerspectiveFrame?.span ?? 100;
  let fullPlanSpan: number | null = null;
  let privatePlanFrame: PrivateWorldPlanFrame | null =
    currentWorld.mode === "private" && fallbackWorld
      ? derivePrivateWorldPlanFrame(fallbackWorld)
      : null;
  function resetPlanCentre() {
    fullPlanSpan = null;
    if (privatePlanFrame) {
      planCentre.set(privatePlanFrame.centre.x, 0, privatePlanFrame.centre.z);
      return;
    }
    planCentre.copy(homeCentre);
  }
  let planPanRevision = 0;
  const planPointers = new Map<number, THREE.Vector2>();
  const planPointerStarts = new Map<number, THREE.Vector2>();
  let lastPinchDistance: number | null = null;
  let disposed = false;
  let animationFrame = 0;
  let lastFrame = 0;
  let renderRevision = 0;
  let lastWorldRevision = -1;
  const audio = createDemoAudio();
  const frameMetrics = createFrameMetrics();
  let frameSnapshot = frameMetrics.snapshot();
  let lastMetricsSnapshotAt = 0;
  let updatingControls = false;
  let syncingControlsState = false;
  let interactionActive = false;
  let interactionTimer = 0;
  let pointerGestureWasMultiTouch = false;
  let lastPackageEpoch = currentWorld.packageEpoch;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function mountWorld() {
    const snapshot = worldDataProvider.getSnapshot();
    currentWorld = snapshot;
    if (!("world" in snapshot)) return;
    worldBundle?.dispose();
    const meshBuildStartedAt = performance.now();
    worldBundle = buildWorldMeshes(snapshot.world, materialFactory);
    host.dataset["meshBuildLatencyMs"] = String(performance.now() - meshBuildStartedAt);
    worldBundle.setConfidenceVisible(isConfidenceVisible());
    worldBundle.setSelectedFeature(getSelectedFeature()?.featureId ?? null);
    scene.add(worldBundle.group);
    const frame = perspectiveFrame(snapshot.world, snapshot.mode === "private");
    centre = frame.centre;
    homeCentre = worldHomeCentre(snapshot.world);
    privatePlanFrame =
      snapshot.mode === "private" ? derivePrivateWorldPlanFrame(snapshot.world) : null;
    resetPlanCentre();
    span = frame.span;
    planPanRevision = 0;
    lastWorldRevision = snapshot.revision;
    if (snapshot.packageEpoch !== lastPackageEpoch) selectFeature(null);
    lastPackageEpoch = snapshot.packageEpoch;
    // Effects anchor to the mounted world frame instead of a fixed origin.
    festivalGroup.position.set(homeCentre.x, 0, homeCentre.z);
    rainPoints.position.set(homeCentre.x, 0, homeCentre.z);
    applyView(true);
  }

  function disposeWorld() {
    worldBundle?.dispose();
    worldBundle = null;
  }

  function worldRenderable() {
    return currentWorld.mode !== "private-error" && worldBundle !== null;
  }

  function planConfig(state = useAppStore.getState()): PlanCameraConfig {
    const verticalSpanMetres = fullPlanSpan ?? privatePlanFrame?.verticalSpanMetres ?? span;
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
    const walk = state.viewMode === "walk";
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
    if (state.viewMode === "topdown") applyPlan(state);
    else applyPerspective(state);
    if (force) render();
  }

  // Rain & festival groups attached to world
  const festivalGroup = new THREE.Group();
  festivalGroup.name = "festival-group";
  scene.add(festivalGroup);

  const lanternMat = new THREE.MeshStandardMaterial({
    color: "#e65100",
    emissive: "#ff8f00",
    emissiveIntensity: 0.6,
    roughness: 0.4,
  });
  const lanternGeo = new THREE.SphereGeometry(0.35, 12, 12);
  const lanternWireGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-18, 6.2, 0),
    new THREE.Vector3(0, 5.2, 0),
    new THREE.Vector3(18, 6.2, 0),
  ]);
  const lanternWire = new THREE.Line(
    lanternWireGeo,
    new THREE.LineBasicMaterial({ color: "#8d6e63" }),
  );
  festivalGroup.add(lanternWire);
  for (let x = -16; x <= 16; x += 4) {
    const lantern = new THREE.Mesh(lanternGeo, lanternMat);
    lantern.position.set(x, 5.2 + (Math.abs(x) / 16) * 1.0, 0);
    festivalGroup.add(lantern);
  }
  festivalGroup.visible = false;

  // Rain particles system
  const rainCount = 600;
  const rainGeo = new THREE.BufferGeometry();
  const rainPositions = new Float32Array(rainCount * 3);
  for (let i = 0; i < rainCount; i++) {
    rainPositions[i * 3] = (Math.random() - 0.5) * 80;
    rainPositions[i * 3 + 1] = Math.random() * 30;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * 80;
  }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPositions, 3));
  const rainMat = new THREE.PointsMaterial({
    color: "#a4b5bf",
    size: 0.18,
    transparent: true,
    opacity: 0.7,
  });
  const rainPoints = new THREE.Points(rainGeo, rainMat);
  rainPoints.name = "rain-particles";
  scene.add(rainPoints);
  rainPoints.visible = false;

  function applyEnvironment() {
    const state = useAppStore.getState();
    const daylight = daylightAt(state.timeOfDayMinutes);
    const wet = state.weather === "rain" || state.weather === "storm";
    const cloudy = state.weather !== "sunny";
    sky.set(cloudy ? "#aebdc0" : "#eee0c9").multiplyScalar(0.8 + daylight * 0.7);
    hemisphere.intensity = 1 + daylight * (cloudy ? 1.5 : 2.2);
    sun.intensity = daylight * (cloudy ? 0.75 : 3.4);
    sun.position.set(-45 + (state.timeOfDayMinutes / 1440) * 90, 20 + daylight * 65, 28);
    worldBundle?.setRoadWet(wet);
    audio.set(state.soundOn && !document.hidden, wet);

    // Effects only render when a valid world is mounted; rain follows the world frame.
    const renderable = worldRenderable();
    festivalGroup.visible = renderable && state.festival !== "normal";
    rainPoints.visible = renderable && wet;

    host.dataset["weather"] = state.weather;
    host.dataset["festival"] = state.festival;
    host.dataset["night"] = String(daylight < 0.1);
  }

  function updateLayerVisibility() {
    if (!worldBundle) return;
    const state = useAppStore.getState();
    worldBundle.setLayerVisible("trees", state.showTrees);
    worldBundle.setLayerVisible("labels", state.showLabels);
    host.dataset["treesVisible"] = String(state.showTrees);
    host.dataset["labelsVisible"] = String(state.showLabels);
  }

  function render(activeAnimation = false) {
    if (disposed || document.hidden || !host.clientWidth || !host.clientHeight) return;
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
    const renderedAt = performance.now();
    frameMetrics.record(
      renderedAt,
      interactionActive || activeAnimation || rainPoints.visible ? "active" : "idle",
    );
    if (lastMetricsSnapshotAt === 0 || renderedAt - lastMetricsSnapshotAt >= 250) {
      frameSnapshot = frameMetrics.snapshot();
      lastMetricsSnapshotAt = renderedAt;
    }
    if (currentWorld.mode === "private" && currentWorld.temporaryLotIllustrationSelected) {
      markerPosition.set(
        TEMPORARY_LOT_ILLUSTRATION_POSITION.x,
        TEMPORARY_LOT_ILLUSTRATION_POSITION.y,
        TEMPORARY_LOT_ILLUSTRATION_POSITION.z,
      );
    } else {
      markerPosition.set(homeCentre.x, 0.35, homeCentre.z);
    }
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
  }

  function scheduleFrame() {
    if (disposed || document.hidden || motion.matches || animationFrame !== 0) return;
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
    if (disposed || document.hidden || motion.matches) return;
    const delta = lastFrame === 0 ? 0.016 : Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;

    // Update falling rain particle positions
    if (rainPoints.visible && rainGeo.attributes["position"]) {
      const posAttr = rainGeo.attributes["position"];
      const positions = posAttr.array as Float32Array;
      for (let i = 1; i < positions.length; i += 3) {
        const currentY = positions[i];
        if (currentY !== undefined) {
          positions[i] = currentY - delta * 35;
          if (positions[i]! < 0) {
            positions[i] = 30;
          }
        }
      }
      posAttr.needsUpdate = true;
    }

    const controlsChanged = controls.enabled ? updateControls() : false;
    if (controlsChanged || rainPoints.visible) {
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
    if (planPointers.size === 0) pointerGestureWasMultiTouch = false;
    interactionActive = true;
    planPointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
    planPointerStarts.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
    if (planPointers.size === 2) {
      pointerGestureWasMultiTouch = true;
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
    const start = planPointerStarts.get(event.pointerId);
    if (
      start &&
      planPointers.size === 1 &&
      worldBundle &&
      !pointerGestureWasMultiTouch &&
      event.type !== "pointercancel" &&
      isTap(start, new THREE.Vector2(event.clientX, event.clientY))
    ) {
      const rect = canvas.getBoundingClientRect();
      const pointer = new THREE.Vector2(
        ((event.clientX - rect.left) / rect.width) * 2 - 1,
        -((event.clientY - rect.top) / rect.height) * 2 + 1,
      );
      const hiddenLayers = new Set<string>();
      if (!worldBundle.layers.trees.visible) hiddenLayers.add("trees");
      if (!worldBundle.layers.labels.visible) hiddenLayers.add("labels");
      selectFeature(
        pickFeature(new THREE.Raycaster(), pointer, activeCamera, worldBundle.group, hiddenLayers),
      );
    }
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
        state.requestCameraFrame("core");
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
    if (state.viewReset !== previous.viewReset) {
      resetPlanCentre();
      planPanRevision += 1;
      host.dataset["planPanRevision"] = String(planPanRevision);
    }
    if (state.cameraFrame.request !== previous.cameraFrame.request) {
      resetPlanCentre();
      if (state.cameraFrame.kind === "full") {
        if ("world" in currentWorld) {
          planCentre.copy(worldCentre(currentWorld.world));
          fullPlanSpan =
            worldSpan(currentWorld.world) *
            Math.max(1, host.clientHeight / Math.max(host.clientWidth, 1));
        }
        useAppStore.setState({ viewMode: "topdown", zoom: 1 });
      } else if (state.cameraFrame.kind === "core") {
        useAppStore.setState({ viewMode: "topdown", zoom: 1 });
      }
      planPanRevision += 1;
      applyView(true);
      return;
    }
    if (
      state.viewMode !== previous.viewMode ||
      state.heading !== previous.heading ||
      state.zoom !== previous.zoom ||
      state.viewReset !== previous.viewReset
    ) {
      if (!syncingControlsState) applyView(true);
    }
    if (state.showTrees !== previous.showTrees || state.showLabels !== previous.showLabels) {
      updateLayerVisibility();
      render();
    }
    if (
      state.weather !== previous.weather ||
      state.timeOfDayMinutes !== previous.timeOfDayMinutes ||
      state.festival !== previous.festival ||
      state.soundOn !== previous.soundOn
    ) {
      applyEnvironment();
      render();
      if (rainPoints.visible) scheduleFrame();
    }
  });

  const unsubscribeConfidence = subscribeFeatureSelection(() => {
    worldBundle?.setConfidenceVisible(isConfidenceVisible());
    worldBundle?.setSelectedFeature(getSelectedFeature()?.featureId ?? null);
    render();
  });

  const unsubscribeWorld = worldDataProvider.subscribe((snapshot) => {
    if (disposed) return;
    currentWorld = snapshot;
    if (snapshot.packageEpoch !== lastPackageEpoch) {
      selectFeature(null);
      lastPackageEpoch = snapshot.packageEpoch;
    }
    if (snapshot.revision === lastWorldRevision) {
      render();
      return;
    }
    if (snapshot.mode === "private-error") {
      disposeWorld();
      festivalGroup.visible = false;
      rainPoints.visible = false;
      controls.enabled = false;
      marker.style.visibility = "hidden";
      renderer.clear();
      renderer.render(scene, activeCamera);
      host.dataset["worldMode"] = snapshot.mode;
      host.dataset["activeWorlds"] = "0";
      useAppStore.getState().setPlanMeasurement(null);
      return;
    }
    mountWorld();
    applyEnvironment();
    updateLayerVisibility();
    render();
    if (rainPoints.visible) scheduleFrame();
  });

  mountWorld();
  updateLayerVisibility();
  applyEnvironment();
  resize();
  renderer.compile(scene, activeCamera);
  render();
  bindRealStreetView(() => {
    if (disposed || !worldRenderable()) return null;
    const mode = useAppStore.getState().viewMode;
    if (mode === "real") return null;
    const target = mode === "topdown" ? planCentre : controls.target;
    const direction = activeCamera.getWorldDirection(new THREE.Vector3());
    return {
      target: { x: target.x, y: target.y, z: target.z },
      direction: { x: direction.x, y: direction.y, z: direction.z },
      mode,
      zoom: 19,
    };
  });
  bindCapture(() => {
    if (!worldRenderable() || document.hidden) return null;
    const captureStartedAt = performance.now();
    render();
    const image = canvas.toDataURL("image/png");
    host.dataset["captureLatencyMs"] = String(performance.now() - captureStartedAt);
    return image;
  });
  if (rainPoints.visible) scheduleFrame();

  return {
    setLabel(label) {
      canvas.setAttribute("aria-label", label);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bindCapture(null);
      bindRealStreetView(null);
      window.clearTimeout(interactionTimer);
      cancelAnimationFrame(animationFrame);
      unsubscribeStore();
      unsubscribeWorld();
      unsubscribeConfidence();
      resizeObserver.disconnect();
      controls.removeEventListener("start", onControlStart);
      controls.removeEventListener("end", onControlEnd);
      controls.dispose();
      audio.dispose();
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
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      materials.forEach((material) => material.dispose());
      rainGeo.dispose();
      rainMat.dispose();
      lanternGeo.dispose();
      lanternMat.dispose();
      lanternWireGeo.dispose();
      (lanternWire.material as THREE.Material).dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
