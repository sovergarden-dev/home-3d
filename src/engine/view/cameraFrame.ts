import * as THREE from "three";
import { configurePlanCamera, projectPlanPoint } from "./planCamera";

export interface CameraExtent {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export function extentFromPoints(points: Iterable<readonly [number, number]>): CameraExtent {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const [x, z] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) continue;
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return Number.isFinite(minX)
    ? { minX, maxX, minZ, maxZ }
    : { minX: 0, maxX: 0, minZ: 0, maxZ: 0 };
}

export function cameraHomeFromExtent(extent: CameraExtent) {
  return { x: (extent.minX + extent.maxX) / 2, z: (extent.minZ + extent.maxZ) / 2 };
}

export function cameraSpanFromExtent(extent: CameraExtent, padding = 1.1) {
  if (!Number.isFinite(padding) || padding <= 0) throw new Error("CAMERA_EXTENT_PADDING_INVALID");
  return Math.max((extent.maxX - extent.minX) * padding, (extent.maxZ - extent.minZ) * padding, 1);
}

export function configurePlanCameraForExtent(
  camera: THREE.OrthographicCamera,
  extent: CameraExtent,
  viewportWidthCss: number,
  viewportHeightCss: number,
  zoom = 1,
) {
  const home = cameraHomeFromExtent(extent);
  configurePlanCamera(camera, {
    centre: new THREE.Vector3(home.x, 0, home.z),
    verticalSpanMetres: cameraSpanFromExtent(extent),
    viewportWidthCss,
    viewportHeightCss,
    zoom,
  });
  return home;
}

export interface ProjectedMarker {
  x: number;
  y: number;
  visible: boolean;
}

export function projectMarkerAndCull(
  camera: THREE.Camera,
  point: THREE.Vector3,
  margin = 0,
): ProjectedMarker {
  const ndc = point.clone().project(camera);
  const visible =
    ndc.z >= -1 && ndc.z <= 1 && Math.abs(ndc.x) <= 1 + margin && Math.abs(ndc.y) <= 1 + margin;
  return { x: (ndc.x + 1) / 2, y: (1 - ndc.y) / 2, visible };
}

export function projectPlanMarkerAndCull(
  camera: THREE.OrthographicCamera,
  point: THREE.Vector3,
  margin = 0,
) {
  const projected = projectPlanPoint(camera, point);
  const ndc = point.clone().project(camera);
  return {
    ...projected,
    visible:
      ndc.z >= -1 &&
      ndc.z <= 1 &&
      projected.x >= -margin &&
      projected.x <= 1 + margin &&
      projected.y >= -margin &&
      projected.y <= 1 + margin,
  };
}
