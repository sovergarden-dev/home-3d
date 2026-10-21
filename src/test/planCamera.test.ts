import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  calculatePlanScaleBar,
  configurePlanCamera,
  metresPerCssPixel,
  projectPlanPoint,
} from "@/engine/view/planCamera";

describe("orthographic Mặt bằng camera", () => {
  it("looks straight down while keeping north at screen top and east at screen right", () => {
    const camera = new THREE.OrthographicCamera();
    configurePlanCamera(camera, {
      centre: new THREE.Vector3(0, 0, 0),
      verticalSpanMetres: 100,
      viewportWidthCss: 1440,
      viewportHeightCss: 900,
      zoom: 1,
    });

    const centre = projectPlanPoint(camera, new THREE.Vector3(0, 0, 0));
    const north = projectPlanPoint(camera, new THREE.Vector3(0, 0, -10));
    const east = projectPlanPoint(camera, new THREE.Vector3(10, 0, 0));

    expect(camera.type).toBe("OrthographicCamera");
    expect(
      camera.getWorldDirection(new THREE.Vector3()).angleTo(new THREE.Vector3(0, -1, 0)),
    ).toBeLessThan(1e-9);
    expect(north.y).toBeLessThan(centre.y);
    expect(east.x).toBeGreaterThan(centre.x);
  });

  it("derives a scale bar from orthographic camera metrics without a fixed pixel assumption", () => {
    const camera = new THREE.OrthographicCamera();
    configurePlanCamera(camera, {
      centre: new THREE.Vector3(0, 0, 0),
      verticalSpanMetres: 100,
      viewportWidthCss: 1440,
      viewportHeightCss: 900,
      zoom: 1,
    });

    const metresPerPixel = metresPerCssPixel(camera, 900);
    const scale = calculatePlanScaleBar(metresPerPixel, 120);

    expect(metresPerPixel).toBeCloseTo(100 / 900, 12);
    expect(scale.metres).toBe(10);
    expect(scale.cssPixels).toBeCloseTo(90, 12);
  });

  it.each([
    { width: 1440, height: 900, zoom: 1 },
    { width: 390, height: 844, zoom: 1.5 },
    { width: 844, height: 390, zoom: 0.5 },
  ])(
    "independently projects two world ground points separated by scale.metres with near-zero error at $width×$height zoom $zoom",
    ({ width, height, zoom }) => {
      const camera = new THREE.OrthographicCamera();
      configurePlanCamera(camera, {
        centre: new THREE.Vector3(0, 0, 0),
        verticalSpanMetres: 160,
        viewportWidthCss: width,
        viewportHeightCss: height,
        zoom,
      });

      const metresPerPixel = metresPerCssPixel(camera, height);
      const scale = calculatePlanScaleBar(metresPerPixel, 120);

      // Independent projection through camera matrix:
      // Project origin (0, 0, 0) and (scale.metres, 0, 0) to screen coordinates
      const v1 = new THREE.Vector3(0, 0, 0).project(camera);
      const v2 = new THREE.Vector3(scale.metres, 0, 0).project(camera);
      const screenDx = Math.abs((v2.x - v1.x) * 0.5 * width);

      expect(Math.abs(screenDx - scale.cssPixels)).toBeLessThan(1e-9);
      expect(scale.cssPixels).toBeGreaterThan(0);
    },
  );
});
