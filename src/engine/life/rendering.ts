import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { LifeKind, LifeSettings, LifeSimulation, LifeTier } from "./simulation";

export interface LifeRenderer {
  readonly group: THREE.Group;
  update(dt: number, settings?: LifeSettings): void;
  setVisible(visible: boolean): void;
  setDiorama(enabled: boolean): void;
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

const tint = (g: THREE.BufferGeometry, hex: number) => {
  const nonIndexed = g.index ? g.toNonIndexed() : g;
  if (nonIndexed !== g) g.dispose();
  const count = nonIndexed.attributes["position"]!.count;
  const col = new THREE.Color(hex);
  const arr = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    arr[i * 3] = col.r;
    arr[i * 3 + 1] = col.g;
    arr[i * 3 + 2] = col.b;
  }
  nonIndexed.setAttribute("color", new THREE.BufferAttribute(arr, 3));
  return nonIndexed;
};

const box = (x: number, y: number, z: number, px = 0, py = 0, pz = 0, hex = 0xffffff) => {
  const g = new THREE.BoxGeometry(x, y, z);
  g.translate(px, py, pz);
  return tint(g, hex);
};

const cyl = (
  rt: number,
  rb: number,
  h: number,
  seg: number,
  px = 0,
  py = 0,
  pz = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  hex = 0xffffff,
) => {
  const g = new THREE.CylinderGeometry(rt, rb, h, seg);
  if (rx) g.rotateX(rx);
  if (ry) g.rotateY(ry);
  if (rz) g.rotateZ(rz);
  g.translate(px, py, pz);
  return tint(g, hex);
};

const geometryFor = (kind: LifeKind, low: boolean) => {
  const detail = low ? 6 : 8,
    parts: THREE.BufferGeometry[] = [];
  const primary = colors[kind];
  const tireHex = 0x262a2c;
  const rimHex = 0xcfd6d8;
  const glassHex = 0x92c4de;
  const skinHex = 0xe8b48a;
  const darkHex = 0x353b40;

  if (kind === "pedestrian") {
    // Legs + shoes
    parts.push(box(0.08, 0.28, 0.09, -0.06, -0.14, 0.03, 0x2f3e4e));
    parts.push(box(0.08, 0.28, 0.09, 0.06, -0.14, -0.03, 0x2f3e4e));
    parts.push(box(0.09, 0.05, 0.14, -0.06, -0.27, 0.05, darkHex));
    parts.push(box(0.09, 0.05, 0.14, 0.06, -0.27, -0.01, darkHex));
    // Torso + backpack + arms
    parts.push(box(0.24, 0.32, 0.15, 0, 0.14, 0, primary));
    parts.push(box(0.18, 0.22, 0.08, 0, 0.15, -0.11, 0x5c4738));
    parts.push(box(0.06, 0.26, 0.07, -0.15, 0.12, 0.02, primary));
    parts.push(box(0.06, 0.26, 0.07, 0.15, 0.12, -0.02, primary));
    // Head + hair / conical hat accent
    parts.push(tint(new THREE.SphereGeometry(0.11, detail, 5).translate(0, 0.39, 0), skinHex));
    parts.push(
      tint(
        new THREE.SphereGeometry(0.115, detail, 4).scale(1, 0.65, 1.05).translate(0, 0.44, -0.01),
        0x25211e,
      ),
    );
  } else if (kind === "vendor") {
    // Person with iconic Vietnamese conical hat (Nón lá) + shoulder pole (đòn gánh) + 2 woven baskets + pushcart
    parts.push(box(0.08, 0.26, 0.09, -0.06, -0.12, 0, 0x383c42));
    parts.push(box(0.08, 0.26, 0.09, 0.06, -0.12, 0, 0x383c42));
    parts.push(box(0.24, 0.32, 0.16, 0, 0.16, 0, primary));
    parts.push(tint(new THREE.SphereGeometry(0.11, detail, 5).translate(0, 0.4, 0), skinHex));
    // Non la (conical hat)
    parts.push(tint(new THREE.ConeGeometry(0.28, 0.18, detail).translate(0, 0.51, 0), 0xe6d2a2));
    // Shoulder bamboo pole (đòn gánh) + front/back baskets
    parts.push(box(0.04, 0.03, 1.15, 0.12, 0.31, 0, 0xc89d54));
    parts.push(cyl(0.2, 0.14, 0.14, detail, 0.12, 0.02, 0.48, 0, 0, 0, 0xb88444));
    parts.push(cyl(0.2, 0.14, 0.14, detail, 0.12, 0.02, -0.48, 0, 0, 0, 0xb88444));
    // Colorful produce in baskets
    parts.push(
      tint(
        new THREE.SphereGeometry(0.13, 5, 4).scale(1, 0.5, 1).translate(0.12, 0.09, 0.48),
        0xd94e34,
      ),
    );
    parts.push(
      tint(
        new THREE.SphereGeometry(0.13, 5, 4).scale(1, 0.5, 1).translate(0.12, 0.09, -0.48),
        0x629c44,
      ),
    );
  } else if (kind === "dog" || kind === "cat") {
    const s = kind === "dog" ? 1 : 0.78;
    const bodyCol = kind === "dog" ? 0xb57c4a : 0x8a8f99;
    // Body, head, snout, 4 legs, upright tail, ears
    parts.push(box(0.22 * s, 0.2 * s, 0.48 * s, 0, 0.16 * s, 0, bodyCol));
    parts.push(box(0.2 * s, 0.18 * s, 0.2 * s, 0, 0.28 * s, 0.24 * s, bodyCol));
    parts.push(box(0.12 * s, 0.1 * s, 0.14 * s, 0, 0.25 * s, 0.36 * s, 0x3b2d23));
    // Ears
    parts.push(
      tint(
        new THREE.ConeGeometry(0.05 * s, 0.12 * s, 4).translate(-0.06 * s, 0.4 * s, 0.22 * s),
        0x4a3525,
      ),
    );
    parts.push(
      tint(
        new THREE.ConeGeometry(0.05 * s, 0.12 * s, 4).translate(0.06 * s, 0.4 * s, 0.22 * s),
        0x4a3525,
      ),
    );
    // 4 legs
    for (const lx of [-0.07 * s, 0.07 * s])
      for (const lz of [-0.16 * s, 0.16 * s])
        parts.push(box(0.055 * s, 0.18 * s, 0.055 * s, lx, 0.04 * s, lz, bodyCol));
    // Tail
    parts.push(cyl(0.025 * s, 0.035 * s, 0.22 * s, 4, 0, 0.28 * s, -0.26 * s, -0.5, 0, 0, bodyCol));
  } else if (kind === "chicken") {
    parts.push(
      tint(
        new THREE.SphereGeometry(0.15, detail, 5).scale(0.85, 0.9, 1.2).translate(0, 0.12, 0),
        0xf4ead2,
      ),
    );
    parts.push(tint(new THREE.SphereGeometry(0.08, 5, 4).translate(0, 0.24, 0.12), 0xf4ead2));
    // Red comb + orange beak + tail feathers
    parts.push(box(0.03, 0.06, 0.08, 0, 0.31, 0.12, 0xd93829));
    parts.push(
      tint(
        new THREE.ConeGeometry(0.035, 0.09, 4).rotateX(Math.PI / 2).translate(0, 0.23, 0.21),
        0xe89b25,
      ),
    );
    parts.push(box(0.06, 0.12, 0.1, 0, 0.19, -0.16, 0xc79c5e));
  } else if (kind === "motorbike") {
    // Vietnamese scooter with rider + helmet + headlight + mirrors + wheels
    // Wheels (front & rear)
    for (const wz of [-0.4, 0.42]) {
      parts.push(
        tint(
          new THREE.TorusGeometry(0.17, 0.045, 5, detail)
            .rotateY(Math.PI / 2)
            .translate(0, 0.02, wz),
          tireHex,
        ),
      );
      parts.push(cyl(0.09, 0.09, 0.04, 6, 0, 0.02, wz, 0, 0, Math.PI / 2, rimHex));
    }
    // Scooter body rear chassis + front apron shield + footboard
    parts.push(box(0.3, 0.26, 0.56, 0, 0.18, -0.22, primary));
    parts.push(box(0.26, 0.06, 0.36, 0, 0.08, 0.1, darkHex));
    parts.push(box(0.3, 0.44, 0.14, 0, 0.28, 0.32, primary));
    // Seat + handlebar + headlamp + tail light
    parts.push(box(0.24, 0.08, 0.44, 0, 0.34, -0.18, 0x24201e));
    parts.push(box(0.48, 0.04, 0.04, 0, 0.48, 0.28, darkHex));
    parts.push(box(0.14, 0.09, 0.05, 0, 0.47, 0.37, 0xfff5cc));
    parts.push(box(0.14, 0.06, 0.04, 0, 0.26, -0.51, 0xe03b2b));
    // Rider torso + arms + helmet
    parts.push(box(0.24, 0.34, 0.18, 0, 0.54, -0.12, 0x2f5f7a));
    parts.push(box(0.07, 0.22, 0.28, -0.14, 0.5, 0.06, 0x2f5f7a));
    parts.push(box(0.07, 0.22, 0.28, 0.14, 0.5, 0.06, 0x2f5f7a));
    parts.push(tint(new THREE.SphereGeometry(0.12, detail, 5).translate(0, 0.79, -0.1), skinHex));
    parts.push(
      tint(
        new THREE.SphereGeometry(0.135, detail, 5).scale(1, 0.85, 1.08).translate(0, 0.83, -0.1),
        0xf2b735,
      ),
    );
  } else if (kind === "bicycle") {
    for (const wz of [-0.38, 0.38]) {
      parts.push(
        tint(
          new THREE.TorusGeometry(0.19, 0.03, 4, detail)
            .rotateY(Math.PI / 2)
            .translate(0, 0.02, wz),
          tireHex,
        ),
      );
    }
    // Frame + handlebar + front basket + rider
    parts.push(box(0.05, 0.26, 0.68, 0, 0.2, 0, primary));
    parts.push(box(0.42, 0.035, 0.035, 0, 0.44, 0.3, rimHex));
    parts.push(box(0.24, 0.16, 0.18, 0, 0.34, 0.42, 0xc79b58));
    parts.push(box(0.22, 0.32, 0.16, 0, 0.52, -0.1, 0xe8dfd1));
    parts.push(tint(new THREE.SphereGeometry(0.11, detail, 5).translate(0, 0.76, -0.08), skinHex));
    parts.push(
      tint(new THREE.ConeGeometry(0.22, 0.13, detail).translate(0, 0.85, -0.08), 0xe6d2a2),
    );
  } else if (kind === "tricycle") {
    // Vietnamese Xe ba gác (blue cargo tricycle)
    // Front wheel + cabin + 2 rear wheels + cargo flatbed with side rails
    parts.push(
      tint(
        new THREE.TorusGeometry(0.19, 0.05, 5, detail)
          .rotateY(Math.PI / 2)
          .translate(0, 0.04, 0.68),
        tireHex,
      ),
    );
    for (const wx of [-0.46, 0.46])
      parts.push(
        tint(
          new THREE.TorusGeometry(0.2, 0.055, 5, detail)
            .rotateY(Math.PI / 2)
            .translate(wx, 0.05, -0.45),
          tireHex,
        ),
      );
    // Front fork + driver + canopy
    parts.push(box(0.34, 0.38, 0.42, 0, 0.26, 0.42, primary));
    parts.push(box(0.48, 0.04, 0.04, 0, 0.48, 0.56, darkHex));
    parts.push(box(0.22, 0.3, 0.16, 0, 0.54, 0.32, 0x3b4d5e));
    parts.push(tint(new THREE.SphereGeometry(0.11, detail, 5).translate(0, 0.76, 0.32), 0xd99b43));
    // Rear cargo bed + wooden crates
    parts.push(box(0.96, 0.1, 1.12, 0, 0.2, -0.32, 0x2f6846));
    parts.push(box(0.96, 0.28, 0.06, 0, 0.38, -0.85, primary));
    parts.push(box(0.06, 0.28, 1.12, -0.45, 0.38, -0.32, primary));
    parts.push(box(0.06, 0.28, 1.12, 0.45, 0.38, -0.32, primary));
    parts.push(box(0.42, 0.32, 0.45, -0.16, 0.41, -0.35, 0xc48f52));
    parts.push(box(0.36, 0.26, 0.4, 0.2, 0.38, -0.25, 0xa8763e));
  } else if (kind === "bus") {
    // Detailed City Bus / Coaster with windows, roof AC unit, windshield, headlights, taillights, bumpers, wheels
    const width = 1.32,
      length = 3.1;
    // Lower body + upper window band + roof
    parts.push(box(width, 0.52, length, 0, 0.28, 0, primary));
    parts.push(box(width * 0.98, 0.42, length * 0.96, 0, 0.74, 0, glassHex));
    parts.push(box(width, 0.12, length * 0.98, 0, 1.0, 0, 0xf5f2e9));
    // Roof AC pod + window pillars + front/rear bumpers
    parts.push(box(width * 0.58, 0.12, length * 0.45, 0, 1.11, -0.1, 0xd8d6ce));
    for (const pz of [-1.05, -0.35, 0.35, 1.05])
      parts.push(box(width * 1.01, 0.42, 0.08, 0, 0.74, pz, primary));
    parts.push(box(width * 1.02, 0.12, 0.1, 0, 0.1, length * 0.5, darkHex));
    parts.push(box(width * 1.02, 0.12, 0.1, 0, 0.1, -length * 0.5, darkHex));
    // Headlights & Taillights & Route sign
    parts.push(box(0.22, 0.1, 0.04, -0.44, 0.26, length * 0.51, 0xfff5c0));
    parts.push(box(0.22, 0.1, 0.04, 0.44, 0.26, length * 0.51, 0xfff5c0));
    parts.push(box(0.55, 0.1, 0.04, 0, 0.96, length * 0.5, 0xffaa33));
    parts.push(box(0.22, 0.12, 0.04, -0.46, 0.3, -length * 0.51, 0xe03528));
    parts.push(box(0.22, 0.12, 0.04, 0.46, 0.3, -length * 0.51, 0xe03528));
    // 4 wheels with rims
    for (const x of [-width * 0.48, width * 0.48])
      for (const z of [-length * 0.31, length * 0.31]) {
        parts.push(
          tint(
            new THREE.TorusGeometry(0.28, 0.08, 5, detail)
              .rotateY(Math.PI / 2)
              .translate(x, 0.06, z),
            tireHex,
          ),
        );
        parts.push(cyl(0.15, 0.15, 0.06, 6, x, 0.06, z, 0, 0, Math.PI / 2, rimHex));
      }
  } else {
    // Car (Sedan / SUV silhouette with hood, trunk, glass cabin, wheels, bumpers, headlights, taillights)
    const width = 0.92,
      length = 2.05;
    // Lower chassis body
    parts.push(box(width, 0.34, length, 0, 0.2, 0, primary));
    // Cabin greenhouse (glass) + painted roof cap + C-pillar
    parts.push(box(width * 0.84, 0.28, length * 0.52, 0, 0.49, -0.08, glassHex));
    parts.push(box(width * 0.86, 0.06, length * 0.48, 0, 0.64, -0.08, primary));
    parts.push(box(width * 0.86, 0.28, 0.09, 0, 0.49, -0.28, primary));
    // Bumpers, grille, headlights, red brake lights
    parts.push(box(width * 1.02, 0.1, 0.08, 0, 0.1, length * 0.5, darkHex));
    parts.push(box(width * 1.02, 0.1, 0.08, 0, 0.1, -length * 0.5, darkHex));
    parts.push(box(0.38, 0.12, 0.04, 0, 0.2, length * 0.51, darkHex));
    parts.push(box(0.18, 0.08, 0.04, -0.31, 0.24, length * 0.51, 0xfff5c0));
    parts.push(box(0.18, 0.08, 0.04, 0.31, 0.24, length * 0.51, 0xfff5c0));
    parts.push(box(0.2, 0.08, 0.04, -0.3, 0.26, -length * 0.51, 0xe63529));
    parts.push(box(0.2, 0.08, 0.04, 0.3, 0.26, -length * 0.51, 0xe63529));
    // 4 wheels with rims
    for (const x of [-width * 0.47, width * 0.47])
      for (const z of [-length * 0.31, length * 0.31]) {
        parts.push(
          tint(
            new THREE.TorusGeometry(0.21, 0.06, 5, detail)
              .rotateY(Math.PI / 2)
              .translate(x, 0.02, z),
            tireHex,
          ),
        );
        parts.push(cyl(0.11, 0.11, 0.05, 6, x, 0.02, z, 0, 0, Math.PI / 2, rimHex));
      }
  }
  const merged = mergeGeometries(parts, false) ?? parts[0]!;
  for (const part of parts) if (part !== merged) part.dispose();
  return merged;
};

const variantPalettes: Record<LifeKind, number[]> = {
  motorbike: [0xffffff, 0xf2d0a9, 0xa8d8ea, 0xdcedc1, 0xffaaa5],
  car: [0xffffff, 0xf5f5f5, 0xdcd6f7, 0xfce38a, 0xbae8e8, 0xffd3b6],
  bus: [0xffffff, 0xffe6aa, 0xc4f0c5],
  tricycle: [0xffffff, 0xd4f0f0],
  bicycle: [0xffffff, 0xffe2e2, 0xd4ebd0],
  pedestrian: [0xffffff, 0xa8e6cf, 0xffd3b6, 0xffaaa5, 0xdcedc1, 0xc7ceea],
  vendor: [0xffffff, 0xffe8b6, 0xd9f2e6],
  dog: [0xffffff, 0xf3d19c, 0xc2b280],
  cat: [0xffffff, 0xf5d6ba, 0xd6d6d6],
  chicken: [0xffffff, 0xfff0c2],
};

export function createLifeRenderer(sim: LifeSimulation): LifeRenderer {
  const group = new THREE.Group();
  group.name = "life-renderer";
  group.userData["nonPickable"] = true;
  if (!sim.graph.enabled) {
    let disposed = false;
    group.visible = false;
    return {
      group,
      update(dt, settings = {}) {
        if (!disposed) sim.update(dt, settings);
      },
      setDiorama() {},
      setVisible() {
        group.visible = false;
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        group.removeFromParent();
        group.clear();
      },
    };
  }
  const meshes = new Map<LifeKind, THREE.InstancedMesh>(),
    geometries: THREE.BufferGeometry[] = [],
    materials: THREE.Material[] = [],
    max = 2000,
    dummy = new THREE.Object3D(),
    lampDummy = new THREE.Object3D(),
    instanceColor = new THREE.Color();
  for (const kind of kinds) {
    const geometry = geometryFor(kind, sim.diagnostics.tier === "low");
    const material = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      vertexColors: true,
      roughness: 0.68,
      metalness: kind === "car" || kind === "bus" || kind === "motorbike" ? 0.14 : 0.04,
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
  let diorama = false;
  let visible = true,
    disposed = false;
  const updateMatrices = (settings: LifeSettings) => {
    const hour = Number.isFinite(settings.hour ?? NaN) ? settings.hour! : 12,
      night = hour < 6 || hour >= 19,
      limit = capFor(sim.diagnostics.tier);
    let lampCount = 0;
    for (const kind of kinds) {
      const mesh = meshes.get(kind)!;
      const palette = variantPalettes[kind];
      const size = diorama ? (kind === "pedestrian" ? 2 : 1.6) : 1;
      let count = 0;
      (mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = 0;
      for (const agent of sim.agents)
        if (agent.active && agent.kind === kind && count < limit) {
          dummy.position.set(
            agent.x,
            agent.y + (kind === "pedestrian" || kind === "vendor" ? 0.32 : 0.22) * size,
            agent.z,
          );
          dummy.rotation.set(0, -agent.rotation - Math.PI / 2, 0);
          dummy.scale.setScalar(agent.fade * size);
          dummy.updateMatrix();
          const idx = count++;
          mesh.setMatrixAt(idx, dummy.matrix);
          mesh.setColorAt(idx, instanceColor.setHex(palette[agent.id % palette.length]!));
          if (
            night &&
            (kind === "motorbike" || kind === "car" || kind === "bus" || kind === "tricycle")
          ) {
            const front =
                kind === "bus"
                  ? 1.55
                  : kind === "motorbike"
                    ? 0.42
                    : kind === "tricycle"
                      ? 0.65
                      : 1.02,
              side =
                kind === "bus"
                  ? 0.44
                  : kind === "motorbike"
                    ? 0.1
                    : kind === "tricycle"
                      ? 0.2
                      : 0.31,
              c = Math.cos(agent.rotation),
              s = Math.sin(agent.rotation);
            for (const offset of [-side, side]) {
              lampDummy.position.set(
                agent.x + (c * offset + s * front) * size,
                agent.y + 0.34 * size,
                agent.z + (s * offset - c * front) * size,
              );
              lampDummy.rotation.set(0, -agent.rotation - Math.PI / 2, 0);
              lampDummy.scale.setScalar(agent.fade * size);
              lampDummy.updateMatrix();
              if (lampCount < max * 2) lamps.setMatrixAt(lampCount++, lampDummy.matrix);
            }
          }
        }
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
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
    setDiorama(enabled) {
      diorama = enabled;
    },
    setVisible(next) {
      visible = next;
      group.visible = next;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const mesh of meshes.values()) mesh.dispose();
      lamps.dispose();
      for (const geometry of geometries) geometry.dispose();
      for (const material of materials) material.dispose();
      group.removeFromParent();
      group.clear();
    },
  };
}
