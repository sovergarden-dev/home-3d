import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LifeKind, LifeSettings, LifeSimulation, LifeTier } from "./simulation";
export interface LifeRenderer {
  readonly group: THREE.Group;
  update(dt: number, settings?: LifeSettings): void;
  setVisible(visible: boolean): void;
  dispose(): void;
}
const kinds: LifeKind[] = [
  "motorbike",
  "car",
  "bus",
  "tricycle",
  "bicycle",
  "pedestrian",
  "vendor",
  "dog",
  "cat",
  "chicken",
];
const capFor = (tier: LifeTier) =>
  tier === "low" ? 60 : tier === "mid" ? 200 : tier === "high" ? 800 : 2000;
const colors: Record<LifeKind, number> = {
  motorbike: 0xd34d38,
  car: 0x3c78a8,
  bus: 0xd2a02f,
  tricycle: 0x4f9b67,
  bicycle: 0x8d6ab7,
  pedestrian: 0xe0aa72,
  vendor: 0xc67b43,
  dog: 0x9b6b4c,
  cat: 0x777b82,
  chicken: 0xf0e4c9,
};
const box = (x: number, y: number, z: number, px = 0, py = 0, pz = 0) => {
  const g = new THREE.BoxGeometry(x, y, z);
  g.translate(px, py, pz);
  return g;
};
const geometryFor = (kind: LifeKind, low: boolean) => {
  const detail = low ? 6 : 8,
    parts: THREE.BufferGeometry[] = [];
  if (kind === "pedestrian") {
    parts.push(new THREE.CapsuleGeometry(0.18, 0.48, 3, detail));
    parts.push(new THREE.SphereGeometry(0.2, detail, 5).translate(0, 0.48, 0));
  } else if (kind === "vendor") {
    parts.push(box(0.48, 0.38, 0.72, 0, 0.18, 0));
    parts.push(new THREE.ConeGeometry(0.55, 0.25, 4).translate(0, 0.62, 0));
    parts.push(box(0.72, 0.08, 0.42, 0, 0.03, 0.42));
  } else if (kind === "dog" || kind === "cat") {
    parts.push(
      new THREE.SphereGeometry(kind === "dog" ? 0.28 : 0.23, detail, 5).scale(1.25, 0.75, 1.6),
    );
    parts.push(new THREE.ConeGeometry(0.12, 0.24, 4).translate(0, 0.25, 0.18));
  } else if (kind === "chicken") {
    parts.push(new THREE.SphereGeometry(0.2, detail, 5));
    parts.push(new THREE.ConeGeometry(0.08, 0.18, 4).rotateZ(Math.PI / 2).translate(0.18, 0.02, 0));
  } else {
    const width = kind === "bus" ? 1.25 : kind === "motorbike" || kind === "bicycle" ? 0.34 : 0.8,
      length = kind === "bus" ? 2.8 : kind === "motorbike" || kind === "bicycle" ? 1.15 : 1.8;
    parts.push(box(width, kind === "bus" ? 0.7 : 0.42, length, 0, 0.25, 0));
    if (kind !== "bicycle") {
      parts.push(box(width * 0.68, 0.16, length * 0.38, 0, 0.65, -length * 0.12));
      const wheelRadius = kind === "bus" ? 0.3 : 0.22,
        wheelTube = kind === "bus" ? 0.075 : 0.055,
        wheelZ = length * 0.3;
      for (const x of [-width * 0.46, width * 0.46])
        for (const z of [-wheelZ, wheelZ])
          parts.push(
            new THREE.TorusGeometry(wheelRadius, wheelTube, 5, detail)
              .rotateY(Math.PI / 2)
              .translate(x, 0.25, z),
          );
    } else {
      parts.push(
        new THREE.TorusGeometry(0.22, 0.035, 4, detail)
          .rotateX(Math.PI / 2)
          .translate(0, 0.18, -0.35),
      );
      parts.push(
        new THREE.TorusGeometry(0.22, 0.035, 4, detail)
          .rotateX(Math.PI / 2)
          .translate(0, 0.18, 0.35),
      );
    }
  }
  const merged = mergeGeometries(parts, false) ?? parts[0]!;
  for (const part of parts) if (part !== merged) part.dispose();
  return merged;
};
export function createLifeRenderer(sim: LifeSimulation): LifeRenderer {
  const group = new THREE.Group();
  group.name = "life-renderer";
  group.userData["nonPickable"] = true;
  const meshes = new Map<LifeKind, THREE.InstancedMesh>(),
    geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [],
    max = 2000,
    dummy = new THREE.Object3D(),
    lampDummy = new THREE.Object3D();
  for (const kind of kinds) {
    const geometry = geometryFor(kind, sim.diagnostics.tier === "low");
    const material = new THREE.MeshStandardMaterial({
      color: colors[kind],
      roughness: 0.72,
      emissive: kind === "motorbike" || kind === "car" || kind === "bus" ? 0xffb36b : 0x000000,
      emissiveIntensity: 0,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, max);
    mesh.name = `life-${kind}`;
    mesh.count = 0;
    mesh.frustumCulled = false;
    mesh.userData["nonPickable"] = true;
    group.add(mesh);
    geometries.push(geometry);
    materials.push(material);
    meshes.set(kind, mesh);
  }
  const lampGeometry = new THREE.BoxGeometry(0.14, 0.08, 0.04),
    lampMaterial = new THREE.MeshStandardMaterial({
      color: 0xfff1b0,
      emissive: 0xffc766,
      emissiveIntensity: 1.8,
    }),
    lamps = new THREE.InstancedMesh(lampGeometry, lampMaterial, max * 2);
  lamps.name = "life-headlamps";
  lamps.count = 0;
  lamps.frustumCulled = false;
  lamps.userData["nonPickable"] = true;
  group.add(lamps);
  geometries.push(lampGeometry);
  materials.push(lampMaterial);
  let visible = true,
    disposed = false;
  const updateMatrices = (settings: LifeSettings) => {
    const hour = Number.isFinite(settings.hour ?? NaN) ? settings.hour! : 12,
      night = hour < 6 || hour >= 19,
      limit = capFor(sim.diagnostics.tier);
    let lampCount = 0;
    for (const kind of kinds) {
      const mesh = meshes.get(kind)!;
      let count = 0;
      (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
      for (const agent of sim.agents)
        if (agent.active && agent.kind === kind && count < limit) {
          dummy.position.set(
            agent.x,
            agent.y + (kind === "pedestrian" || kind === "vendor" ? 0.45 : 0.25),
            agent.z,
          );
          dummy.rotation.set(0, -agent.rotation - Math.PI / 2, 0);
          dummy.scale.setScalar(agent.fade);
          dummy.updateMatrix();
          mesh.setMatrixAt(count++, dummy.matrix);
          if (
            night &&
            (kind === "motorbike" || kind === "car" || kind === "bus" || kind === "tricycle")
          ) {
            const front =
                kind === "bus"
                  ? 1.4
                  : kind === "motorbike"
                    ? 0.58
                    : kind === "tricycle"
                      ? 0.7
                      : 0.9,
              side =
                kind === "bus"
                  ? 0.42
                  : kind === "motorbike"
                    ? 0.12
                    : kind === "tricycle"
                      ? 0.22
                      : 0.3,
              c = Math.cos(agent.rotation),
              s = Math.sin(agent.rotation);
            for (const offset of [-side, side]) {
              lampDummy.position.set(
                agent.x + c * offset + s * front,
                agent.y + 0.34,
                agent.z + s * offset - c * front,
              );
              lampDummy.rotation.set(0, -agent.rotation - Math.PI / 2, 0);
              lampDummy.scale.setScalar(agent.fade);
              lampDummy.updateMatrix();
              if (lampCount < max * 2) lamps.setMatrixAt(lampCount++, lampDummy.matrix);
            }
          }
        }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
    }
    lamps.count = lampCount;
    lamps.instanceMatrix.needsUpdate = true;
  };
  return {
    group,
    update(dt, settings = {}) {
      if (disposed) return;
      sim.update(dt, settings);
      group.visible = visible && settings.visible !== false;
      updateMatrices(settings);
    },
    setVisible(next) {
      visible = next;
      group.visible = next;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes.values()) mesh.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.clear();
    },
  };
}
