import * as THREE from "three";
import { polygonsOf, ringWithoutClosure, signedRingArea, surfaceCentroid } from "@/world/geometry";
import type { Position2, SurfaceGeometry, WorldData } from "@/world/schema";

export const HANDCRAFTED_FOCAL_BUILDING_IDS = new Set([
  "building-focal-home",
  "building-focal-corner-ne",
  "building-focal-north-orange",
  "building-focal-north-awning",
  "building-focal-corner-se-teal",
]);

type Disposable = { dispose: () => void };

interface DetailBox {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  yaw: number;
  tiltX?: number;
  color: string;
}

interface LanternItem {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  color: string;
}

export interface FocalStreetscapeBundle {
  group: THREE.Group;
  setNight: (night: boolean) => void;
  setInspecting: (inspecting: boolean) => void;
}

interface FaceFrame {
  midX: number;
  midZ: number;
  ex: number;
  ez: number;
  nx: number;
  nz: number;
  length: number;
  yaw: number;
}

function resolveOutwardFace(
  geometry: SurfaceGeometry,
  targetNormalX: number,
  targetNormalZ: number,
): FaceFrame | null {
  const polygon = polygonsOf(geometry)[0];
  const outer = polygon?.coordinates[0];
  if (!outer) return null;
  const raw = ringWithoutClosure(outer);
  if (raw.length < 3) return null;
  const ccwSign = signedRingArea(raw) >= 0 ? 1 : -1;

  let best: { dot: number; frame: FaceFrame } | null = null;
  for (let i = 0; i < raw.length; i += 1) {
    const a = raw[i]!;
    const b = raw[(i + 1) % raw.length]!;
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const length = Math.hypot(dx, dz);
    if (length < 1.5) continue;
    const ex = dx / length;
    const ez = dz / length;
    const nx = ez * ccwSign;
    const nz = -ex * ccwSign;
    const dot = nx * targetNormalX + nz * targetNormalZ;
    if (!best || dot > best.dot) {
      best = {
        dot,
        frame: {
          midX: (a[0] + b[0]) * 0.5,
          midZ: (a[1] + b[1]) * 0.5,
          ex,
          ez,
          nx,
          nz,
          length,
          yaw: -Math.atan2(ez, ex),
        },
      };
    }
  }
  return best && best.dot > 0.4 ? best.frame : null;
}

function pushFaceBox(
  list: DetailBox[],
  face: FaceFrame,
  along: number,
  yCenter: number,
  outStart: number,
  outEnd: number,
  sx: number,
  sy: number,
  color: string,
  tiltX?: number,
) {
  const outMid = (outStart + outEnd) * 0.5;
  list.push({
    x: face.midX + face.ex * along + face.nx * outMid,
    y: yCenter,
    z: face.midZ + face.ez * along + face.nz * outMid,
    sx,
    sy,
    sz: Math.abs(outEnd - outStart),
    yaw: face.yaw,
    ...(tiltX !== undefined ? { tiltX } : {}),
    color,
  });
}

function buildDetailInstancedMesh(
  name: string,
  geometry: THREE.BufferGeometry,
  material: THREE.Material,
  items: readonly DetailBox[],
) {
  const mesh = new THREE.InstancedMesh(geometry, material, items.length);
  mesh.name = name;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => {};
  mesh.userData["nonPickable"] = true;

  const dummy = new THREE.Object3D();
  const euler = new THREE.Euler(0, 0, 0, "YXZ");
  const colorCache = new Map<string, THREE.Color>();
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    euler.set(item.tiltX ?? 0, item.yaw, 0, "YXZ");
    dummy.position.set(item.x, item.y, item.z);
    dummy.quaternion.setFromEuler(euler);
    dummy.scale.set(item.sx, item.sy, item.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    let color = colorCache.get(item.color);
    if (!color) {
      color = new THREE.Color(item.color);
      colorCache.set(item.color, color);
    }
    mesh.setColorAt(i, color);

    const halfXZ = (item.sx + item.sz) * 0.55;
    const halfY = (item.sy + item.sz) * 0.55;
    minX = Math.min(minX, item.x - halfXZ);
    maxX = Math.max(maxX, item.x + halfXZ);
    minY = Math.min(minY, item.y - halfY);
    maxY = Math.max(maxY, item.y + halfY);
    minZ = Math.min(minZ, item.z - halfXZ);
    maxZ = Math.max(maxZ, item.z + halfXZ);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  const bounds = new THREE.Box3(
    new THREE.Vector3(minX, minY, minZ),
    new THREE.Vector3(maxX, maxY, maxZ),
  );
  mesh.boundingBox = bounds;
  mesh.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  return mesh;
}

function buildLanternInstancedMesh(
  items: readonly LanternItem[],
  disposables: Disposable[],
): { mesh: THREE.InstancedMesh; material: THREE.MeshStandardMaterial } {
  const geo = new THREE.SphereGeometry(0.5, 10, 8);
  const material = new THREE.MeshStandardMaterial({
    color: "#ffffff",
    emissive: "#ff7b29",
    emissiveIntensity: 0.35,
    roughness: 0.45,
    metalness: 0.05,
  });
  const mesh = new THREE.InstancedMesh(geo, material, items.length);
  mesh.name = "focal-streetscape:lanterns";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.raycast = () => {};
  mesh.userData["nonPickable"] = true;

  const dummy = new THREE.Object3D();
  const colorCache = new Map<string, THREE.Color>();
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i]!;
    dummy.position.set(item.x, item.y, item.z);
    dummy.rotation.set(0, 0, 0);
    dummy.scale.set(item.sx, item.sy, item.sz);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);

    let color = colorCache.get(item.color);
    if (!color) {
      color = new THREE.Color(item.color);
      colorCache.set(item.color, color);
    }
    mesh.setColorAt(i, color);

    minX = Math.min(minX, item.x - item.sx);
    maxX = Math.max(maxX, item.x + item.sx);
    minY = Math.min(minY, item.y - item.sy);
    maxY = Math.max(maxY, item.y + item.sy);
    minZ = Math.min(minZ, item.z - item.sz);
    maxZ = Math.max(maxZ, item.z + item.sz);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  const bounds = new THREE.Box3(
    new THREE.Vector3(minX, minY, minZ),
    new THREE.Vector3(maxX, maxY, maxZ),
  );
  mesh.boundingBox = bounds;
  mesh.boundingSphere = bounds.getBoundingSphere(new THREE.Sphere());
  disposables.push(geo, material);
  return { mesh, material };
}

function addZebraCrosswalk(
  list: DetailBox[],
  centerX: number,
  centerZ: number,
  roadDirX: number,
  roadDirZ: number,
  crossingWidth: number,
  stripeCount = 6,
) {
  const len = Math.hypot(roadDirX, roadDirZ) || 1;
  const ux = roadDirX / len;
  const uz = roadDirZ / len;
  // Perpendicular across carriageway
  const px = -uz;
  const pz = ux;
  const yaw = -Math.atan2(pz, px);
  const step = crossingWidth / stripeCount;
  const stripeW = step * 0.52;
  const stripeLen = 2.6;
  const startOffset = -((stripeCount - 1) * step) * 0.5;
  for (let i = 0; i < stripeCount; i += 1) {
    const off = startOffset + i * step;
    list.push({
      x: centerX + px * off,
      y: 0.048,
      z: centerZ + pz * off,
      sx: stripeW,
      sy: 0.012,
      sz: stripeLen,
      yaw,
      color: "#ede8dc",
    });
  }
}

export function createFocalStreetscape(
  world: WorldData,
  disposables: Disposable[],
): FocalStreetscapeBundle | null {
  const byId = new Map(world.buildings.map((building) => [building.localId, building]));
  const home = byId.get("building-focal-home");
  if (!home) return null;

  const group = new THREE.Group();
  group.name = "focal-streetscape";
  group.userData = { nonPickable: true, illustrationOnly: true };

  const details: DetailBox[] = [];
  const lanterns: LanternItem[] = [];

  // 1. 58 Châu Văn Liêm (Cửa hàng Đèn Trang Trí Sang Sáng)
  const homeFrontGeo = home.parts?.[0]?.geometry ?? home.geometry;
  const homeFace = resolveOutwardFace(homeFrontGeo, -1, 0);
  if (homeFace) {
    const w = Math.min(homeFace.length * 0.92, 3.4);
    pushFaceBox(details, homeFace, 0, 1.35, 0.01, 0.08, w, 2.7, "#1e2625");
    pushFaceBox(details, homeFace, 0, 3.22, 0.02, 0.24, w * 1.02, 0.68, "#297485");
    pushFaceBox(details, homeFace, 0, 3.55, 0.02, 0.27, w * 1.03, 0.08, "#eef2f4");
    // Tall rooftop advertising board ("SANG SÁNG")
    pushFaceBox(details, homeFace, 0, 5.55, 0.03, 0.22, w * 0.96, 3.7, "#edf1f4");
    pushFaceBox(details, homeFace, 0, 6.25, 0.21, 0.28, w * 0.84, 0.62, "#c95342");
    pushFaceBox(details, homeFace, 0, 5.15, 0.21, 0.27, w * 0.86, 0.34, "#2f5f91");
    pushFaceBox(details, homeFace, 0, 4.45, 0.21, 0.27, w * 0.78, 0.28, "#2f5f91");
    for (let i = 0; i < 6; i += 1) {
      const along = -w * 0.36 + (i * w * 0.72) / 5;
      const out = i % 2 === 0 ? 0.38 : 0.28;
      lanterns.push({
        x: homeFace.midX + homeFace.ex * along + homeFace.nx * out,
        y: i % 2 === 0 ? 2.42 : 2.22,
        z: homeFace.midZ + homeFace.ez * along + homeFace.nz * out,
        sx: 0.34,
        sy: 0.44,
        sz: 0.34,
        color: i % 3 === 1 ? "#f4a438" : "#e33a2c",
      });
    }
  }

  // 2. Corner NE yard lot (green-and-white striped sidewalk tarp awning)
  const cornerNe = byId.get("building-focal-corner-ne");
  if (cornerNe) {
    const face = resolveOutwardFace(cornerNe.geometry, -1, 0);
    if (face) {
      const stripCount = 7;
      const span = Math.min(face.length * 0.72, 5.4);
      const step = span / stripCount;
      for (let i = 0; i < stripCount; i += 1) {
        const along = -span * 0.42 + (i + 0.5) * step;
        pushFaceBox(
          details,
          face,
          along,
          2.15,
          0.02,
          0.98,
          step * 0.94,
          0.08,
          i % 2 === 0 ? "#2d8a59" : "#e9efeb",
          0.26,
        );
      }
      pushFaceBox(details, face, 0, 1.85, 0.01, 0.07, face.length * 0.96, 3.6, "#7b837f");
    }
  }

  // 3. 62 Châu Văn Liêm (orange fascia + mint roller shutter + lanterns + rooftop planter)
  const northOrange = byId.get("building-focal-north-orange");
  if (northOrange) {
    const orangeGeo = northOrange.parts?.[0]?.geometry ?? northOrange.geometry;
    const face = resolveOutwardFace(orangeGeo, -1, 0);
    if (face) {
      const w = Math.min(face.length * 0.94, 3.6);
      pushFaceBox(details, face, 0, 1.32, 0.01, 0.08, w * 0.92, 2.52, "#4f8f74");
      pushFaceBox(details, face, 0, 2.95, 0.02, 0.62, w * 1.02, 0.56, "#de682a");
      pushFaceBox(details, face, 0, 4.75, 0.01, 0.14, w * 0.85, 1.25, "#676c63");
      const [rx, rz] = surfaceCentroid(orangeGeo);
      details.push({ x: rx, y: 6.75, z: rz, sx: 1.5, sy: 0.72, sz: 1.6, yaw: 0, color: "#4a7748" });
      for (let i = 0; i < 4; i += 1) {
        const along = -w * 0.34 + (i * w * 0.68) / 3;
        lanterns.push({
          x: face.midX + face.ex * along + face.nx * 0.42,
          y: 2.38,
          z: face.midZ + face.ez * along + face.nz * 0.42,
          sx: 0.28,
          sy: 0.36,
          sz: 0.28,
          color: i % 2 === 0 ? "#e64a35" : "#f2a93b",
        });
      }
    }
  }

  // 4. 64 Châu Văn Liêm (blue-white striped retractable awning + dark shop recess)
  const northAwning = byId.get("building-focal-north-awning");
  if (northAwning) {
    const face = resolveOutwardFace(
      northAwning.parts?.[0]?.geometry ?? northAwning.geometry,
      -1,
      0,
    );
    if (face) {
      const w = Math.min(face.length * 0.88, 6.8);
      const stripCount = 10;
      const step = w / stripCount;
      pushFaceBox(details, face, 0, 1.25, 0.01, 0.08, w * 0.92, 2.4, "#252927");
      pushFaceBox(details, face, 0, 3.25, 0.01, 0.14, w * 0.96, 0.72, "#8f6142");
      for (let i = 0; i < stripCount; i += 1) {
        const along = -w * 0.5 + (i + 0.5) * step;
        pushFaceBox(
          details,
          face,
          along,
          2.45,
          0.04,
          0.88,
          step * 0.94,
          0.09,
          i % 2 === 0 ? "#2e5d93" : "#ebf0f4",
          0.32,
        );
      }
    }
  }

  // 5. 5F Teal Corner Apartment (SE corner across Trần Hưng Đạo)
  const cornerSeTeal = byId.get("building-focal-corner-se-teal");
  if (cornerSeTeal) {
    const northFace = resolveOutwardFace(cornerSeTeal.geometry, 0, -1);
    const westFace = resolveOutwardFace(cornerSeTeal.geometry, -1, 0);
    for (const face of [northFace, westFace]) {
      if (!face) continue;
      const cols = Math.max(2, Math.floor(face.length / 2.2));
      const span = face.length * 0.82;
      const step = span / cols;
      pushFaceBox(details, face, 0, 1.45, 0.01, 0.09, span * 0.96, 2.75, "#8b2d26");
      for (let floor = 1; floor <= 4; floor += 1) {
        const y = 3.6 + (floor - 1) * 3.15;
        pushFaceBox(details, face, 0, y + 0.92, 0.02, 0.34, span * 0.92, 0.14, "#614635");
        for (let c = 0; c < cols; c += 1) {
          const along = -span * 0.5 + (c + 0.5) * step;
          pushFaceBox(details, face, along, y, 0.01, 0.08, step * 0.52, 1.55, "#2b3b42");
        }
      }
    }
    if (northFace) {
      pushFaceBox(
        details,
        northFace,
        -northFace.length * 0.46,
        8.2,
        0.02,
        0.18,
        0.45,
        16.0,
        "#cd5c40",
      );
    }
  }

  // Planted median strip along South Châu Văn Liêm (strictly South of z = 44.5 to clear junction & alley link)
  for (let i = 0; i < 6; i += 1) {
    const z0 = 46 + i * 14.5;
    const z1 = z0 + 13.0;
    const t0 = (z0 - 39.9) / 105.3;
    const t1 = (z1 - 39.9) / 105.3;
    const x0 = -13.87 + 16.87 * t0;
    const x1 = -13.87 + 16.87 * t1;
    const midX = (x0 + x1) * 0.5;
    const midZ = (z0 + z1) * 0.5;
    const dx = x1 - x0;
    const dz = z1 - z0;
    const len = Math.hypot(dx, dz);
    const yaw = -Math.atan2(dz, dx);
    details.push({ x: midX, y: 0.09, z: midZ, sx: len, sy: 0.16, sz: 2.3, yaw, color: "#cfd6ca" });
    details.push({
      x: midX,
      y: 0.16,
      z: midZ,
      sx: len - 0.5,
      sy: 0.09,
      sz: 1.7,
      yaw,
      color: "#4d7845",
    });
  }

  // Zebra crosswalks around Châu Văn Liêm × Trần Hưng Đạo intersection
  addZebraCrosswalk(details, 2.8, 18.7, 0.9998, -0.015, 7.6, 6);
  addZebraCrosswalk(details, -35.6, 19.3, -0.9998, 0.018, 7.6, 6);
  addZebraCrosswalk(details, -7.8, 1.5, -0.178, -0.984, 10.2, 7);
  addZebraCrosswalk(details, -19.8, 2.4, -0.189, -0.982, 10.2, 7);
  addZebraCrosswalk(details, -6.2, 28.4, 0.181, 0.983, 10.2, 7);
  addZebraCrosswalk(details, -25.2, 29.8, 0.15, 0.989, 10.2, 7);

  const unitBox = new THREE.BoxGeometry(1, 1, 1);
  const detailMaterial = new THREE.MeshStandardMaterial({ roughness: 0.82, metalness: 0.03 });
  disposables.push(unitBox, detailMaterial);
  if (details.length > 0) {
    group.add(
      buildDetailInstancedMesh("focal-streetscape:details", unitBox, detailMaterial, details),
    );
  }

  let lanternMaterial: THREE.MeshStandardMaterial | null = null;
  if (lanterns.length > 0) {
    const built = buildLanternInstancedMesh(lanterns, disposables);
    lanternMaterial = built.material;
    group.add(built.mesh);
  }

  return {
    group,
    setNight(night: boolean) {
      if (lanternMaterial) {
        lanternMaterial.emissiveIntensity = night ? 2.2 : 0.4;
      }
    },
    setInspecting(inspecting: boolean) {
      group.visible = !inspecting;
    },
  };
}
