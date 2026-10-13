import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { bindCapture } from "./capture";
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
import { useAppStore } from "@/state/appStore";
import { surfaceCentroid } from "@/world/geometry";
import { worldDataProvider } from "@/world/privateWorldSession";
import type { WorldData } from "@/world/schema";

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

function worldHomeCentre(world: WorldData) {
  const homeLot = world.lots.find((lot) => lot.confirmed && lot.status === "empty");
  if (!homeLot) return worldCentre(world);
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
  const fog = new THREE.Fog(sky, 110, 280);
  scene.fog = fog;
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
  let centre = fallbackWorld ? worldCentre(fallbackWorld) : new THREE.Vector3();
  let homeCentre = fallbackWorld ? worldHomeCentre(fallbackWorld) : new THREE.Vector3();
  const planCentre = centre.clone();
  let span = fallbackWorld ? worldSpan(fallbackWorld) : 100;
  let planPanRevision = 0;
  const planPointers = new Map<number, THREE.Vector2>();
  let lastPinchDistance: number | null = null;
  let disposed = false;
  let animationFrame = 0;
  let lastFrame = 0;
  let renderRevision = 0;
  let lastWorldRevision = -1;
  const audio = createDemoAudio();
  const frameMetrics = createFrameMetrics();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");

  function mountWorld() {
    const snapshot = worldDataProvider.getSnapshot();
    currentWorld = snapshot;
    if (!("world" in snapshot)) return;
    worldBundle?.dispose();
    worldBundle = buildWorldMeshes(snapshot.world, materialFactory);
    scene.add(worldBundle.group);
    centre = worldCentre(snapshot.world);
    homeCentre = worldHomeCentre(snapshot.world);
    planCentre.copy(centre);
    span = worldSpan(snapshot.world);
    planPanRevision = 0;
    lastWorldRevision = snapshot.revision;
    applyView(true);
  }

  function disposeWorld() {
    worldBundle?.dispose();
    worldBundle = null;
  }

  function planConfig(state = useAppStore.getState()): PlanCameraConfig {
    return {
      centre: planCentre,
      verticalSpanMetres: span,
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
    controls.update();
    activeCamera = perspectiveCamera;
    scene.fog = fog;
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

  function applyEnvironment() {
    const state = useAppStore.getState();
    const daylight = daylightAt(state.timeOfDayMinutes);
    const wet = state.weather === "rain" || state.weather === "storm";
    const cloudy = state.weather !== "sunny";
    sky.set(cloudy ? "#aebdc0" : "#eee0c9").multiplyScalar(0.8 + daylight * 0.7);
    fog.color.copy(sky);
    hemisphere.intensity = 1 + daylight * (cloudy ? 1.5 : 2.2);
    sun.intensity = daylight * (cloudy ? 0.75 : 3.4);
    sun.position.set(-45 + (state.timeOfDayMinutes / 1440) * 90, 20 + daylight * 65, 28);
    materialFactory("#4c5551", 0.92, 0).roughness = wet ? 0.32 : 0.92;
    audio.set(state.soundOn && !document.hidden, wet);
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

  function render() {
    if (disposed || !host.clientWidth || !host.clientHeight) return;
    renderer.render(scene, activeCamera);
    frameMetrics.record(performance.now());
    const frameSnapshot = frameMetrics.snapshot();
    const markerWorld = new THREE.Vector3(homeCentre.x, 0.35, homeCentre.z).project(activeCamera);
    marker.style.transform = `translate(-50%, -100%) translate(${(markerWorld.x * 0.5 + 0.5) * host.clientWidth}px, ${(-markerWorld.y * 0.5 + 0.5) * host.clientHeight - 10}px)`;
    marker.style.visibility =
      Math.abs(markerWorld.x) < 0.94 && Math.abs(markerWorld.y) < 0.94 && markerWorld.z < 1
        ? "visible"
        : "hidden";
    host.dataset["drawCalls"] = String(renderer.info.render.calls);
    host.dataset["triangles"] = String(renderer.info.render.triangles);
    host.dataset["renderedFrames"] = String(frameSnapshot.renderedFrames);
    host.dataset["frameP50Ms"] = String(frameSnapshot.p50Ms ?? "");
    host.dataset["frameP95Ms"] = String(frameSnapshot.p95Ms ?? "");
    host.dataset["frameLongestMs"] = String(frameSnapshot.longestMs ?? "");
    host.dataset["worldMode"] = currentWorld.mode;
    host.dataset["worldRevision"] = String(currentWorld.revision);
    host.dataset["activeWorlds"] = worldBundle ? "1" : "0";
    host.dataset["cameraType"] = activeCamera.type;
  }

  function tick(now: number) {
    if (disposed || document.hidden) return;
    animationFrame = requestAnimationFrame(tick);
    if (motion.matches) return;
    const interval = window.innerWidth < 768 ? 1000 / 30 : 1000 / 60;
    if (now - lastFrame < interval) return;
    lastFrame = now;
    if (controls.enabled) controls.update();
    render();
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
    if (disposed || !controls.enabled) return;
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
    useAppStore.setState({ heading: (heading + 360) % 360, zoom });
    render();
  }

  function onPlanPointerDown(event: PointerEvent) {
    if (useAppStore.getState().viewMode !== "topdown") return;
    canvas.setPointerCapture(event.pointerId);
    planPointers.set(event.pointerId, new THREE.Vector2(event.clientX, event.clientY));
    if (planPointers.size === 2) {
      const [first, second] = [...planPointers.values()];
      lastPinchDistance = first && second ? first.distanceTo(second) : null;
    }
    event.preventDefault();
  }

  function clampPlanCentre() {
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
    if (planPointers.size < 2) lastPinchDistance = null;
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  }

  function onPlanWheel(event: WheelEvent) {
    if (useAppStore.getState().viewMode !== "topdown") return;
    event.preventDefault();
    const state = useAppStore.getState();
    state.setZoom(state.zoom * (event.deltaY < 0 ? 1.12 : 0.89));
  }

  function onVisibility() {
    cancelAnimationFrame(animationFrame);
    lastFrame = 0;
    applyEnvironment();
    if (!document.hidden && !disposed) animationFrame = requestAnimationFrame(tick);
  }

  function onMotion() {
    cancelAnimationFrame(animationFrame);
    lastFrame = 0;
    render();
    if (!motion.matches && !document.hidden && !disposed)
      animationFrame = requestAnimationFrame(tick);
  }

  function onKey(event: KeyboardEvent) {
    if (event.target !== canvas || useAppStore.getState().viewMode === "topdown") return;
    const state = useAppStore.getState();
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
      planCentre.copy(homeCentre);
      planPanRevision += 1;
      host.dataset["planPanRevision"] = String(planPanRevision);
    }
    if (
      state.viewMode !== previous.viewMode ||
      state.heading !== previous.heading ||
      state.zoom !== previous.zoom ||
      state.viewReset !== previous.viewReset
    ) {
      applyView(true);
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
    }
  });

  const unsubscribeWorld = worldDataProvider.subscribe((snapshot) => {
    if (disposed || snapshot.revision === lastWorldRevision) return;
    currentWorld = snapshot;
    if (snapshot.mode === "private-error") {
      disposeWorld();
      host.dataset["worldMode"] = snapshot.mode;
      host.dataset["activeWorlds"] = "0";
      useAppStore.getState().setPlanMeasurement(null);
      return;
    }
    mountWorld();
    updateLayerVisibility();
    render();
  });

  mountWorld();
  updateLayerVisibility();
  applyEnvironment();
  resize();
  renderer.compile(scene, activeCamera);
  render();
  bindCapture(() => {
    render();
    return canvas.toDataURL("image/png");
  });
  animationFrame = requestAnimationFrame(tick);

  return {
    setLabel(label) {
      canvas.setAttribute("aria-label", label);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bindCapture(null);
      cancelAnimationFrame(animationFrame);
      unsubscribeStore();
      unsubscribeWorld();
      resizeObserver.disconnect();
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
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
