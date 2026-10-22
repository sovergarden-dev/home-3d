import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { createPovController } from "@/engine/life/pov";
import type { WorldData } from "@/world/schema";

const world = {
  manifest: {
    schemaVersion: "1.0",
    datasetRevision: "test",
    units: "metres",
    frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
    isSynthetic: true,
    chunks: [],
    assetHashes: {},
    licences: [],
    coverage: { quality: "synthetic", sourceCount: 1 },
  },
  roads: [],
  lots: [],
  buildings: [],
} as unknown as WorldData;

function controller(onInvalidate = vi.fn()) {
  return {
    onInvalidate,
    pov: createPovController({
      camera: new THREE.PerspectiveCamera(),
      canvas: document.createElement("canvas"),
      world,
      onInvalidate,
    }),
  };
}

describe("P9 demand-driven POV frames", () => {
  it("renders the mode-entry frame, then idles while stationary", () => {
    const { pov, onInvalidate } = controller();
    pov.setMode("walk");
    expect(onInvalidate).toHaveBeenCalled();
    expect(pov.active()).toBe(true);
    pov.update(0);
    expect(pov.active()).toBe(false);
    pov.update(0.1);
    expect(pov.active()).toBe(false);
    pov.dispose();
  });

  it("keeps demand while input or velocity is nonzero and settles after release", () => {
    const { pov } = controller();
    pov.setMode("walk");
    pov.update(0);
    pov.move({ x: 0, z: 1 });
    expect(pov.active()).toBe(true);
    pov.update(0.1);
    pov.move({ x: 0, z: 0 });
    expect(pov.active()).toBe(true);
    for (let i = 0; i < 100 && pov.active(); i++) pov.update(0.1);
    expect(pov.active()).toBe(false);
    pov.dispose();
  });

  it("invalidates a stationary walk for a look change", () => {
    const { pov, onInvalidate } = controller();
    pov.setMode("walk");
    pov.update(0);
    onInvalidate.mockClear();
    pov.look({ dx: 2 });
    expect(onInvalidate).toHaveBeenCalledTimes(1);
    expect(pov.active()).toBe(true);
    pov.update(0);
    expect(pov.active()).toBe(false);
    pov.dispose();
  });

  it("requests one trailing frame when leaving POV and then settles", () => {
    const { pov } = controller();
    pov.setMode("walk");
    pov.update(0);
    pov.setMode(null);
    expect(pov.active()).toBe(true);
    pov.update(0);
    expect(pov.active()).toBe(false);
    pov.dispose();
  });
});
