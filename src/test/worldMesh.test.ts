import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildWorldMeshes } from "@/engine/world/buildWorldMeshes";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";

describe("world mesh lifecycle", () => {
  it("creates one layered world with real label and tree visibility controls", () => {
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const bundle = buildWorldMeshes(
      SYNTHETIC_NEIGHBORHOOD,
      (color, roughness = 0.8, metalness = 0) => {
        const key = `${color}:${roughness}:${metalness}`;
        let material = materials.get(key);
        if (!material) {
          material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
          materials.set(key, material);
        }
        return material;
      },
    );

    expect(bundle.group.name).toBe("world:synthetic-neighborhood-v1");
    expect(bundle.layers.roads.children.length).toBeGreaterThan(0);
    expect(bundle.layers.buildings.children.length).toBeGreaterThan(0);
    expect(bundle.layers.labels.children.length).toBeGreaterThan(0);
    expect(bundle.layers.trees.children.length).toBeGreaterThan(0);

    bundle.setLayerVisible("labels", false);
    bundle.setLayerVisible("trees", false);
    expect(bundle.layers.labels.visible).toBe(false);
    expect(bundle.layers.trees.visible).toBe(false);

    expect(() => bundle.dispose()).not.toThrow();
  });
});
