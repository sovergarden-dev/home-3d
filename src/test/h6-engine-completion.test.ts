import { describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  cameraHomeFromExtent,
  cameraSpanFromExtent,
  projectMarkerAndCull,
} from "@/engine/view/cameraFrame";
import { pickFeature, isTap } from "@/engine/interaction/featurePicking";
import { createFrameMetrics } from "@/engine/quality/frameMetrics";
import { assessBuildingWallConfidence } from "@/engine/confidence/wallConfidence";

describe("H6 engine completion contracts", () => {
  it("reuses a stable home and full extent without changing north-up projection", () => {
    const extent = { minX: -10, maxX: 30, minZ: -50, maxZ: 10 };
    expect(cameraHomeFromExtent(extent)).toEqual({ x: 10, z: -20 });
    expect(cameraSpanFromExtent(extent)).toBe(66);
    const camera = new THREE.OrthographicCamera(-50, 50, 50, -50, 0.1, 200);
    camera.position.set(0, 100, 0);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    expect(projectMarkerAndCull(camera, new THREE.Vector3(0, 0, 0)).visible).toBe(true);
    expect(projectMarkerAndCull(camera, new THREE.Vector3(1000, 0, 0)).visible).toBe(false);
  });

  it("picks mapped feature and ignores hidden layer; drag is not a tap", () => {
    const root = new THREE.Group();
    const layer = new THREE.Group();
    layer.name = "layer:buildings";
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
    mesh.userData = { featureId: "b-1", featureType: "building", confidence: "known" };
    layer.add(mesh);
    root.add(layer);
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(0, 0, 5);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
    const raycaster = new THREE.Raycaster();
    expect(pickFeature(raycaster, new THREE.Vector2(0, 0), camera, root)).toMatchObject({
      featureId: "b-1",
    });
    expect(
      pickFeature(raycaster, new THREE.Vector2(0, 0), camera, root, new Set(["buildings"])),
    ).toBeNull();
    expect(isTap(new THREE.Vector2(0, 0), new THREE.Vector2(7, 0))).toBe(false);
  });

  it("keeps confidence sourced from assessWallHeight and separates metric phases", () => {
    const building = {
      localId: "b-1",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
      wallHeight: 8,
      attributes: { wallHeight: { source: "survey", quality: "verified" } },
    } as never;
    expect(assessBuildingWallConfidence(building, false)[0]).toMatchObject({
      status: "known",
      renderedHeight: 8,
    });
    const metrics = createFrameMetrics(8);
    metrics.record(0, "active");
    metrics.record(10, "active");
    metrics.record(0, "idle");
    metrics.record(30, "idle");
    expect(metrics.snapshot().p50Ms).toBe(10);
    expect(metrics.phaseSnapshot("idle").longestMs).toBe(30);
    expect(metrics.phaseSnapshot("hidden").renderedFrames).toBe(0);
  });

  it("does not fold idle gaps into active samples and keeps slow active frames", () => {
    const metrics = createFrameMetrics(8);
    metrics.record(0, "active");
    metrics.record(16, "active");
    metrics.record(1_000, "idle");
    metrics.record(1_030, "idle");
    metrics.record(2_000, "active");
    metrics.record(2_090, "active");

    expect(metrics.snapshot()).toMatchObject({
      renderedFrames: 4,
      p50Ms: 16,
      p95Ms: 90,
      longestMs: 90,
    });
    expect(metrics.phaseSnapshot("idle")).toMatchObject({
      renderedFrames: 2,
      p50Ms: 30,
      longestMs: 30,
    });
  });
});
