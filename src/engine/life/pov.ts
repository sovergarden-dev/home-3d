import { pointInPolygon, polygonsOf } from "@/world/geometry";
import type { Position2 } from "@/world/schema";
import * as THREE from "three";
import type { WorldData } from "@/world/schema";
import { buildLifeGraph, type LifeEdge } from "./graph";
import {
  buildCollisionBvh,
  resolveMovement,
  type CollisionBvh,
  type CollisionBox,
  type DynamicObstacles,
} from "./collision";
import {
  createOrientationController,
  type OrientationController,
  type OrientationSample,
} from "./orientation";

export type PovMode = "walk" | "ride" | null;
export interface PovControllerOptions {
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  world: WorldData;
  orbitTarget?: THREE.Vector3;
  obstacles?: CollisionBox[];
  dynamicObstacles?: DynamicObstacles;
  eyeHeight?: number;
  reducedMotion?: boolean;
  onStateChange?: (mode: PovMode) => void;
}
export interface PovDiagnostics {
  mode: PovMode;
  paused: boolean;
  position: { x: number; y: number; z: number };
  velocity: { x: number; z: number };
  collisions: number;
  orientation: "supported" | "unsupported";
  rideLabel: string | null;
  rideEnded: boolean;
  bvhSegments: number;
}
export interface PovController {
  setMode(mode: PovMode): void;
  update(dt: number): void;
  move(intent: { x: number; z: number }): void;
  look(input: { yaw?: number; pitch?: number; dx?: number; dy?: number }): void;
  pause(value?: boolean): void;
  orientation(sample: OrientationSample): void;
  requestOrientationPermission(): Promise<"granted" | "denied" | "unsupported">;
  setObstacles(obstacles: CollisionBox[]): void;
  diagnostics(): PovDiagnostics;
  dispose(): void;
}

const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
interface RouteSegment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  length: number;
}

export function buildPovRoute(world: WorldData): RouteSegment[] {
  const graph = buildLifeGraph(world);
  if (!graph.enabled) return [];
  const solids = world.buildings
    .filter((b) => !b.hidden)
    .flatMap((b) => [b.geometry, ...(b.parts ?? []).map((p) => p.geometry)])
    .concat(world.lots.map((l) => l.geometry))
    .flatMap(polygonsOf);
  const probe: Position2 = [0, 0];
  const safe = new Uint8Array(graph.edges.length).fill(1);
  for (const edge of graph.edges) {
    for (let i = 2; i < edge.points.length && safe[edge.id]; i += 2) {
      const ax = edge.points[i - 2]!,
        az = edge.points[i - 1]!,
        bx = edge.points[i]!,
        bz = edge.points[i + 1]!;
      const steps = Math.ceil(Math.hypot(bx - ax, bz - az) / 0.5);
      for (let j = 0; j <= steps && safe[edge.id]; j++) {
        const x = ax + ((bx - ax) * j) / steps,
          z = az + ((bz - az) * j) / steps;
        for (const [dx, dz] of [
          [0, 0],
          [0.36, 0],
          [-0.36, 0],
          [0, 0.36],
          [0, -0.36],
        ]) {
          probe[0] = x + dx!;
          probe[1] = z + dz!;
          if (solids.some((p) => pointInPolygon(probe, p))) {
            safe[edge.id] = 0;
            break;
          }
        }
      }
    }
  }
  // Pick the closest usable road node to the package's fixed local centre, never an external destination.
  let start = -1;
  for (const node of graph.nodes) {
    if (
      !graph.edges.some(
        (e) =>
          safe[e.id] &&
          ((e.from === node.id && e.direction !== "reverse") ||
            (e.to === node.id && e.direction !== "forward")),
      )
    )
      continue;
    if (
      start < 0 ||
      Math.hypot(node.x, node.z) < Math.hypot(graph.nodes[start]!.x, graph.nodes[start]!.z)
    )
      start = node.id;
  }
  if (start < 0) return [];
  const distances = new Float64Array(graph.nodes.length).fill(Infinity);
  const visited = new Uint8Array(graph.nodes.length);
  const previous = new Int32Array(graph.nodes.length).fill(-1);
  const previousEdge = new Int32Array(graph.nodes.length).fill(-1);
  distances[start] = 0;
  for (let n = 0; n < graph.nodes.length; n++) {
    let node = -1;
    for (let i = 0; i < distances.length; i++)
      if (
        !visited[i] &&
        Number.isFinite(distances[i]) &&
        (node === -1 || distances[i]! < distances[node]!)
      )
        node = i;
    if (node < 0) break;
    visited[node] = 1;
    for (let i = 0; i < graph.edges.length; i++) {
      const edge = graph.edges[i]!;
      const forward = edge.from === node && edge.direction !== "reverse";
      const reverse = edge.to === node && edge.direction !== "forward";
      if ((!forward && !reverse) || !safe[i]) continue;
      const target = forward ? edge.to : edge.from;
      const d = distances[node]! + edge.length;
      if (d < distances[target]!) {
        distances[target] = d;
        previous[target] = node;
        previousEdge[target] = i;
      }
    }
  }
  let target = start;
  for (let i = 0; i < distances.length; i++)
    if (Number.isFinite(distances[i]) && distances[i]! > distances[target]!) target = i;
  const path: { edge: LifeEdge; forward: boolean }[] = [];
  while (target !== start && previous[target]! >= 0) {
    const edge = graph.edges[previousEdge[target]!]!;
    path.push({ edge, forward: edge.to === target });
    target = previous[target]!;
  }
  path.reverse();
  const result: RouteSegment[] = [];
  for (const part of path) {
    const p = part.edge.points;
    const step = part.forward ? 2 : -2;
    for (
      let i = part.forward ? 0 : p.length - 2;
      part.forward ? i + 2 < p.length : i - 2 >= 0;
      i += step
    ) {
      const j = i + step;
      const ax = p[i]!,
        az = p[i + 1]!,
        bx = p[j]!,
        bz = p[j + 1]!;
      const length = Math.hypot(bx - ax, bz - az);
      if (Number.isFinite(length) && length > 0.01) result.push({ ax, az, bx, bz, length });
    }
  }
  return result;
}

export function createPovController(options: PovControllerOptions): PovController {
  const { camera, canvas, world } = options;
  const eye = options.eyeHeight ?? 1.6;
  const radius = 0.35;
  const reduced = options.reducedMotion ?? false;
  let bvh: CollisionBvh = buildCollisionBvh(world, options.obstacles ?? []);
  const route = buildPovRoute(world);
  let mode: PovMode = null,
    paused = false,
    disposed = false,
    collisionCount = 0;
  let inputX = 0,
    inputZ = 0,
    velocityX = 0,
    velocityZ = 0;
  let yaw = 0,
    pitch = 0,
    rideLookYaw = 0,
    rideLookPitch = 0;
  let rideIndex = 0,
    rideDistance = 0,
    rideSpeed = 0,
    rideLabel: string | null = null,
    rideEnded = false;
  const savedPosition = new THREE.Vector3();
  const savedQuaternion = new THREE.Quaternion();
  const savedTarget = options.orbitTarget?.clone() ?? null;
  const orient: OrientationController = createOrientationController((sample) =>
    applyOrientation(sample),
  );
  const keys = new Set<string>();
  let dragging = false;
  let pointerId: number | null = null;
  let lastX = 0,
    lastY = 0;
  const syncAngles = () => {
    const e = new THREE.Euler().setFromQuaternion(camera.quaternion, "YXZ");
    yaw = e.y;
    pitch = e.x;
  };
  const poseEuler = new THREE.Euler(0, 0, 0, "YXZ");
  const applyPose = () => {
    camera.position.y = eye;
    poseEuler.set(pitch, yaw, 0, "YXZ");
    camera.quaternion.setFromEuler(poseEuler);
  };
  function applyOrientation(sample: OrientationSample) {
    if (!mode) return;
    const deltaYaw = (sample.gamma ?? 0) * 0.002;
    const deltaPitch = (sample.beta - 45) * 0.0003;
    if (mode === "ride") {
      rideLookYaw += deltaYaw;
      rideLookPitch = clamp(rideLookPitch + deltaPitch, -1.35, 1.35);
    } else {
      yaw += deltaYaw;
      pitch = clamp(pitch + deltaPitch, -1.35, 1.35);
    }
  }
  const clearKeys = () => {
    keys.clear();
    inputX = 0;
    inputZ = 0;
  };
  const releasePointer = () => {
    dragging = false;
    pointerId = null;
    if (typeof document !== "undefined" && document.pointerLockElement === canvas)
      document.exitPointerLock?.();
  };
  function enter(next: PovMode) {
    if (next === mode) return;
    if (next === null) {
      if (mode !== null) {
        camera.position.copy(savedPosition);
        camera.quaternion.copy(savedQuaternion);
        if (savedTarget && options.orbitTarget) options.orbitTarget.copy(savedTarget);
      }
      mode = null;
      paused = false;
      velocityX = 0;
      velocityZ = 0;
      rideSpeed = 0;
      clearKeys();
      rideLabel = null;
      releasePointer();
      orient.stop();
      options.onStateChange?.(null);
      return;
    }
    if (mode === null) {
      savedPosition.copy(camera.position);
      savedQuaternion.copy(camera.quaternion);
      syncAngles();
      if (options.orbitTarget) savedTarget?.copy(options.orbitTarget);
    }
    mode = next;
    paused = false;
    camera.position.y = eye;
    if (next === "walk" && route[0]) {
      camera.position.x = route[0].ax;
      camera.position.z = route[0].az;
      yaw = Math.atan2(-(route[0].bx - route[0].ax), -(route[0].bz - route[0].az));
      pitch = 0;
      applyPose();
    }
    options.onStateChange?.(mode);
    if (next === "ride") {
      rideIndex = 0;
      rideDistance = 0;
      rideSpeed = 0;
      rideLookYaw = 0;
      rideLookPitch = 0;
      rideEnded = route.length === 0;
      rideLabel = rideEnded ? null : "Connected road route";
      if (!rideEnded) {
        camera.position.x = route[0]!.ax;
        camera.position.z = route[0]!.az;
      }
      applyPose();
    }
  }
  function move(value: { x: number; z: number }) {
    if (!Number.isFinite(value.x) || !Number.isFinite(value.z)) return;
    const length = Math.hypot(value.x, value.z);
    inputX = length > 1 ? value.x / length : value.x;
    inputZ = length > 1 ? value.z / length : value.z;
  }
  function look(value: { yaw?: number; pitch?: number; dx?: number; dy?: number }) {
    if (value.yaw !== undefined) yaw = value.yaw;
    if (value.pitch !== undefined) pitch = clamp(value.pitch, -1.35, 1.35);
    if (value.dx !== undefined) {
      yaw -= value.dx * 0.002;
      if (mode === "ride") rideLookYaw -= value.dx * 0.002;
    }
    if (value.dy !== undefined) {
      pitch = clamp(pitch - value.dy * 0.002, -1.35, 1.35);
      if (mode === "ride") rideLookPitch = clamp(rideLookPitch - value.dy * 0.002, -1.35, 1.35);
    }
    if (mode) applyPose();
  }
  const collisionFrom = { x: 0, z: 0 };
  const collisionDelta = { x: 0, z: 0 };
  const collisionResult = { position: { x: 0, z: 0 }, collisions: 0 };
  function update(dt: number) {
    if (disposed || !mode || paused) return;
    const elapsed = clamp(Number.isFinite(dt) ? dt : 0, 0, 0.1);
    if (mode === "ride") {
      if (rideEnded) {
        rideSpeed = Math.max(0, rideSpeed - 8 * elapsed);
        return;
      }
      const targetSpeed = reduced ? 3 : 4;
      rideSpeed += (targetSpeed - rideSpeed) * Math.min(1, (reduced ? 10 : 5) * elapsed);
      let distance = rideSpeed * elapsed;
      while (distance > 0 && rideIndex < route.length) {
        const segment = route[rideIndex]!;
        const remaining = segment.length - rideDistance;
        const step = Math.min(distance, remaining);
        const nextDistance = rideDistance + step;
        distance -= step;
        const t = nextDistance / segment.length;
        const x = segment.ax + (segment.bx - segment.ax) * t;
        const z = segment.az + (segment.bz - segment.az) * t;
        collisionFrom.x = camera.position.x;
        collisionFrom.z = camera.position.z;
        collisionDelta.x = x - camera.position.x;
        collisionDelta.z = z - camera.position.z;
        const resolved = resolveMovement(
          bvh,
          collisionFrom,
          collisionDelta,
          radius,
          options.dynamicObstacles,
          collisionResult,
        );
        camera.position.x = resolved.position.x;
        camera.position.z = resolved.position.z;
        collisionCount += resolved.collisions;
        if (Math.hypot(camera.position.x - x, camera.position.z - z) > 0.04) {
          // Do not consume route distance or teleport ahead while a vehicle/wall blocks the ride.
          rideSpeed = 0;
          distance = 0;
          break;
        }
        rideDistance = nextDistance;
        if (rideDistance >= segment.length - 1e-5) {
          rideIndex++;
          rideDistance = 0;
        }
      }
      if (rideIndex >= route.length) {
        rideEnded = true;
        rideSpeed = 0;
      }
      if (rideIndex < route.length) {
        const segment = route[rideIndex]!;
        yaw = Math.atan2(-(segment.bx - segment.ax), -(segment.bz - segment.az)) + rideLookYaw;
        pitch = clamp(rideLookPitch, -1.35, 1.35);
      }
      camera.position.y = eye;
      applyPose();
      return;
    }
    const forwardX = -Math.sin(yaw),
      forwardZ = -Math.cos(yaw),
      rightX = Math.cos(yaw),
      rightZ = -Math.sin(yaw);
    const wantX = (rightX * inputX + forwardX * inputZ) * 3.2,
      wantZ = (rightZ * inputX + forwardZ * inputZ) * 3.2;
    const rate = reduced ? 18 : 10;
    velocityX += (wantX - velocityX) * Math.min(1, rate * elapsed);
    velocityZ += (wantZ - velocityZ) * Math.min(1, rate * elapsed);
    if (Math.hypot(inputX, inputZ) < 0.001) {
      const damping = Math.exp(-rate * elapsed);
      velocityX *= damping;
      velocityZ *= damping;
    }
    collisionFrom.x = camera.position.x;
    collisionFrom.z = camera.position.z;
    collisionDelta.x = velocityX * elapsed;
    collisionDelta.z = velocityZ * elapsed;
    const result = resolveMovement(
      bvh,
      collisionFrom,
      collisionDelta,
      radius,
      options.dynamicObstacles,
      collisionResult,
    );
    camera.position.x = result.position.x;
    camera.position.z = result.position.z;
    collisionCount += result.collisions;
    applyPose();
  }
  const isEditable = (target: EventTarget | null) => {
    const element = target as HTMLElement | null;
    return Boolean(
      element &&
      (element.isContentEditable || /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(element.tagName)),
    );
  };
  const keyDown = (event: KeyboardEvent) => {
    if (!mode) return;
    const key = event.key.toLowerCase();
    if (key === "escape") {
      event.preventDefault();
      enter(null);
      return;
    }
    if (isEditable(event.target)) return;
    if (!["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key))
      return;
    event.preventDefault();
    keys.add(key);
    move({
      x:
        (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
        (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
      z:
        (keys.has("w") || keys.has("arrowup") ? 1 : 0) -
        (keys.has("s") || keys.has("arrowdown") ? 1 : 0),
    });
  };
  const keyUp = (event: KeyboardEvent) => {
    const key = event.key.toLowerCase();
    keys.delete(key);
    if (!mode || isEditable(event.target)) return;
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(key)) {
      event.preventDefault();
      move({
        x:
          (keys.has("d") || keys.has("arrowright") ? 1 : 0) -
          (keys.has("a") || keys.has("arrowleft") ? 1 : 0),
        z:
          (keys.has("w") || keys.has("arrowup") ? 1 : 0) -
          (keys.has("s") || keys.has("arrowdown") ? 1 : 0),
      });
    }
  };
  const pointerDown = (event: PointerEvent) => {
    if (!mode) return;
    dragging = true;
    pointerId = event.pointerId;
    lastX = event.clientX;
    lastY = event.clientY;
    canvas.setPointerCapture?.(event.pointerId);
  };
  const pointerMove = (event: PointerEvent) => {
    const locked = typeof document !== "undefined" && document.pointerLockElement === canvas;
    if ((!dragging && !locked) || !mode) return;
    look({
      dx: locked ? event.movementX : event.clientX - lastX,
      dy: locked ? event.movementY : event.clientY - lastY,
    });
    lastX = event.clientX;
    lastY = event.clientY;
  };
  const pointerUp = (event?: PointerEvent) => {
    if (pointerId !== null && event && event.pointerId !== pointerId) return;
    if (pointerId !== null && canvas.hasPointerCapture?.(pointerId))
      canvas.releasePointerCapture(pointerId);
    dragging = false;
    pointerId = null;
  };
  const blur = () => {
    clearKeys();
    releasePointer();
  };
  const pointerLockChange = () => {
    if (typeof document !== "undefined" && document.pointerLockElement !== canvas) dragging = false;
  };
  canvas.addEventListener("pointerdown", pointerDown);
  canvas.addEventListener("pointermove", pointerMove);
  canvas.addEventListener("pointerup", pointerUp);
  canvas.addEventListener("pointercancel", pointerUp);
  canvas.addEventListener("lostpointercapture", pointerUp);
  if (typeof window !== "undefined") {
    window.addEventListener("keydown", keyDown);
    window.addEventListener("keyup", keyUp);
    window.addEventListener("blur", blur);
  }
  if (typeof document !== "undefined") {
    document.addEventListener("pointerlockchange", pointerLockChange);
  }
  const snapshot: PovDiagnostics = {
    mode: null,
    paused: false,
    position: { x: 0, y: eye, z: 0 },
    velocity: { x: 0, z: 0 },
    collisions: 0,
    orientation: orient.supported ? "supported" : "unsupported",
    rideLabel: null,
    rideEnded: false,
    bvhSegments: bvh.segmentCount,
  };
  return {
    setMode: enter,
    update,
    move,
    look,
    pause(value = true) {
      paused = value;
    },
    orientation: applyOrientation,
    requestOrientationPermission: orient.start,
    setObstacles(value) {
      bvh = buildCollisionBvh(world, value);
    },
    diagnostics() {
      snapshot.mode = mode;
      snapshot.paused = paused;
      snapshot.position.x = camera.position.x;
      snapshot.position.y = camera.position.y;
      snapshot.position.z = camera.position.z;
      snapshot.velocity.x = velocityX;
      snapshot.velocity.z = velocityZ;
      snapshot.collisions = collisionCount;
      snapshot.rideLabel = rideLabel;
      snapshot.rideEnded = rideEnded;
      snapshot.bvhSegments = bvh.segmentCount;
      return snapshot;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      enter(null);
      orient.dispose();
      canvas.removeEventListener("pointerdown", pointerDown);
      canvas.removeEventListener("pointermove", pointerMove);
      canvas.removeEventListener("pointerup", pointerUp);
      canvas.removeEventListener("pointercancel", pointerUp);
      canvas.removeEventListener("lostpointercapture", pointerUp);
      if (typeof window !== "undefined") {
        window.removeEventListener("keydown", keyDown);
        window.removeEventListener("keyup", keyUp);
        window.removeEventListener("blur", blur);
      }
      if (typeof document !== "undefined")
        document.removeEventListener("pointerlockchange", pointerLockChange);
    },
  };
}
