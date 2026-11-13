import * as THREE from "three";
import type {
  PlannedProp,
  PlannedTree,
  SurroundingsPlan,
} from "@/world/enrichment/planSurroundings";

/**
 * Instanced renderer for the surroundings plan: one InstancedMesh per (geometry, material) with
 * per-instance colour, so trees add 4 draw calls and street furniture 3, whatever the count.
 * Decorations are non-pickable and are never colliders.
 */
export interface SurroundingsMeshes {
  trees: THREE.Group;
  props: THREE.Group;
  meshes: THREE.InstancedMesh[];
  instanceCount: number;
  dispose: () => void;
}

interface Part {
  matrix: THREE.Matrix4;
  color: number;
}

const GREENS = [0x2f6341, 0x3e6e4d, 0x4e8249, 0x416b43];
const BLOSSOMS = [0xc85232, 0x9b5ea2, 0xd9a738];
const BIKE_COLOURS = [0xb33a3a, 0x2b2b2b, 0x2f5d9b, 0xe6e6e6, 0x9ea4a8, 0x6b2a2a];
const CART_COLOURS = [0x2f7d6b, 0xc9a227, 0xb5532f, 0x3f6fa8];
const UMBRELLA_COLOURS = [0xd24b3c, 0xe8b43a, 0x3a7bc8, 0xf2f2f2];

function pick<T>(list: readonly T[], seed: string): T {
  let hash = 0;
  for (let index = 0; index < seed.length; index++)
    hash = (Math.imul(hash, 31) + seed.charCodeAt(index)) | 0;
  return list[Math.abs(hash) % list.length]!;
}

const scratch = {
  position: new THREE.Vector3(),
  quaternion: new THREE.Quaternion(),
  scale: new THREE.Vector3(),
  up: new THREE.Vector3(0, 1, 0),
};

function compose(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0) {
  scratch.position.set(x, y, z);
  scratch.quaternion.setFromAxisAngle(scratch.up, yaw);
  scratch.scale.set(sx, sy, sz);
  return new THREE.Matrix4().compose(scratch.position, scratch.quaternion, scratch.scale);
}

/** Part placed in the prop's local frame (local +X along the heading). */
function local(
  base: THREE.Matrix4,
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
) {
  return base.clone().multiply(compose(x, y, z, sx, sy, sz));
}

function treeParts(tree: PlannedTree, trunk: Part[], broad: Part[], round: Part[], cone: Part[]) {
  const [x, z] = tree.position;
  const h = tree.height;
  const w = h * 0.3 + 0.5;
  const yaw = (tree.localId.length * 0.37) % (Math.PI * 2);
  trunk.push({ matrix: compose(x, h * 0.25, z, 0.32, h * 0.5, 0.32), color: 0x5e4632 });
  const green = pick(GREENS, tree.localId);
  switch (tree.archetype) {
    case "broadleaf":
      broad.push({ matrix: compose(x, h * 0.68, z, w, w * 0.55, w, yaw), color: green });
      break;
    case "round":
      round.push({ matrix: compose(x, h * 0.7, z, w * 0.9, w * 0.8, w * 0.9, yaw), color: green });
      break;
    case "flowering":
      round.push({
        matrix: compose(x, h * 0.66, z, w * 0.95, w * 0.6, w * 0.95, yaw),
        color: green,
      });
      round.push({
        matrix: compose(x, h * 0.84, z, w * 0.7, w * 0.4, w * 0.7, yaw + 0.6),
        color: pick(BLOSSOMS, `${tree.localId}|b`),
      });
      break;
    case "palm":
      cone.push({ matrix: compose(x, h * 0.86, z, w * 0.9, w * 0.35, w * 0.9, yaw), color: green });
      break;
    case "conifer":
      cone.push({
        matrix: compose(x, h * 0.66, z, w * 0.75, h * 0.6, w * 0.75, yaw),
        color: 0x2f6341,
      });
      break;
  }
}

function propParts(prop: PlannedProp, cylinder: Part[], box: Part[], cone: Part[]) {
  const [x, z] = prop.position;
  const base = compose(x, 0, z, 1, 1, 1, -prop.heading);
  switch (prop.kind) {
    case "electric_pole":
      cylinder.push({ matrix: local(base, 0, 3.5, 0, 0.26, 7, 0.26), color: 0x79766b });
      box.push({ matrix: local(base, 0, 6.6, 0, 0.09, 0.09, 1.2), color: 0x5a5a55 });
      box.push({ matrix: local(base, 0, 5.6, 0.22, 0.3, 0.55, 0.3), color: 0x6c716f });
      break;
    case "street_light":
      cylinder.push({ matrix: local(base, 0, 3.1, 0, 0.18, 6.2, 0.18), color: 0x69747a });
      box.push({ matrix: local(base, 0.55, 6.15, 0, 1.1, 0.08, 0.1), color: 0x454d52 });
      box.push({ matrix: local(base, 1.05, 6.05, 0, 0.58, 0.14, 0.38), color: 0xf3d99a });
      break;
    case "bench":
      box.push({ matrix: local(base, 0, 0.45, 0, 1.4, 0.08, 0.46), color: 0x8c5e3c });
      box.push({ matrix: local(base, 0, 0.7, -0.2, 1.4, 0.36, 0.07), color: 0x8c5e3c });
      box.push({ matrix: local(base, 0, 0.21, 0, 1.3, 0.42, 0.4), color: 0x454d52 });
      break;
    case "parked_motorbike": {
      const body = BIKE_COLOURS[prop.variant % BIKE_COLOURS.length]!;
      box.push({ matrix: local(base, 0, 0.42, 0, 1.75, 0.42, 0.34), color: body });
      box.push({ matrix: local(base, -0.15, 0.72, 0, 0.75, 0.12, 0.3), color: 0x222222 });
      box.push({ matrix: local(base, 0.72, 0.95, 0, 0.08, 0.08, 0.68), color: 0x333333 });
      box.push({ matrix: local(base, 0.7, 0.2, 0, 0.42, 0.4, 0.12), color: 0x1d1d1d });
      box.push({ matrix: local(base, -0.7, 0.2, 0, 0.42, 0.4, 0.12), color: 0x1d1d1d });
      break;
    }
    case "vendor_cart": {
      const bodyColour = CART_COLOURS[prop.variant % CART_COLOURS.length]!;
      box.push({ matrix: local(base, 0, 0.62, 0, 1.4, 0.75, 0.8), color: bodyColour });
      box.push({ matrix: local(base, 0, 1.05, 0, 1.3, 0.1, 0.7), color: 0xe9e2d0 });
      cylinder.push({ matrix: local(base, 0, 1.65, 0, 0.05, 1.3, 0.05), color: 0x8a8a8a });
      cone.push({
        matrix: local(base, 0, 2.35, 0, 1.25, 0.45, 1.25),
        color: UMBRELLA_COLOURS[prop.variant % UMBRELLA_COLOURS.length]!,
      });
      break;
    }
  }
}

function instanced(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  parts: Part[],
): THREE.InstancedMesh | null {
  if (parts.length === 0) return null;
  const mesh = new THREE.InstancedMesh(geometry, material, parts.length);
  mesh.name = name;
  mesh.userData["nonPickable"] = true;
  mesh.userData["surroundings"] = true;
  // Decorations never intercept feature picking.
  mesh.raycast = () => {};
  const color = new THREE.Color();
  parts.forEach((part, index) => {
    mesh.setMatrixAt(index, part.matrix);
    mesh.setColorAt(index, color.setHex(part.color));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.computeBoundingSphere();
  mesh.computeBoundingBox();
  return mesh;
}

export function createSurroundingsMeshes(plan: SurroundingsPlan): SurroundingsMeshes {
  const trees = new THREE.Group();
  trees.name = "surroundings:trees";
  const props = new THREE.Group();
  props.name = "surroundings:props";
  const geometries = {
    trunk: new THREE.CylinderGeometry(0.35, 0.5, 1, 5),
    broad: new THREE.DodecahedronGeometry(1, 0),
    round: new THREE.IcosahedronGeometry(1, 0),
    cone: new THREE.ConeGeometry(1, 1, 7),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
    box: new THREE.BoxGeometry(1, 1, 1),
    umbrella: new THREE.ConeGeometry(1, 1, 8),
  };
  const treeMaterial = new THREE.MeshStandardMaterial({ roughness: 0.8, metalness: 0 });
  const propMaterial = new THREE.MeshStandardMaterial({ roughness: 0.6, metalness: 0.15 });

  const trunk: Part[] = [];
  const broad: Part[] = [];
  const round: Part[] = [];
  const canopyCone: Part[] = [];
  plan.trees.forEach((tree) => treeParts(tree, trunk, broad, round, canopyCone));
  const cylinder: Part[] = [];
  const box: Part[] = [];
  const umbrella: Part[] = [];
  plan.props.forEach((prop) => propParts(prop, cylinder, box, umbrella));

  const meshes: THREE.InstancedMesh[] = [];
  const add = (group: THREE.Group, mesh: THREE.InstancedMesh | null) => {
    if (!mesh) return;
    group.add(mesh);
    meshes.push(mesh);
  };
  add(trees, instanced("surroundings-tree-trunk", geometries.trunk, treeMaterial, trunk));
  add(trees, instanced("surroundings-tree-broad", geometries.broad, treeMaterial, broad));
  add(trees, instanced("surroundings-tree-round", geometries.round, treeMaterial, round));
  add(trees, instanced("surroundings-tree-cone", geometries.cone, treeMaterial, canopyCone));
  add(props, instanced("surroundings-prop-cylinder", geometries.cylinder, propMaterial, cylinder));
  add(props, instanced("surroundings-prop-box", geometries.box, propMaterial, box));
  add(props, instanced("surroundings-prop-cone", geometries.umbrella, propMaterial, umbrella));

  let disposed = false;
  return {
    trees,
    props,
    meshes,
    instanceCount: meshes.reduce((total, mesh) => total + mesh.count, 0),
    dispose() {
      if (disposed) return;
      disposed = true;
      trees.removeFromParent();
      props.removeFromParent();
      meshes.forEach((mesh) => mesh.dispose());
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      treeMaterial.dispose();
      propMaterial.dispose();
      trees.clear();
      props.clear();
    },
  };
}
