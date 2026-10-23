import * as THREE from "three";

export type CameraMode = "diorama" | "topdown";
export type Vec3Tuple = readonly [number, number, number];
export interface CameraPose {
  mode: CameraMode;
  target: Vec3Tuple;
  yaw: number;
  pitch: number;
  distance: number;
  zoom: number;
}
export interface CameraBounds {
  pitch: readonly [number, number];
  distance: readonly [number, number];
  zoom: readonly [number, number];
}
export const DEFAULT_CAMERA_POSE: CameraPose = {
  mode: "diorama",
  target: [0, 0.01, 0],
  yaw: 0,
  pitch: 0.72,
  distance: 100,
  zoom: 1,
};
export const DEFAULT_CAMERA_BOUNDS: CameraBounds = {
  pitch: [0.08, Math.PI / 2 - 0.02],
  distance: [4, 800],
  zoom: [0.1, 8],
};
const finite = (value: unknown, fallback: number) =>
  typeof value === "number" && Number.isFinite(value) ? value : fallback;
export function clampCameraPose(pose: CameraPose, bounds = DEFAULT_CAMERA_BOUNDS): CameraPose {
  return {
    mode: pose.mode === "topdown" ? "topdown" : "diorama",
    target: [
      finite(pose.target[0], 0),
      Math.max(0, finite(pose.target[1], 0)),
      finite(pose.target[2], 0),
    ],
    yaw: wrapAngle(finite(pose.yaw, 0)),
    pitch: THREE.MathUtils.clamp(
      finite(pose.pitch, DEFAULT_CAMERA_POSE.pitch),
      bounds.pitch[0],
      bounds.pitch[1],
    ),
    distance: THREE.MathUtils.clamp(
      finite(pose.distance, DEFAULT_CAMERA_POSE.distance),
      bounds.distance[0],
      bounds.distance[1],
    ),
    zoom: THREE.MathUtils.clamp(finite(pose.zoom, 1), bounds.zoom[0], bounds.zoom[1]),
  };
}
export function wrapAngle(angle: number) {
  const wrapped = (((angle % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return wrapped === -Math.PI ? Math.PI : wrapped;
}
export function shortestAngleDelta(from: number, to: number) {
  return wrapAngle(to - from);
}
export function interpolateCameraPose(
  from: CameraPose,
  to: CameraPose,
  amount: number,
): CameraPose {
  const t = THREE.MathUtils.clamp(amount, 0, 1);
  return clampCameraPose({
    mode: t < 1 ? from.mode : to.mode,
    target: [
      THREE.MathUtils.lerp(from.target[0], to.target[0], t),
      THREE.MathUtils.lerp(from.target[1], to.target[1], t),
      THREE.MathUtils.lerp(from.target[2], to.target[2], t),
    ],
    yaw: from.yaw + shortestAngleDelta(from.yaw, to.yaw) * t,
    pitch: THREE.MathUtils.lerp(from.pitch, to.pitch, t),
    distance: THREE.MathUtils.lerp(from.distance, to.distance, t),
    zoom: THREE.MathUtils.lerp(from.zoom, to.zoom, t),
  });
}

function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number) {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

export function catmullCameraPose(
  prev: CameraPose,
  from: CameraPose,
  to: CameraPose,
  next: CameraPose,
  amount: number,
): CameraPose {
  const t = THREE.MathUtils.clamp(amount, 0, 1);
  const fromYaw = from.yaw;
  const unwrap = (yaw: number, reference: number) => reference + shortestAngleDelta(reference, yaw);
  const prevYaw = unwrap(prev.yaw, fromYaw);
  const toYaw = unwrap(to.yaw, fromYaw);
  const nextYaw = unwrap(next.yaw, toYaw);
  const scalar = (value: (pose: CameraPose) => number) =>
    catmullRom(value(prev), value(from), value(to), value(next), t);
  return clampCameraPose({
    mode: t < 1 ? from.mode : to.mode,
    target: [
      catmullRom(prev.target[0], from.target[0], to.target[0], next.target[0], t),
      Math.max(0, catmullRom(prev.target[1], from.target[1], to.target[1], next.target[1], t)),
      catmullRom(prev.target[2], from.target[2], to.target[2], next.target[2], t),
    ],
    yaw: catmullRom(prevYaw, fromYaw, toYaw, nextYaw, t),
    pitch: scalar((pose) => pose.pitch),
    distance: scalar((pose) => pose.distance),
    zoom: scalar((pose) => pose.zoom),
  });
}

export function poseToOrbit(pose: CameraPose, position = new THREE.Vector3()) {
  const radius = pose.distance * Math.cos(pose.pitch);
  return position.set(
    pose.target[0] + Math.sin(pose.yaw) * radius,
    pose.target[1] + pose.distance * Math.sin(pose.pitch),
    pose.target[2] + Math.cos(pose.yaw) * radius,
  );
}
