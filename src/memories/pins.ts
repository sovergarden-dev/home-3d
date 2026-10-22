import * as THREE from "three";
import type { Memory } from "./schema";
export type MemoryPin = Memory;
export type PinTier = "low" | "mid" | "high" | "ultra";
export const PIN_CAPS: Record<PinTier, number> = { low: 40, mid: 120, high: 300, ultra: 300 };
export function pinCap(tier: PinTier) {
  return PIN_CAPS[tier];
}
export interface MemoryPinLayer {
  group: THREE.Group;
  mesh: THREE.InstancedMesh;
  memories: MemoryPin[];
  update: (memories: readonly MemoryPin[], guest: boolean) => void;
  dispose: () => void;
}
export function createMemoryPinLayer(tier: PinTier = "mid"): MemoryPinLayer {
  const cap = pinCap(tier),
    group = new THREE.Group();
  group.name = "memory-pins";
  const geometry = new THREE.ConeGeometry(0.7, 1.8, 8),
    material = new THREE.MeshStandardMaterial({ color: "#d86845", roughness: 0.7 });
  const mesh = new THREE.InstancedMesh(geometry, material, cap);
  mesh.name = "memory-pins-instanced";
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  group.add(mesh);
  const position = new THREE.Vector3(),
    quaternion = new THREE.Quaternion(),
    scale = new THREE.Vector3(1, 1, 1),
    matrix = new THREE.Matrix4(),
    visibleMemories: MemoryPin[] = [];
  const update = (memories: readonly MemoryPin[], guest: boolean) => {
    visibleMemories.length = 0;
    for (const memory of memories) {
      if (visibleMemories.length >= cap) break;
      if (
        guest &&
        (memory.visibility !== "public" || memory.photos.some((photo) => !photo.reviewed))
      )
        continue;
      visibleMemories.push(memory);
      position.set(memory.position[0], memory.position[1] + 0.9, memory.position[2]);
      mesh.setMatrixAt(visibleMemories.length - 1, matrix.compose(position, quaternion, scale));
    }
    mesh.count = visibleMemories.length;
    mesh.instanceMatrix.needsUpdate = true;
  };
  return {
    group,
    mesh,
    memories: visibleMemories,
    update,
    dispose() {
      geometry.dispose();
      material.dispose();
    },
  };
}
