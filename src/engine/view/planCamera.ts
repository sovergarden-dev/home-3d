import * as THREE from "three";

export interface PlanCameraConfig {
  centre: THREE.Vector3;
  verticalSpanMetres: number;
  viewportWidthCss: number;
  viewportHeightCss: number;
  zoom: number;
}

export interface PlanScaleBar {
  metres: number;
  cssPixels: number;
}

const NORTH_UP = new THREE.Vector3(0, 0, -1);
const DOWN = new THREE.Vector3(0, -1, 0);

export function configurePlanCamera(camera: THREE.OrthographicCamera, config: PlanCameraConfig) {
  if (!Number.isFinite(config.verticalSpanMetres) || config.verticalSpanMetres <= 0) {
    throw new Error("PLAN_CAMERA_INVALID_VERTICAL_SPAN");
  }
  if (!Number.isFinite(config.viewportWidthCss) || config.viewportWidthCss <= 0) {
    throw new Error("PLAN_CAMERA_INVALID_VIEWPORT_WIDTH");
  }
  if (!Number.isFinite(config.viewportHeightCss) || config.viewportHeightCss <= 0) {
    throw new Error("PLAN_CAMERA_INVALID_VIEWPORT_HEIGHT");
  }
  if (!Number.isFinite(config.zoom) || config.zoom <= 0) {
    throw new Error("PLAN_CAMERA_INVALID_ZOOM");
  }

  const aspect = config.viewportWidthCss / config.viewportHeightCss;
  const halfHeight = config.verticalSpanMetres / 2;
  const height = Math.max(config.verticalSpanMetres * 2, 100);

  camera.left = -halfHeight * aspect;
  camera.right = halfHeight * aspect;
  camera.top = halfHeight;
  camera.bottom = -halfHeight;
  camera.near = 0.1;
  camera.far = height * 4;
  camera.zoom = config.zoom;
  camera.up.copy(NORTH_UP);
  camera.position.set(config.centre.x, config.centre.y + height, config.centre.z);
  camera.lookAt(config.centre);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld(true);
}

export function metresPerCssPixel(camera: THREE.OrthographicCamera, viewportHeightCss: number) {
  if (!Number.isFinite(viewportHeightCss) || viewportHeightCss <= 0) {
    throw new Error("PLAN_SCALE_INVALID_VIEWPORT_HEIGHT");
  }
  if (!Number.isFinite(camera.zoom) || camera.zoom <= 0) {
    throw new Error("PLAN_SCALE_INVALID_CAMERA_ZOOM");
  }
  return (camera.top - camera.bottom) / camera.zoom / viewportHeightCss;
}

export function calculatePlanScaleBar(metresPerPixel: number, targetCssPixels = 120): PlanScaleBar {
  if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) {
    throw new Error("PLAN_SCALE_INVALID_METRES_PER_PIXEL");
  }
  if (!Number.isFinite(targetCssPixels) || targetCssPixels <= 0) {
    throw new Error("PLAN_SCALE_INVALID_TARGET_WIDTH");
  }

  const targetMetres = metresPerPixel * targetCssPixels;
  const exponent = Math.floor(Math.log10(targetMetres));
  const base = 10 ** exponent;
  const candidates = [1, 2, 5, 10].map((factor) => factor * base);
  const metres = candidates.filter((candidate) => candidate <= targetMetres).at(-1) ?? base / 10;

  return { metres, cssPixels: metres / metresPerPixel };
}

export function projectPlanPoint(camera: THREE.OrthographicCamera, point: THREE.Vector3) {
  const ndc = point.clone().project(camera);
  return new THREE.Vector2((ndc.x + 1) / 2, (1 - ndc.y) / 2);
}

export function isPlanCameraZenith(camera: THREE.OrthographicCamera, toleranceRadians = 1e-6) {
  return camera.getWorldDirection(new THREE.Vector3()).angleTo(DOWN) <= toleranceRadians;
}
