import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildCollisionBvh, resolveMovement } from "@/engine/life/collision";
import { createPovController } from "@/engine/life/pov";
import type { WorldData } from "@/world/schema";

const world = {
  manifest: {
    schemaVersion: "1.0",
    datasetRevision: "test",
    units: "metres",
    frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
    isSynthetic: true,
    chunks: [{ localId: "c", bounds: [-5, -5, 5, 5], tier: "core" }],
    assetHashes: {},
    licences: [],
    coverage: { quality: "synthetic", sourceCount: 1 },
  },
  roads: [],
  lots: [],
  buildings: [
    {
      localId: "wall",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-1, -1],
            [1, -1],
            [1, 1],
            [-1, 1],
            [-1, -1],
          ],
        ],
      },
      footprintKind: "footprint",
      wallHeight: 0,
      roofType: "unknown",
      provenance: { source: "synthetic", quality: "unknown" },
    },
  ],
} as unknown as WorldData;

describe("P9 POV collision", () => {
  it("builds a BVH and slides/clamps instead of tunnelling", () => {
    const b = buildCollisionBvh(world);
    expect(b.segmentCount).toBe(4);
    const r = resolveMovement(b, { x: -2, z: 0 }, { x: 3, z: 1 }, 0.2);
    expect(r.position.x).toBeLessThan(-1);
    expect(r.position.z).toBeGreaterThan(0);
  });
  it("clamps empty-world movement to finite package bounds", () => {
    const empty = { ...world, buildings: [] } as WorldData;
    const b = buildCollisionBvh(empty);
    const r = resolveMovement(b, { x: 0, z: 0 }, { x: 1000, z: 1000 });
    expect(r.position.x).toBeLessThanOrEqual(b.bounds.maxX);
    expect(Number.isFinite(r.position.z)).toBe(true);
  });
  it("restores camera pose exactly on exit", () => {
    const camera = new THREE.PerspectiveCamera();
    camera.position.set(2, 8, 3);
    camera.quaternion.setFromEuler(new THREE.Euler(0.2, 0.4, 0.1));
    const p = camera.position.clone(),
      q = camera.quaternion.clone();
    const canvas = document.createElement("canvas");
    const c = createPovController({ camera, canvas, world });
    c.setMode("walk");
    c.look({ dx: 30, dy: 20 });
    c.setMode(null);
    expect(camera.position.equals(p)).toBe(true);
    expect(camera.quaternion.equals(q)).toBe(true);
    c.dispose();
  });
});
