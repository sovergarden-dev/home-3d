import * as THREE from "three";
import {
  pointInPolygon,
  polygonsOf,
  ringWithoutClosure,
  signedRingArea,
  surfaceCentroid,
  surfaceIntersects,
} from "@/world/geometry";
import { assessWallHeight } from "@/world/wallHeight";
import type { BuildingPart, SurfaceGeometry, WorldData } from "@/world/schema";

export type DetailTier = "low" | "mid" | "high";
type Shape = "box" | "cylinder" | "sphere";
interface Instance {
  shape: Shape;
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  angle: number;
  color: number;
  tilt?: THREE.Quaternion;
}
export interface DetailPlan {
  instances: Instance[];
  categories: string[];
  tier: DetailTier;
  seed: number;
}
const budgets: Record<DetailTier, { features: number; instances: number }> = {
  low: { features: 12, instances: 500 },
  mid: { features: 40, instances: 1800 },
  high: { features: 80, instances: 3600 },
};
const footprint = (x: number, z: number, r: number): SurfaceGeometry => ({
  type: "Polygon",
  coordinates: [
    [
      [x - r, z - r],
      [x + r, z - r],
      [x + r, z + r],
      [x - r, z + r],
      [x - r, z - r],
    ],
  ],
});
const hash = (text: string, seed: number) => {
  let n = seed >>> 0;
  for (let i = 0; i < text.length; i++) n = Math.imul(n ^ text.charCodeAt(i), 16777619) >>> 0;
  return n;
};

/** Illustrative presentation only. It neither edits nor identifies canonical features. */
export function planIllustrativeDetails(
  world: WorldData,
  tier: DetailTier,
  seed = 81273,
): DetailPlan {
  const instances: Instance[] = [],
    categories = new Set<string>(),
    limit = budgets[tier];
  let allocationLimit = Math.floor(limit.instances * 0.7);
  const exclusions = [footprint(0, 0, 10), ...world.lots.map((lot) => lot.geometry)];
  const put = (
    category: string,
    shape: Shape,
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    color: number,
    angle = 0,
    tilt?: THREE.Quaternion,
  ) => {
    if (instances.length >= allocationLimit || ![x, y, z, sx, sy, sz, angle].every(Number.isFinite))
      return;
    const area = footprint(x, z, Math.max(0.05, Math.hypot(sx, sz) / 2, tilt ? sy / 2 : 0));
    if (exclusions.some((geometry) => surfaceIntersects(area, geometry))) return;
    instances.push({ shape, x, y, z, sx, sy, sz, color, angle, ...(tilt ? { tilt } : {}) });
    categories.add(category);
  };
  const buildings = [...world.buildings]
    .filter((b) => !b.hidden)
    .flatMap<BuildingPart>((building) =>
      building.parts?.length
        ? building.parts.map((part) => ({
            ...part,
            baseElevation: part.baseElevation ?? building.baseElevation ?? 0,
          }))
        : [building],
    )
    .sort((a, b) => a.localId.localeCompare(b.localId));
  for (const building of buildings.slice(0, limit.features)) {
    const height = assessWallHeight(building, world.manifest.isSynthetic).renderedHeight;
    if (height < 2.5 || exclusions.some((g) => surfaceIntersects(building.geometry, g))) continue;
    const random = hash(building.localId, seed),
      polygon = polygonsOf(building.geometry)[0];
    if (!polygon) continue;
    const ring = ringWithoutClosure(polygon.coordinates[0] ?? []);
    const edges = ring
      .map((a, i) => ({ a, b: ring[(i + 1) % ring.length]! }))
      .filter(({ a, b }) => Math.hypot(b[0] - a[0], b[1] - a[1]) >= 2.4);
    if (!edges.length) continue;
    const { a, b } = edges[random % edges.length]!,
      length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    const ex = (b[0] - a[0]) / length,
      ez = (b[1] - a[1]) / length,
      sign = signedRingArea(ring) >= 0 ? 1 : -1,
      nx = ez * sign,
      nz = -ex * sign;
    const cx = (a[0] + b[0]) / 2,
      cz = (a[1] + b[1]) / 2,
      angle = -Math.atan2(ez, ex),
      base = building.baseElevation ?? 0,
      width = Math.min(length * 0.65, 4);
    const facade = (
      category: string,
      x: number,
      y: number,
      out: number,
      sx: number,
      sy: number,
      sz: number,
      color: number,
    ) =>
      put(
        category,
        "box",
        cx + ex * x + nx * out,
        base + y,
        cz + ez * x + nz * out,
        sx,
        sy,
        sz,
        color,
        angle,
      );
    facade("rolling-shutter", 0, 1.05, 0.06, width, 2.1, 0.1, 0x8b9391);
    for (let stripe = 0; stripe < 6; stripe++)
      facade("rolling-shutter", 0, 0.25 + stripe * 0.3, 0.13, width, 0.035, 0.04, 0x596764);
    facade(
      "generic-sign",
      0,
      2.35,
      0.18,
      width * 0.85,
      0.35,
      0.12,
      [0xb05537, 0x316e75, 0xb18a3e][random % 3]!,
    );
    for (let floor = 1; floor <= Math.min(4, Math.floor((height - 1) / 3)); floor++) {
      const y = floor * 3;
      facade("balcony", 0, y, 0.45, width, 0.16, 0.9, 0xccbca0);
      facade("iron-grille", 0, y + 0.9, 0.9, width, 0.08, 0.07, 0x465552);
      for (let bar = 0; bar < 5; bar++)
        facade("iron-grille", ((bar - 2) * width) / 5, y + 0.5, 0.9, 0.045, 0.9, 0.045, 0x465552);
      facade("air-conditioner", width * 0.35, y + 0.35, 0.4, 0.65, 0.45, 0.35, 0xd9d7cd);
      put(
        "plant-pot",
        "cylinder",
        cx - ex * width * 0.3 + nx * 0.5,
        base + y + 0.25,
        cz - ez * width * 0.3 + nz * 0.5,
        0.35,
        0.45,
        0.35,
        0xb36845,
      );
      put(
        "bougainvillea",
        "sphere",
        cx - ex * width * 0.3 + nx * 0.55,
        base + y + 0.7,
        cz - ez * width * 0.3 + nz * 0.55,
        0.8,
        0.7,
        0.65,
        0x487447,
      );
      for (let flower = 0; flower < 3; flower++)
        put(
          "bougainvillea",
          "sphere",
          cx - ex * width * 0.3 + nx * (0.75 + flower * 0.08),
          base + y + 0.55 + flower * 0.14,
          cz - ez * width * 0.3 + nz * 0.75,
          0.22,
          0.2,
          0.22,
          0xca5e86,
        );
    }
    const [tx, tz] = surfaceCentroid(building.geometry);
    if (polygonsOf(building.geometry).some((p) => pointInPolygon([tx, tz], p)))
      put(
        "water-tank",
        "cylinder",
        tx,
        base + height + (building.roofHeight ?? 0) + 0.7,
        tz,
        1.1,
        1.4,
        1.1,
        0xb3c0c0,
      );
  }
  allocationLimit = limit.instances;
  let streetCount = 0;
  for (const road of [...world.roads].sort((a, b) => a.localId.localeCompare(b.localId))) {
    for (
      let segment = 0;
      segment < road.polylineENU.length - 1 && streetCount < limit.features;
      segment++
    ) {
      const a = road.polylineENU[segment]!,
        b = road.polylineENU[segment + 1]!,
        length = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (length < 12) continue;
      const dx = (b[0] - a[0]) / length,
        dz = (b[1] - a[1]) / length,
        side = (road.carriagewayWidth ?? 5) / 2 + 1;
      const x = (a[0] + b[0]) / 2 + dz * side,
        z = (a[1] + b[1]) / 2 - dx * side;
      if (
        world.buildings.some((building) =>
          surfaceIntersects(footprint(x, z, 2.5), building.geometry),
        )
      )
        continue;
      const base = road.baseElevation ?? 0,
        random = hash(`${road.localId}:${segment}`, seed);
      put("electric-pole", "cylinder", x, base + 3.5, z, 0.15, 7, 0.15, 0x79766b);
      put(
        "street-light",
        "box",
        x + dz * 0.6,
        base + 6.2,
        z - dx * 0.6,
        0.14,
        0.12,
        1.3,
        0x8e9383,
        Math.atan2(dz, dx),
      );
      put("street-light", "sphere", x + dz, base + 6.05, z - dx, 0.28, 0.16, 0.35, 0xf3d99a);
      const endX = x + dx * Math.min(length * 0.45, 15),
        endZ = z + dz * Math.min(length * 0.45, 15);
      put("electric-pole", "cylinder", endX, base + 3.5, endZ, 0.15, 7, 0.15, 0x79766b);
      for (let step = 0; step < 8; step++) {
        const t0 = step / 8,
          t1 = (step + 1) / 8;
        const from = new THREE.Vector3(
          x + (endX - x) * t0,
          base + 6.6 - 0.8 * 4 * t0 * (1 - t0),
          z + (endZ - z) * t0,
        );
        const to = new THREE.Vector3(
          x + (endX - x) * t1,
          base + 6.6 - 0.8 * 4 * t1 * (1 - t1),
          z + (endZ - z) * t1,
        );
        const direction = to.clone().sub(from),
          mid = from.clone().add(to).multiplyScalar(0.5);
        const tilt = new THREE.Quaternion().setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction.clone().normalize(),
        );
        put(
          "sagging-wire",
          "cylinder",
          mid.x,
          mid.y,
          mid.z,
          0.035,
          direction.length(),
          0.035,
          0x424d48,
          0,
          tilt,
        );
      }
      const species = ["tamarind", "sao", "dau", "tropical-almond", "flamboyant"][random % 5]!;
      const tx = x - dx * 3,
        tz = z - dz * 3,
        h = species === "sao" || species === "dau" ? 7 : 5;
      put(species, "cylinder", tx, base + h / 2, tz, 0.25, h, 0.25, 0x856b4c);
      const layers = species === "tropical-almond" ? 3 : 2;
      for (let layer = 0; layer < layers; layer++) {
        const broad = species === "tamarind" || species === "flamboyant";
        put(
          species,
          "sphere",
          tx,
          base + h - 0.7 + layer * 0.7,
          tz,
          broad ? 4.6 : 3.4,
          1.4,
          broad ? 4.2 : 2.8,
          species === "flamboyant" && layer === 1
            ? 0xb96842
            : species === "dau"
              ? 0x416b43
              : 0x5b824a,
        );
      }
      streetCount++;
    }
  }
  return { instances, categories: [...categories].sort(), tier, seed };
}

export function createIllustrativeDetails(world: WorldData, tier: DetailTier) {
  const plan = planIllustrativeDetails(world, tier),
    group = new THREE.Group();
  group.name = "illustrative-details";
  group.userData["nonPickable"] = true;
  const geometries = {
    box: new THREE.BoxGeometry(1, 1, 1),
    cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 6),
    sphere: new THREE.SphereGeometry(0.5, 8, 5),
  };
  const material = new THREE.MeshStandardMaterial({ roughness: 0.85 });
  const dummy = new THREE.Object3D(),
    color = new THREE.Color(),
    meshes: THREE.InstancedMesh[] = [];
  for (const shape of ["box", "cylinder", "sphere"] as const) {
    const rows = plan.instances.filter((item) => item.shape === shape);
    if (!rows.length) continue;
    const mesh = new THREE.InstancedMesh(geometries[shape], material, rows.length);
    mesh.name = `illustrative-${shape}`;
    mesh.userData["nonPickable"] = true;
    rows.forEach((item, index) => {
      dummy.position.set(item.x, item.y, item.z);
      dummy.scale.set(item.sx, item.sy, item.sz);
      if (item.tilt) dummy.quaternion.copy(item.tilt);
      else dummy.rotation.set(0, item.angle, 0);
      dummy.updateMatrix();
      mesh.setMatrixAt(index, dummy.matrix);
      mesh.setColorAt(index, color.setHex(item.color));
    });
    mesh.computeBoundingSphere();
    group.add(mesh);
    meshes.push(mesh);
  }
  let disposed = false;
  return {
    group,
    instances: plan.instances.length,
    categories: plan.categories,
    dispose() {
      if (disposed) return;
      disposed = true;
      group.removeFromParent();
      for (const mesh of meshes) mesh.dispose();
      for (const geometry of Object.values(geometries)) geometry.dispose();
      material.dispose();
      group.clear();
    },
  };
}
