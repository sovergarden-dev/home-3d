import { createLifeRuntime } from "./life/runtime";
import { bindLifeCommands, resetLifeSession, updateLifeStatus } from "./life/session";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { bindCapture } from "./capture";
import { bindRealStreetView } from "./view/externalMapView";
import { createDemoAudio } from "./demoAudio";
import { createAtmosphereLayer } from "./atmosphere";
import { getAstronomy, phaseMoon } from "@/atmosphere/astronomy";
import { getEffectiveFestival, getEffectiveSeason } from "@/atmosphere/calendar";
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
import { memorySession } from "@/memories/session";
import { bindMemoryCamera } from "@/memories/bridge";
import { createMemoryPinLayer, type MemoryPin } from "@/memories/pins";
import {
  clampCameraPose,
  DEFAULT_CAMERA_POSE,
  catmullCameraPose,
  type CameraPose,
} from "@/memories/camera";
import { poseToOrbit } from "./view/memoryOrbit";
import { buildMemoryHash, parseMemoryHash } from "@/memories/deepLink";
import { bindPostcardCapture } from "@/memories/postcard";

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
  let syncingMemoryPose = false;
  let interactionActive = false;
  let interactionTimer = 0;
  let pointerGestureWasMultiTouch = false;
  let lastPackageEpoch = currentWorld.packageEpoch;
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const pinTier =
    window.innerWidth < 768 || renderer.capabilities.maxTextureSize <= 4096
      ? "low"
      : window.innerWidth < 1100
        ? "mid"
        : "high";
  const memoryPins = createMemoryPinLayer(pinTier);
  scene.add(memoryPins.group);
  const memoryPose = {
    ...DEFAULT_CAMERA_POSE,
    target: [...DEFAULT_CAMERA_POSE.target] as [number, number, number],
  } as CameraPose;
  let memorySessionSnapshot = memorySession.getSnapshot();
  let memoryTour: {
    memories: readonly MemoryPin[];
    index: number;
    from: CameraPose;
    to: CameraPose;
    started: number;
    holdUntil: number;
    paused: boolean;
    saved: CameraPose;
    savedMode: ReturnType<typeof useAppStore.getState>["viewMode"];
    savedHeading: number;
    savedZoom: number;
    savedRaw: ReturnType<typeof saveMemoryCamera>;
  } | null = null;
  let memoryFlight: {
    from: CameraPose;
    to: CameraPose;
    started: number;
    duration: number;
    onDone?: () => void;
  } | null = null;
  let memoryRenderTargets = 0;
  let memoryLastPinSignature = "";
  let memoryPinsDirty = false;
  let memoryLinkError: string | undefined;
  const memoryListeners = new Set<() => void>();
  const notifyMemory = () => memoryListeners.forEach((listener) => listener());
  const memorySnapshot = () => ({
    ...(memoryLinkError ? { error: memoryLinkError } : {}),
    active: Boolean(memoryTour || memoryFlight),
    paused: Boolean(memoryTour?.paused),
    index: memoryTour?.index ?? -1,
    memoryId: memoryTour ? (memoryTour.memories[memoryTour.index]?.id ?? null) : null,
  });
  const currentMemoryPose = (): CameraPose => {
    if (useAppStore.getState().viewMode === "topdown")
      return clampCameraPose({
        ...memoryPose,
        mode: "topdown",
        target: [planCentre.x, 0, planCentre.z],
        zoom: useAppStore.getState().zoom,
        distance: span,
      });
    const target = controls.target;
    const distance = perspectiveCamera.position.distanceTo(target);
    return clampCameraPose({
      mode: "diorama",
      target: [target.x, Math.max(0, target.y), target.z],
      yaw: Math.atan2(
        perspectiveCamera.position.x - target.x,
        perspectiveCamera.position.z - target.z,
      ),
      pitch: Math.atan2(
        perspectiveCamera.position.y - target.y,
        Math.max(
          0.001,
          Math.hypot(
            perspectiveCamera.position.x - target.x,
            perspectiveCamera.position.z - target.z,
          ),
        ),
      ),
      distance,
      zoom: (span * 1.15) / Math.max(distance, 1),
    });
  };
  const saveMemoryCamera = () => ({
    position: perspectiveCamera.position.clone(),
    quaternion: perspectiveCamera.quaternion.clone(),
    planCentre: planCentre.clone(),
    planPosition: planCamera.position.clone(),
    planQuaternion: planCamera.quaternion.clone(),
    planProjection: planCamera.projectionMatrix.clone(),
    target: controls.target.clone(),
    aspect: perspectiveCamera.aspect,
    projection: perspectiveCamera.projectionMatrix.elements.slice(),
  });
  const applyMemoryPose = (pose: CameraPose) => {
    const next = clampCameraPose(pose);
    Object.assign(memoryPose, next);
    syncingMemoryPose = true;
    try {
      if (next.mode === "topdown") {
        useAppStore.setState({ viewMode: "topdown", zoom: next.zoom });
        planCentre.set(next.target[0], 0, next.target[2]);
        applyPlan();
      } else {
        useAppStore.setState({
          viewMode: "diorama",
          heading: savedHeadingSafe(next.yaw),
          zoom: next.zoom,
        });
        controls.target.set(next.target[0], next.target[1], next.target[2]);
        poseToOrbit(next, perspectiveCamera.position);
        perspectiveCamera.lookAt(controls.target);
        activeCamera = perspectiveCamera;
        controls.update();
      }
    } finally {
      syncingMemoryPose = false;
    }
    render(true);
  };
  const beginMemoryFlight = (to: CameraPose, onDone?: () => void) => {
    const from = currentMemoryPose();
    const target = clampCameraPose(to);
    if (motion.matches) {
      applyMemoryPose(target);
      onDone?.();
      if (memoryTour) scheduleFrame();
      return;
    }
    memoryFlight = {
      from,
      to: target,
      started: performance.now(),
      duration: 1200,
      ...(onDone ? { onDone } : {}),
    };
    controls.enabled = false;
    scheduleFrame();
  };
  const restoreMemoryCamera = () => {
    if (!memoryTour) return;
    const tour = memoryTour;
    memoryTour = null;
    memoryFlight = null;
    syncingMemoryPose = true;
    perspectiveCamera.position.copy(tour.savedRaw.position);
    perspectiveCamera.quaternion.copy(tour.savedRaw.quaternion);
    planCentre.copy(tour.savedRaw.planCentre);
    planCamera.position.copy(tour.savedRaw.planPosition);
    planCamera.quaternion.copy(tour.savedRaw.planQuaternion);
    planCamera.projectionMatrix.copy(tour.savedRaw.planProjection);
    planCamera.projectionMatrixInverse.copy(planCamera.projectionMatrix).invert();
    controls.target.copy(tour.savedRaw.target);
    perspectiveCamera.aspect = tour.savedRaw.aspect;
    perspectiveCamera.updateProjectionMatrix();
    perspectiveCamera.projectionMatrix.fromArray(tour.savedRaw.projection);
    activeCamera = tour.savedMode === "topdown" ? planCamera : perspectiveCamera;
    useAppStore.setState({
      viewMode: tour.savedMode,
      heading: tour.savedHeading,
      zoom: tour.savedZoom,
    });
    syncingMemoryPose = false;
    controls.enabled = tour.savedMode === "diorama";
    render(true);
    notifyMemory();
  };
  const savedHeadingSafe = (yaw: number) => ((yaw * 180) / Math.PI + 360) % 360;
  const makeMemoryTour = (memories: readonly MemoryPin[], saved: CameraPose) => ({
    memories,
    index: 0,
    from: saved,
    to: clampCameraPose(memories[0]!.camera),
    started: performance.now(),
    holdUntil: 0,
    paused: false,
    saved,
    savedMode: useAppStore.getState().viewMode,
    savedHeading: useAppStore.getState().heading,
    savedZoom: useAppStore.getState().zoom,
    savedRaw: saveMemoryCamera(),
  });
  const startMemoryTour = (memories: readonly MemoryPin[]) => {
    const visible = memories.filter(
      (m) => !memorySessionSnapshot.guest || m.visibility !== "private",
    );
    const mode = useAppStore.getState().viewMode;
    if (!visible.length || (mode !== "diorama" && mode !== "topdown")) return;
    const saved = currentMemoryPose();
    memoryTour = makeMemoryTour(visible, saved);
    controls.enabled = false;
    notifyMemory();
    beginMemoryFlight(memoryTour.to, () => {
      if (memoryTour) {
        memoryTour.holdUntil = performance.now() + 5000;
        notifyMemory();
      }
    });
  };
  const flyMemory = (memory: MemoryPin) => {
    if (memorySessionSnapshot.guest && memory.visibility === "private") return;
    if (!memoryTour && !memoryFlight) {
      const mode = useAppStore.getState().viewMode;
      if (mode !== "diorama" && mode !== "topdown") return;
      memoryTour = makeMemoryTour([memory], currentMemoryPose());
      controls.enabled = false;
      notifyMemory();
    } else if (memoryTour) {
      memoryTour.memories = [memory];
      memoryTour.index = 0;
      memoryTour.to = clampCameraPose(memory.camera);
      memoryTour.holdUntil = 0;
      memoryTour.paused = false;
      notifyMemory();
    }
    beginMemoryFlight(memory.camera);
  };
  const unsubscribeMemoryBinding = bindMemoryCamera({
    getPose: currentMemoryPose,
    flyTo: flyMemory,
    startTour: startMemoryTour,
    previous: () => {
      if (memoryTour) {
        memoryTour.index = Math.max(0, memoryTour.index - 1);
        memoryTour.to = clampCameraPose(memoryTour.memories[memoryTour.index]!.camera);
        notifyMemory();
        memoryTour.holdUntil = 0;
        beginMemoryFlight(memoryTour.to, () => {
          if (memoryTour && memoryTour.memories.length > 1)
            memoryTour.holdUntil = performance.now() + 5000;
        });
      }
    },
    next: () => {
      if (memoryTour) {
        if (memoryTour.index + 1 < memoryTour.memories.length) {
          memoryTour.index += 1;
          memoryTour.to = clampCameraPose(memoryTour.memories[memoryTour.index]!.camera);
          notifyMemory();
          memoryTour.holdUntil = 0;
          beginMemoryFlight(memoryTour.to, () => {
            if (memoryTour) memoryTour.holdUntil = performance.now() + 5000;
          });
        } else restoreMemoryCamera();
      }
    },
    pause: () => {
      if (memoryTour) {
        memoryTour.paused = !memoryTour.paused;
        notifyMemory();
      }
    },
    exit: restoreMemoryCamera,
    getSnapshot: memorySnapshot,
    subscribe: (listener) => {
      memoryListeners.add(listener);
      return () => memoryListeners.delete(listener);
    },
  });
  const unsubscribeMemorySession = memorySession.subscribe(() => {
    const wasGuest = memorySessionSnapshot.guest;
    memorySessionSnapshot = memorySession.getSnapshot();
    if (
      !memorySessionSnapshot.ready ||
      wasGuest !== memorySessionSnapshot.guest ||
      (memoryTour &&
        memoryTour.memories.some(
          (m) => !memorySessionSnapshot.memories.some((current) => current.id === m.id),
        ))
    )
      restoreMemoryCamera();
    const sig =
      memorySessionSnapshot.memories
        .map((m) => `${m.id}:${m.position.join(",")}:${m.visibility}`)
        .join("|") + `:${memorySessionSnapshot.guest}`;
    if (sig !== memoryLastPinSignature) {
      memoryLastPinSignature = sig;
      memoryPins.update(memorySessionSnapshot.memories, memorySessionSnapshot.guest);
      host.dataset["memoryPins"] = String(memoryPins.mesh.count);
      memoryPinsDirty = true;
      scheduleFrame();
      if (!memoryTour && !memoryFlight) {
        const link = parseMemoryHash(window.location.hash);
        if (link.state?.id) applyLink(link);
      }
    }
  });
  memorySessionSnapshot = memorySession.getSnapshot();
  memoryPins.update(memorySessionSnapshot.memories, memorySessionSnapshot.guest);
  host.dataset["memoryPinMeshes"] = "1";
  host.dataset["memoryPins"] = String(memoryPins.mesh.count);

  function mountWorld() {
    const snapshot = worldDataProvider.getSnapshot();
    currentWorld = snapshot;
    if (!("world" in snapshot)) return;
    life?.dispose();
    life = null;
    audio.notifyPackageReplaced();
    if (useAppStore.getState().soundOn) useAppStore.setState({ soundOn: false });
    worldBundle?.dispose();
    const meshBuildStartedAt = performance.now();
    worldBundle = buildWorldMeshes(snapshot.world, materialFactory);
    atmosphere.invalidateWorld();
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
    lastWorldRevision = snapshot.revision;
    if (snapshot.packageEpoch !== lastPackageEpoch) selectFeature(null);
    lastPackageEpoch = snapshot.packageEpoch;
    // Effects anchor to the mounted world frame instead of a fixed origin.
    atmosphere.group.position.set(homeCentre.x, 0, homeCentre.z);
    applyView(true);
  }

  function disposeWorld() {
    life?.dispose();
    life = null;
    audio.notifyPackageReplaced();
    if (useAppStore.getState().soundOn) useAppStore.setState({ soundOn: false });
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
    const effectiveWeather =
      state.realWeatherEnabled && state.realWeatherKind ? state.realWeatherKind : state.weather;
    const selectedDate = state.selectedDate;
    const reference =
      currentWorld.mode === "private" ? worldDataProvider.getGeoreference()?.origin : null;
    const astronomy =
      reference || currentWorld.mode !== "private"
        ? getAstronomy(selectedDate, state.timeOfDayMinutes, reference ?? null)
        : null;
    const effectiveFestival = getEffectiveFestival(state);
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
        floodLevel: state.floodLevel,
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
        fixture:
          currentWorld.mode === "fixture" ||
          ("world" in currentWorld && currentWorld.world.manifest.isSynthetic),
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
      memoryPinsDirty = false;
      host.dataset["activeWorlds"] = "0";
      host.dataset["worldMode"] = currentWorld.mode;
      return;
    }
    renderer.render(scene, activeCamera);
    // A pin update is a one-shot invalidation; do not let reduced-motion RAF spin.
    memoryPinsDirty = false;
    host.dataset["memoryRenderTargets"] = String(memoryRenderTargets);
    host.dataset["memoryTextures"] = String(renderer.info.memory.textures);
    host.dataset["memoryGeometries"] = String(renderer.info.memory.geometries);
    host.dataset["memoryTourActive"] = String(Boolean(memoryTour));
    host.dataset["memoryPins"] = String(memoryPins.mesh.count);
    const renderedAt = performance.now();
    frameMetrics.record(
      renderedAt,
      interactionActive || activeAnimation || atmosphere.rainVisible ? "active" : "idle",
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
    marker.style.visibility = memorySessionSnapshot.guest
      ? "hidden"
      : projected.visible
        ? "visible"
        : "hidden";
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
      document.hidden ||
      (motion.matches && !lifeActive() && !memoryTour && !memoryFlight && !memoryPinsDirty) ||
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
    if (
      disposed ||
      document.hidden ||
      (motion.matches && !lifeActive() && !memoryTour && !memoryFlight && !memoryPinsDirty)
    )
      return;
    const delta = lastFrame === 0 ? 0.016 : Math.min(0.1, (now - lastFrame) / 1000);
    lastFrame = now;
    if (memoryFlight && !memoryTour?.paused) {
      const t = Math.min(1, (now - memoryFlight.started) / memoryFlight.duration);
      const prev =
        memoryTour?.memories[Math.max(0, (memoryTour.index ?? 0) - 1)]?.camera ?? memoryFlight.from;
      const next = memoryTour?.memories[(memoryTour.index ?? 0) + 1]?.camera ?? memoryFlight.to;
      const eased = t * t * (3 - 2 * t);
      applyMemoryPose(catmullCameraPose(prev, memoryFlight.from, memoryFlight.to, next, eased));
      if (t >= 1) {
        const done = memoryFlight.onDone;
        memoryFlight = null;
        notifyMemory();
        done?.();
      }
    }
    if (
      memoryTour &&
      !memoryTour.paused &&
      !memoryFlight &&
      memoryTour.holdUntil &&
      now >= memoryTour.holdUntil
    ) {
      if (memoryTour.index + 1 < memoryTour.memories.length) {
        memoryTour.index += 1;
        memoryTour.to = clampCameraPose(memoryTour.memories[memoryTour.index]!.camera);
        notifyMemory();
        beginMemoryFlight(memoryTour.to, () => {
          if (memoryTour) {
            memoryTour.holdUntil = performance.now() + 5000;
            notifyMemory();
          }
        });
      } else restoreMemoryCamera();
    }
    host.dataset["memoryTourActive"] = String(Boolean(memoryTour));
    host.dataset["memoryPins"] = String(memoryPins.mesh.count);

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
    if (
      controlsChanged ||
      atmosphere.rainVisible ||
      lifeFrameRequested ||
      lifeActive() ||
      memoryFlight ||
      memoryPinsDirty ||
      (memoryTour && !memoryTour.paused)
    ) {
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
    if (memoryTour || memoryFlight) restoreMemoryCamera();
    interactionActive = true;
  }
  function onControlEnd() {
    interactionActive = false;
    frameMetrics.reset();
    window.clearTimeout(interactionTimer);
    interactionTimer = window.setTimeout(() => {
      if (!disposed)
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${window.location.search}${buildMemoryHash({ pose: currentMemoryPose(), time: useAppStore.getState().timeOfDayMinutes })}`,
        );
    }, 120);
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
      !["walk", "ride"].includes(useAppStore.getState().viewMode) &&
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
      const pinHit = new THREE.Raycaster();
      pinHit.setFromCamera(pointer, activeCamera);
      const pinIntersections = pinHit.intersectObject(memoryPins.mesh, false);
      const pin = pinIntersections[0];
      if (pin && Number.isInteger(pin.instanceId)) {
        const memory = memoryPins.memories[pin.instanceId ?? -1];
        if (memory) flyMemory(memory);
      } else
        selectFeature(
          pickFeature(
            new THREE.Raycaster(),
            pointer,
            activeCamera,
            worldBundle.group,
            hiddenLayers,
          ),
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

  let memoryPausedAt = 0;
  let memoryVisibilityPaused = false;
  function onVisibility() {
    if (document.hidden) memoryPausedAt = performance.now();
    cancelAnimationFrame(animationFrame);
    animationFrame = 0;
    lastFrame = 0;
    frameMetrics.reset();
    if (document.hidden && memoryTour && !memoryTour.paused) {
      memoryVisibilityPaused = true;
      memoryTour.paused = true;
      notifyMemory();
    }
    applyEnvironment();
    if (document.hidden) audio.suspend();
    if (!document.hidden && !disposed) {
      const resumedAt = performance.now();
      const pausedFor = memoryPausedAt ? resumedAt - memoryPausedAt : 0;
      if (memoryFlight) memoryFlight.started += pausedFor;
      if (memoryTour?.holdUntil) memoryTour.holdUntil += pausedFor;
      if (memoryTour && memoryVisibilityPaused) {
        memoryTour.paused = false;
        memoryVisibilityPaused = false;
        notifyMemory();
      }
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

  bindPostcardCapture(async (width, height) => {
    if (width * height > renderer.capabilities.maxTextureSize ** 2)
      throw new Error("POSTCARD_TOO_LARGE");
    // Scene targets are linear/HDR in Three r180. Merely setting outputColorSpace
    // on the renderer does not apply screen tone mapping to an offscreen target.
    const sceneTarget = new THREE.WebGLRenderTarget(width, height, {
      depthBuffer: true,
      type: THREE.HalfFloatType,
    });
    const target = new THREE.WebGLRenderTarget(width, height, { depthBuffer: false });
    const output = new OutputPass();
    memoryRenderTargets += 2;
    const previous = renderer.getRenderTarget();
    const oldViewport = renderer.getViewport(new THREE.Vector4());
    const oldScissor = renderer.getScissor(new THREE.Vector4());
    const oldScissorTest = renderer.getScissorTest();
    const oldAutoClear = renderer.autoClear;
    const oldCamera = activeCamera;
    const oldPerspectiveAspect = perspectiveCamera.aspect;
    const oldPerspectiveProjection = perspectiveCamera.projectionMatrix.elements.slice();
    const oldPlanProjection = planCamera.projectionMatrix.elements.slice();
    let canvas2d: HTMLCanvasElement | null = null;
    try {
      const camera = oldCamera;
      if (camera instanceof THREE.PerspectiveCamera) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
      }
      renderer.setRenderTarget(sceneTarget);
      renderer.setViewport(0, 0, width, height);
      renderer.setScissorTest(false);
      renderer.render(scene, camera);
      // OutputPass uses the renderer's ACES exposure and sRGB transfer exactly
      // as the visible canvas does, then writes display bytes to the readback RT.
      output.render(renderer, target, sceneTarget, 0, false);
      const pixels = new Uint8Array(width * height * 4);
      renderer.readRenderTargetPixels(target, 0, 0, width, height, pixels);
      canvas2d = document.createElement("canvas");
      canvas2d.width = width;
      canvas2d.height = height;
      const ctx = canvas2d.getContext("2d");
      if (!ctx) throw new Error("CANVAS_UNAVAILABLE");
      const image = ctx.createImageData(width, height);
      for (let y = 0; y < height; y++)
        image.data.set(
          pixels.subarray(y * width * 4, (y + 1) * width * 4),
          (height - y - 1) * width * 4,
        );
      ctx.putImageData(image, 0, 0);
      return await new Promise<Blob>((resolve, reject) =>
        canvas2d!.toBlob((b) => (b ? resolve(b) : reject(new Error("ENCODE_FAILED"))), "image/png"),
      );
    } finally {
      perspectiveCamera.aspect = oldPerspectiveAspect;
      perspectiveCamera.updateProjectionMatrix();
      perspectiveCamera.projectionMatrix.fromArray(oldPerspectiveProjection);
      planCamera.projectionMatrix.fromArray(oldPlanProjection);
      renderer.autoClear = oldAutoClear;
      renderer.setRenderTarget(previous);
      renderer.setViewport(oldViewport);
      renderer.setScissor(oldScissor);
      renderer.setScissorTest(oldScissorTest);
      output.dispose();
      sceneTarget.dispose();
      target.dispose();
      memoryRenderTargets = 0;
      host.dataset["memoryRenderTargets"] = "0";
      if (canvas2d) {
        canvas2d.width = 0;
        canvas2d.height = 0;
      }
    }
  });
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
    if (syncingMemoryPose) return;
    if ((memoryTour || memoryFlight) && state.viewMode !== previous.viewMode) {
      const requestedMode = state.viewMode;
      restoreMemoryCamera();
      useAppStore.setState({ viewMode: requestedMode });
      return;
    }
    if ((memoryTour || memoryFlight) && state.viewReset !== previous.viewReset)
      restoreMemoryCamera();
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
      if (!syncingControlsState) applyView(state.viewMode === previous.viewMode);
    }
    if (state.showTrees !== previous.showTrees || state.showLabels !== previous.showLabels) {
      updateLayerVisibility();
      render();
    }
    if (
      state.weather !== previous.weather ||
      state.realWeatherKind !== previous.realWeatherKind ||
      state.realWeatherEnabled !== previous.realWeatherEnabled ||
      state.viewMode !== previous.viewMode ||
      state.timeOfDayMinutes !== previous.timeOfDayMinutes ||
      state.festival !== previous.festival ||
      state.soundOn !== previous.soundOn ||
      state.selectedDate !== previous.selectedDate ||
      state.season !== previous.season ||
      state.festivalAuto !== previous.festivalAuto ||
      state.atmosphereEnabled !== previous.atmosphereEnabled ||
      state.floodLevel !== previous.floodLevel
    ) {
      applyEnvironment();
      render();
      if (atmosphere.rainVisible || lifeActive()) scheduleFrame();
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
    if (memoryTour || memoryFlight) {
      memoryTour = null;
      memoryFlight = null;
      controls.enabled = true;
      notifyMemory();
    }
    if (snapshot.packageEpoch !== lastPackageEpoch) {
      selectFeature(null);
      lastPackageEpoch = snapshot.packageEpoch;
    }
    if (snapshot.revision === lastWorldRevision) {
      applyEnvironment();
      render();
      return;
    }
    if (snapshot.mode === "private-error") {
      disposeWorld();
      atmosphere.update(
        { timeOfDayMinutes: 720, weather: "sunny", festival: "normal", atmosphereEnabled: false },
        false,
      );
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
    // Rebuilt bundles own new label/material program maps, not the disposed demo's cache.
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
      useAppStore.getState().setRidePaused(!useAppStore.getState().ridePaused);
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
    if (command.kind === "audio") {
      audio.gesture();
      void (async () => {
        try {
          if (command.manifest.size > 4096) throw Error("MANIFEST_TOO_LARGE");
          const manifest: unknown = JSON.parse(await command.manifest.text());
          const result = await audio.importFile(command.file, manifest);
          updateLifeStatus({ audio: result.ok ? "local" : "error" });
        } catch {
          updateLifeStatus({ audio: "error" });
        }
      })();
    }
  });
  const applyLink = (link: ReturnType<typeof parseMemoryHash>) => {
    if (!link.valid) {
      memoryLinkError = link.reason ?? "invalid";
      notifyMemory();
      return;
    }
    memoryLinkError = undefined;
    if (link.state?.time !== undefined) useAppStore.getState().setTimeOfDayMinutes(link.state.time);
    if (link.state?.pose) applyMemoryPose(link.state.pose);
    if (link.state?.id) {
      const memory = memorySessionSnapshot.memories.find(
        (candidate) => candidate.id === link.state?.id,
      );
      if (memory && (!memorySessionSnapshot.guest || memory.visibility === "public"))
        flyMemory(memory);
    }
  };
  const initialLink = parseMemoryHash(window.location.hash);
  const onHashChange = () => applyLink(parseMemoryHash(window.location.hash));
  window.addEventListener("hashchange", onHashChange);
  mountWorld();
  updateLayerVisibility();
  applyEnvironment();
  resize();
  atmosphere.warm(renderer, activeCamera);
  render();
  applyLink(initialLink);
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
    if (!worldRenderable() || document.hidden) return null;
    const captureStartedAt = performance.now();
    render();
    const image = canvas.toDataURL("image/png");
    host.dataset["captureLatencyMs"] = String(performance.now() - captureStartedAt);
    return image;
  });
  if (atmosphere.rainVisible || lifeActive()) scheduleFrame();

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
      unsubscribeMemorySession();
      unsubscribeMemoryBinding();
      bindPostcardCapture(null);
      memoryPins.dispose();
      unsubscribeWorld();
      unsubscribeConfidence();
      resizeObserver.disconnect();
      controls.removeEventListener("start", onControlStart);
      controls.removeEventListener("end", onControlEnd);
      controls.dispose();
      audio.dispose();
      resetLifeSession();
      window.removeEventListener("hashchange", onHashChange);
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
