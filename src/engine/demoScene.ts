import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { useAppStore } from "@/state/appStore";
import { DEMO_CONFIG } from "@/config/demo";
import { bindCapture } from "./capture";
import { createDemoAudio } from "./demoAudio";
import { createDemoLayout, daylightAt, seededRandom } from "./demoLayout";

type Shape = "box" | "cylinder" | "sphere";
interface Part {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  rx: number;
  ry: number;
  rz: number;
}

/** Geometry is authored procedurally from an invented layout; no real-world imagery or coordinates. */
export function createDemoScene(host: HTMLDivElement, marker: HTMLDivElement, onLost: () => void) {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("webgl2", { antialias: true, alpha: false });
  if (!context) throw new Error("WEBGL_UNAVAILABLE");
  const renderer = new THREE.WebGLRenderer({ canvas, context, antialias: true });
  host.appendChild(canvas);
  canvas.style.width = "100%";
  canvas.style.height = "100%";
  canvas.style.display = "block";
  canvas.style.touchAction = "none";
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1 : 1.25));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  const scene = new THREE.Scene();
  const sky = new THREE.Color("#eddfc8");
  scene.background = sky;
  const fog = new THREE.Fog("#eddfc8", 120, 260);
  scene.fog = fog;
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 500);
  const controls = new OrbitControls(camera, canvas);
  controls.enablePan = false;
  controls.enableDamping = false;
  controls.minPolarAngle = 0.3;
  controls.maxPolarAngle = Math.PI / 2 - 0.06;
  controls.minDistance = 18;
  controls.maxDistance = 230;
  controls.rotateSpeed = 0.6;
  controls.zoomSpeed = 0.75;
  const ambient = new THREE.HemisphereLight("#fff7e3", "#685d48", 2.1);
  scene.add(ambient);
  const sun = new THREE.DirectionalLight("#fff0cd", 3.4);
  sun.position.set(-30, 65, 30);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -80,
    right: 80,
    top: 75,
    bottom: -75,
    near: 1,
    far: 200,
  });
  sun.shadow.bias = -0.0007;
  sun.shadow.normalBias = 0.12;
  scene.add(sun);
  const geometries: Record<Shape, THREE.BufferGeometry> = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 8),
    sphere: new THREE.IcosahedronGeometry(0.5, 1),
  };
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const batches = new Map<
    string,
    { shape: Shape; material: THREE.MeshStandardMaterial; parts: Part[] }
  >();
  const lit = new THREE.MeshStandardMaterial({
    color: "#f5d89a",
    emissive: "#f9ba52",
    emissiveIntensity: 0,
    roughness: 0.7,
  });
  const lanternMat = new THREE.MeshStandardMaterial({
    color: "#c95e39",
    emissive: "#db6d2f",
    emissiveIntensity: 0.1,
    roughness: 0.65,
  });
  const nightMaterials = [lit, lanternMat];
  function material(color: string) {
    let m = materials.get(color);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness: 0.88 });
      materials.set(color, m);
    }
    return m;
  }
  function part(
    shape: Shape,
    color: string | THREE.MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) {
    const m = typeof color === "string" ? material(color) : color;
    const key = `${shape}:${m.uuid}`;
    let batch = batches.get(key);
    if (!batch) {
      batch = { shape, material: m, parts: [] };
      batches.set(key, batch);
    }
    batch.parts.push({ x, y, z, sx, sy, sz, rx, ry, rz });
  }
  const box = (
    color: string | THREE.MeshStandardMaterial,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    rx = 0,
    ry = 0,
    rz = 0,
  ) => part("box", color, x, y, z, sx, sy, sz, rx, ry, rz);
  const random = seededRandom(DEMO_CONFIG.seed);
  const green = ["#3e6551", "#587a55", "#6d8a5d"];
  function plant(x: number, y: number, z: number, size = 0.55) {
    part("cylinder", "#aa7252", x, y + size * 0.35, z, size * 0.65, size * 0.7, size * 0.65);
    part(
      "sphere",
      green[Math.floor(random() * green.length)]!,
      x,
      y + size,
      z,
      size,
      size * 1.2,
      size,
    );
  }
  function tree(x: number, z: number, size = 1) {
    part("cylinder", "#83634b", x, 2.2 * size, z, 0.5 * size, 4.4 * size, 0.5 * size);
    for (const [dx, dy, dz, s] of [
      [0, 5.2, 0, 4.4],
      [-1, 4.4, 0.7, 3.2],
      [1.1, 4.5, -0.5, 3.4],
    ]) {
      part(
        "sphere",
        green[Math.floor(random() * green.length)]!,
        x + dx! * size,
        dy! * size,
        z + dz! * size,
        s! * size,
        s! * size,
        s! * size,
      );
    }
  }
  box("#bdab8c", 0, -1.1, -3, 124, 2, 94);
  box("#cfc5ab", 0, -0.03, -3, 122, 0.2, 92);
  for (const z of [12, -21]) {
    box("#666d67", 0, 0.12, z, 121.8, 0.1, 10);
    for (const edge of [-6.2, 6.2]) box("#ded5bc", 0, 0.22, z + edge, 121.8, 0.34, 2.4);
    for (let x = -57; x <= 57; x += 7) box("#d6d0b5", x, 0.185, z, 2.4, 0.015, 0.15);
    for (let x = -42; x <= 42; x += 84)
      for (let stripe = -3; stripe <= 3; stripe++)
        box("#ede5ce", x, 0.185, z + stripe, 2.6, 0.015, 0.48);
  }
  for (const x of [-33, 33]) box("#7a8074", x, 0.13, -3, 6, 0.12, 91.8);
  for (const b of createDemoLayout(DEMO_CONFIG.seed)) {
    const height = b.floors * 3.2;
    box(b.color, b.x, height / 2 + 0.3, b.z, b.width, height, b.depth);
    box("#e9ddc2", b.x, 0.36, b.z, b.width + 0.16, 0.3, b.depth + 0.1);
    const front = b.z + b.front * (b.depth / 2 + 0.04);
    box("#4e6862", b.x, 1.65, front, b.width - 0.85, 2.35, 0.18);
    if (b.shop) {
      box(
        ["#a85d3f", "#447465", "#c9a35d"][Math.floor(random() * 3)]!,
        b.x,
        2.95,
        front + b.front * 0.38,
        b.width + 0.1,
        0.2,
        1.45,
        b.front * 0.09,
      );
      box("#efe3cc", b.x, 2.6, front + b.front * 0.13, b.width - 0.4, 0.45, 0.15);
      for (let shutter = -2; shutter <= 2; shutter++)
        box("#677f70", b.x + shutter * 0.8, 1.65, front + b.front * 0.11, 0.06, 2.15, 0.08);
    }
    for (let level = 1; level < b.floors; level++) {
      const y = level * 3.2;
      for (const side of [-1.25, 1.25]) {
        box("#465a56", b.x + side, y + 1.65, front, 1.25, 1.6, 0.18);
        box(lit, b.x + side, y + 1.65, front + b.front * 0.1, 1.0, 1.3, 0.08);
        box("#e8dcca", b.x + side, y + 1.65, front + b.front * 0.15, 0.06, 1.6, 0.04);
      }
      box("#eddfc4", b.x, y + 0.05, front + b.front * 0.48, b.width + 0.1, 0.18, 1.3);
      box("#526b60", b.x, y + 0.95, front + b.front * 1.08, b.width - 0.3, 0.08, 0.08);
      for (let railing = -2; railing <= 2; railing++)
        box("#526b60", b.x + railing, y + 0.5, front + b.front * 1.08, 0.05, 0.9, 0.05);
      plant(b.x - 1.8, y + 0.18, front + b.front * 0.6, 0.45);
    }
    box("#bba98c", b.x, height + 0.32, b.z, b.width + 0.35, 0.3, b.depth + 0.3);
    for (const side of [-1, 1])
      box(b.color, b.x + side * (b.width / 2 - 0.1), height + 0.65, b.z, 0.2, 0.6, b.depth);
    part("cylinder", "#98a9a4", b.x + 1.25, height + 1.25, b.z - 1.7, 1.35, 1.35, 1.35);
    box("#526967", b.x - 0.9, height + 0.6, b.z - 1.4, 1.7, 0.16, 1.35, -0.15);
    if (random() > 0.55) {
      box("#819b88", b.x, height + 1.2, b.z + 2, b.width - 0.6, 0.18, 2.4, 0.1);
      box("#62695a", b.x - 2, height + 0.7, b.z + 2.7, 0.06, 1.2, 0.06);
      box("#62695a", b.x + 2, height + 0.7, b.z + 2.7, 0.06, 1.2, 0.06);
    }
    plant(b.x - 1.5, height + 0.5, b.z + 0.8, 0.7);
    plant(b.x + 1.1, 0.4, front + b.front * 0.8, 0.65);
  }
  // The origin is an EMPTY plot: no old house, construction scene or real-world sign.
  box("#c4b899", 0, 0.18, 0, 5.8, 0.18, 8.8);
  for (const x of [-2.9, 2.9]) box("#af7553", x, 0.34, 0, 0.1, 0.3, 8.8);
  box("#af7553", 0, 0.34, -4.4, 5.8, 0.3, 0.1);
  for (const x of [-2.9, 2.9])
    for (const z of [-4.4, 4.4]) box("#a76c4f", x, 0.75, z, 0.16, 1.1, 0.16);
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(0.6, 0.72, 32),
    new THREE.MeshBasicMaterial({ color: "#b87045", side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.29, 0);
  scene.add(ring);
  for (const x of [-48, -18, 18, 48])
    for (const z of [6, 18, -27]) tree(x, z, 0.7 + random() * 0.25);
  box("#9ca681", -45, 0.2, 35, 23, 0.3, 10);
  for (let x = -53; x <= -37; x += 8) {
    tree(x, 36);
    box("#8c6a4f", x + 2.5, 0.65, 32, 2.2, 0.18, 0.7);
    box("#8c6a4f", x + 2.5, 1.05, 32.35, 2.2, 0.6, 0.12);
  }
  const festivalGroup = new THREE.Group();
  scene.add(festivalGroup);
  for (let x = -24; x <= 24; x += 6) {
    const lantern = new THREE.Mesh(geometries.sphere, lanternMat);
    lantern.scale.set(0.8, 1, 0.8);
    lantern.position.set(x, 5.5, 12);
    festivalGroup.add(lantern);
  }
  const wireGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(-28, 6.5, 12),
    new THREE.Vector3(0, 5.6, 12),
    new THREE.Vector3(28, 6.5, 12),
  ]);
  festivalGroup.add(new THREE.Line(wireGeo, new THREE.LineBasicMaterial({ color: "#565f51" })));
  for (const x of [-27, 27]) box("#596655", x, 3.3, 12, 0.12, 6.6, 0.12);
  for (const x of [-54, -24, 24, 54])
    for (const z of [6.5, -26.5]) {
      part("cylinder", "#4d6358", x, 3.1, z, 0.14, 6, 0.14);
      box("#4d6358", x + 0.55, 6.1, z, 1.15, 0.1, 0.12);
      part("sphere", lit, x + 1.1, 5.9, z, 0.4, 0.28, 0.4);
    }
  for (let i = 0; i < 16; i++) {
    const x = -53 + random() * 106,
      z = (i % 2 ? 6 : 18) + random() * 0.5;
    part("cylinder", ["#b87152", "#567976", "#dabd76"][i % 3]!, x, 1, z, 0.4, 0.9, 0.4);
    part("sphere", "#bf9777", x, 1.65, z, 0.4, 0.4, 0.4);
    box("#45574e", x - 0.1, 0.38, z, 0.1, 0.55, 0.13);
    box("#45574e", x + 0.1, 0.38, z, 0.1, 0.55, 0.13);
  }
  const dummy = new THREE.Object3D();
  for (const batch of batches.values()) {
    const mesh = new THREE.InstancedMesh(
      geometries[batch.shape],
      batch.material,
      batch.parts.length,
    );
    for (let i = 0; i < batch.parts.length; i++) {
      const p = batch.parts[i]!;
      dummy.position.set(p.x, p.y, p.z);
      dummy.scale.set(p.sx, p.sy, p.sz);
      dummy.rotation.set(p.rx, p.ry, p.rz);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    }
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    scene.add(mesh);
  }
  const scooters: THREE.Group[] = [];
  const scooterMats = [material("#a6573e"), material("#3e6c68"), material("#d2ae66")];
  for (let i = 0; i < 8; i++) {
    const group = new THREE.Group();
    const body = new THREE.Mesh(geometries.box, scooterMats[i % 3]);
    body.scale.set(1.3, 0.45, 0.55);
    body.position.y = 0.6;
    group.add(body);
    for (const x of [-0.5, 0.5]) {
      const wheel = new THREE.Mesh(geometries.cylinder, material("#37473d"));
      wheel.rotation.x = Math.PI / 2;
      wheel.scale.set(0.45, 0.14, 0.45);
      wheel.position.set(x, 0.33, 0);
      group.add(wheel);
    }
    const rider = new THREE.Mesh(geometries.cylinder, scooterMats[(i + 1) % 3]);
    rider.scale.set(0.35, 0.7, 0.35);
    rider.position.set(0, 1.1, 0);
    group.add(rider);
    const helmet = new THREE.Mesh(geometries.sphere, material("#ece1c7"));
    helmet.scale.set(0.4, 0.4, 0.4);
    helmet.position.set(0.05, 1.65, 0);
    group.add(helmet);
    scene.add(group);
    scooters.push(group);
  }
  const dropCount = window.innerWidth < 768 ? 250 : 450;
  const rainArray = new Float32Array(dropCount * 6);
  for (let i = 0; i < dropCount; i++) {
    const index = i * 6;
    rainArray[index] = random() * 120 - 60;
    rainArray[index + 1] = random() * 28;
    rainArray[index + 2] = random() * 90 - 45;
    rainArray[index + 3] = rainArray[index]! + 0.16;
    rainArray[index + 4] = rainArray[index + 1]! + 0.8;
    rainArray[index + 5] = rainArray[index + 2]!;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainArray, 3));
  const rainMat = new THREE.LineBasicMaterial({
    color: "#d3e0df",
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const rain = new THREE.LineSegments(rainGeo, rainMat);
  rain.frustumCulled = false;
  scene.add(rain);
  const audio = createDemoAudio();
  const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let applying = false,
    disposed = false,
    frame = 0,
    lastFrame = 0,
    elapsed = 0;
  const projected = new THREE.Vector3();
  const nightSky = new THREE.Color("#182e39"),
    daySky = new THREE.Color("#eee0c9"),
    overcastSky = new THREE.Color("#aebdc0");
  function applyCamera() {
    const state = useAppStore.getState();
    const theta = THREE.MathUtils.degToRad(state.heading);
    const walk = state.viewMode === "walk";
    controls.minDistance = walk ? 4 : 18;
    controls.maxDistance = walk ? 50 : 344;
    const distance = walk ? 15 / Math.sqrt(state.zoom) : 112 / state.zoom;
    const height = walk ? 2.5 : distance * 0.64;
    const radius = walk ? distance : distance * 0.77;
    applying = true;
    controls.target.set(0, walk ? 1.6 : 1, 0);
    camera.position.set(Math.sin(theta) * radius, height, Math.cos(theta) * radius);
    controls.update();
    applying = false;
  }
  function applyEnvironment() {
    const state = useAppStore.getState();
    const daylight = daylightAt(state.timeOfDayMinutes);
    const wet = state.weather === "rain" || state.weather === "storm";
    const cloudy = state.weather !== "sunny";
    sky.copy(nightSky).lerp(cloudy ? overcastSky : daySky, Math.min(1, daylight * 3));
    sky.multiplyScalar(1.5);
    fog.color.copy(sky);
    ambient.intensity = 1.05 + daylight * (cloudy ? 1.7 : 2.3);
    sun.intensity = daylight * (cloudy ? 0.65 : 3.4);
    sun.position.set(-45 + (state.timeOfDayMinutes / 1440) * 90, 20 + daylight * 65, 28);
    const night = Math.max(0, 1 - daylight * 4);
    lit.color.set(night > 0.1 ? "#f5d89a" : "#6d918d");
    lit.emissiveIntensity = 1.9 * night;
    lanternMat.emissiveIntensity = 0.1 + 1.4 * night;
    festivalGroup.visible = state.festival !== "normal";
    lanternMat.color.set(state.festival === "tet" ? "#bc4936" : "#e7b25d");
    rain.visible = wet;
    rainMat.opacity = state.weather === "storm" ? 0.75 : 0.45;
    const road = materials.get("#666d67");
    if (road) {
      road.roughness = wet ? 0.32 : 0.9;
      road.color.set(wet ? "#485e5d" : "#666d67");
    }
    audio.set(state.soundOn && !document.hidden, wet);
    host.dataset["weather"] = state.weather;
    host.dataset["festival"] = state.festival;
    host.dataset["night"] = String(daylight < 0.1);
  }
  function render() {
    if (disposed || document.hidden) return;
    renderer.render(scene, camera);
    projected.set(0, 0.35, 0).project(camera);
    marker.style.transform = `translate(-50%, -100%) translate(${(projected.x * 0.5 + 0.5) * host.clientWidth}px, ${(-projected.y * 0.5 + 0.5) * host.clientHeight - 10}px)`;
    marker.style.visibility =
      Math.abs(projected.x) < 0.88 && Math.abs(projected.y) < 0.9 && projected.z < 1
        ? "visible"
        : "hidden";
    host.dataset["drawCalls"] = String(renderer.info.render.calls);
    host.dataset["triangles"] = String(renderer.info.render.triangles);
  }
  function moveActors(delta: number) {
    if (!motion.matches) elapsed += delta;
    scooters.forEach((scooter, i) => {
      const direction = i % 2 ? 1 : -1;
      scooter.position.set(
        (((i * 17 + elapsed * (2.5 + i * 0.12)) % 112) - 56) * direction,
        0.15,
        (i < 4 ? 12 : -21) + direction * 2.2,
      );
      scooter.rotation.y = direction === 1 ? 0 : Math.PI;
    });
    if (rain.visible && !motion.matches) {
      for (let i = 0; i < dropCount; i++) {
        const index = i * 6;
        rainArray[index + 1] = (rainArray[index + 1]! - delta * 15 + 28) % 28;
        rainArray[index + 4] = rainArray[index + 1]! + 0.8;
      }
      rainGeo.attributes["position"]!.needsUpdate = true;
    }
  }
  function tick(now: number) {
    if (disposed || document.hidden) return;
    if (motion.matches) {
      moveActors(0);
      render();
      return;
    }
    frame = requestAnimationFrame(tick);
    const interval = window.innerWidth < 768 ? 1000 / 30 : 1000 / 60;
    if (now - lastFrame < interval) return;
    const delta = lastFrame ? Math.min((now - lastFrame) / 1000, 0.08) : 0;
    lastFrame = now;
    moveActors(delta);
    render();
  }
  let lastWidth = 0,
    lastHeight = 0;
  function resize() {
    const width = host.clientWidth,
      height = host.clientHeight;
    if (!width || !height || disposed || (width === lastWidth && height === lastHeight)) return;
    lastWidth = width;
    lastHeight = height;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
    render();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  function onControlChange() {
    if (applying || disposed) return;
    const state = useAppStore.getState();
    applying = true;
    const direction = (Math.atan2(camera.position.x, camera.position.z) * 180) / Math.PI;
    state.setHeading(direction);
    if (state.viewMode !== "walk")
      useAppStore.setState({
        zoom: THREE.MathUtils.clamp(112 / camera.position.distanceTo(controls.target), 0.25, 4),
      });
    applying = false;
    render();
  }
  controls.addEventListener("change", onControlChange);
  const unsubscribe = useAppStore.subscribe((state, previous) => {
    if (disposed || applying) return;
    let dirty = false;
    if (
      state.heading !== previous.heading ||
      state.zoom !== previous.zoom ||
      state.viewMode !== previous.viewMode ||
      state.viewReset !== previous.viewReset
    ) {
      applyCamera();
      dirty = true;
    }
    if (
      state.weather !== previous.weather ||
      state.timeOfDayMinutes !== previous.timeOfDayMinutes ||
      state.festival !== previous.festival ||
      state.soundOn !== previous.soundOn
    ) {
      applyEnvironment();
      dirty = true;
    }
    if (dirty) render();
  });
  function onVisibility() {
    cancelAnimationFrame(frame);
    lastFrame = 0;
    const state = useAppStore.getState();
    audio.set(state.soundOn && !document.hidden, rain.visible);
    if (!document.hidden && !disposed) frame = requestAnimationFrame(tick);
  }
  function onMotion() {
    cancelAnimationFrame(frame);
    lastFrame = 0;
    moveActors(0);
    render();
    if (!motion.matches && !document.hidden && !disposed) frame = requestAnimationFrame(tick);
  }
  motion.addEventListener("change", onMotion);
  function onKey(event: KeyboardEvent) {
    if (event.target !== canvas) return;
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
  canvas.tabIndex = 0;
  canvas.setAttribute("role", "application");
  canvas.addEventListener("keydown", onKey);
  function lost(event: Event) {
    event.preventDefault();
    bindCapture(null);
    onLost();
  }
  canvas.addEventListener("webglcontextlost", lost);
  document.addEventListener("visibilitychange", onVisibility);
  applyCamera();
  applyEnvironment();
  moveActors(0);
  resize();
  renderer.compile(scene, camera);
  render();
  bindCapture(() => {
    render();
    return canvas.toDataURL("image/png");
  });
  frame = requestAnimationFrame(tick);
  return {
    setLabel(label: string) {
      canvas.setAttribute("aria-label", label);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      bindCapture(null);
      cancelAnimationFrame(frame);
      unsubscribe();
      resizeObserver.disconnect();
      audio.dispose();
      controls.dispose();
      motion.removeEventListener("change", onMotion);
      document.removeEventListener("visibilitychange", onVisibility);
      canvas.removeEventListener("keydown", onKey);
      canvas.removeEventListener("webglcontextlost", lost);
      scene.traverse((object) => {
        if (object instanceof THREE.InstancedMesh) object.dispose();
      });
      for (const geometry of Object.values(geometries)) geometry.dispose();
      for (const m of materials.values()) m.dispose();
      nightMaterials.forEach((m) => m.dispose());
      ring.geometry.dispose();
      (ring.material as THREE.Material).dispose();
      wireGeo.dispose();
      festivalGroup.children.forEach((child) => {
        if (child instanceof THREE.Line) (child.material as THREE.Material).dispose();
      });
      rainGeo.dispose();
      rainMat.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      canvas.remove();
    },
  };
}
