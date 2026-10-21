import * as THREE from "three";
import type { PolygonBuilding, RoadSegment, TreeFeature, LandmarkProp } from "./districtModel";

/**
 * Procedural mesh builder for polygon-based districts.
 * Produces authentic Vietnamese urban forms: tube houses, tum rooftops,
 * awnings, balconies, curved road ribbons and alley networks.
 */

export interface DistrictMeshGroup {
  group: THREE.Group;
  disposables: { dispose: () => void }[];
}

export function buildBuildingMeshes(
  buildings: PolygonBuilding[],
  getMaterial: (
    color: string,
    roughness?: number,
    metalness?: number,
  ) => THREE.MeshStandardMaterial,
): DistrictMeshGroup {
  const root = new THREE.Group();
  root.name = "district-buildings";
  const disposables: { dispose: () => void }[] = [];

  for (const b of buildings) {
    if (b.polygon.length < 3) continue;

    // Build 2D shape in XZ plane (Three.js ExtrudeGeometry extrudes along Z, so we define in XY and rotate to XZ)
    const shape = new THREE.Shape();
    shape.moveTo(b.polygon[0]![0], -b.polygon[0]![1]);
    for (let i = 1; i < b.polygon.length; i++) {
      shape.lineTo(b.polygon[i]![0], -b.polygon[i]![1]);
    }
    shape.closePath();

    if (b.isHomeLot) {
      // Empty home lot: generate a perimeter boundary fence / corrugated barrier
      const fenceHeight = 2.2;
      const fenceGeo = new THREE.BufferGeometry();
      const vertices: number[] = [];
      for (let i = 0; i < b.polygon.length; i++) {
        const p1 = b.polygon[i]!;
        const p2 = b.polygon[(i + 1) % b.polygon.length]!;
        // Quad for fence segment
        vertices.push(
          p1[0],
          0,
          p1[1],
          p2[0],
          0,
          p2[1],
          p2[0],
          fenceHeight,
          p2[1],

          p1[0],
          0,
          p1[1],
          p2[0],
          fenceHeight,
          p2[1],
          p1[0],
          fenceHeight,
          p1[1],
        );
      }
      fenceGeo.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
      fenceGeo.computeVertexNormals();
      const fenceMat = getMaterial("#8a9689", 0.6, 0.4);
      const fenceMesh = new THREE.Mesh(fenceGeo, fenceMat);
      fenceMesh.castShadow = true;
      fenceMesh.receiveShadow = true;
      root.add(fenceMesh);
      disposables.push(fenceGeo);

      // Add gravel/ground pad for the empty lot
      const groundGeo = new THREE.ShapeGeometry(shape);
      groundGeo.rotateX(-Math.PI / 2);
      const groundMat = getMaterial("#c5b9a5", 0.9, 0.0);
      const groundMesh = new THREE.Mesh(groundGeo, groundMat);
      groundMesh.position.y = 0.04;
      groundMesh.receiveShadow = true;
      root.add(groundMesh);
      disposables.push(groundGeo);
      continue;
    }

    // Main wall extrusion
    const extrudeSettings: THREE.ExtrudeGeometryOptions = {
      depth: b.height,
      bevelEnabled: false,
    };
    const wallGeo = new THREE.ExtrudeGeometry(shape, extrudeSettings);
    wallGeo.rotateX(-Math.PI / 2); // align Z extrusion to positive Y
    disposables.push(wallGeo);

    const wallMat = getMaterial(b.wallColor, 0.75, 0.1);
    const wallMesh = new THREE.Mesh(wallGeo, wallMat);
    wallMesh.castShadow = true;
    wallMesh.receiveShadow = true;
    wallMesh.userData = { id: b.id, confidence: b.confidence, floors: b.floors };
    root.add(wallMesh);

    // Compute centroid of polygon for rooftop features
    let cx = 0;
    let cz = 0;
    for (const pt of b.polygon) {
      cx += pt[0];
      cz += pt[1];
    }
    cx /= b.polygon.length;
    cz /= b.polygon.length;

    // Rooftop structures based on roofType
    const roofColor = b.roofColor ?? (b.roofType === "corrugated" ? "#7e8c99" : "#9b4e3d");
    const roofMat = getMaterial(roofColor, 0.65, 0.2);

    if (b.roofType === "terrace_tum" || b.roofType === "flat") {
      // Parapet rim around roof edge
      const parapetGeo = new THREE.BufferGeometry();
      const pVerts: number[] = [];
      const pH = 0.8;
      for (let i = 0; i < b.polygon.length; i++) {
        const p1 = b.polygon[i]!;
        const p2 = b.polygon[(i + 1) % b.polygon.length]!;
        pVerts.push(
          p1[0],
          b.height,
          p1[1],
          p2[0],
          b.height,
          p2[1],
          p2[0],
          b.height + pH,
          p2[1],

          p1[0],
          b.height,
          p1[1],
          p2[0],
          b.height + pH,
          p2[1],
          p1[0],
          b.height + pH,
          p1[1],
        );
      }
      parapetGeo.setAttribute("position", new THREE.Float32BufferAttribute(pVerts, 3));
      parapetGeo.computeVertexNormals();
      const parapetMesh = new THREE.Mesh(parapetGeo, wallMat);
      root.add(parapetMesh);
      disposables.push(parapetGeo);

      if (b.roofType === "terrace_tum") {
        // Tum room (stairwell penthouse) on terrace
        const tumW = 2.6;
        const tumD = 3.2;
        const tumH = 2.5;
        const tumGeo = new THREE.BoxGeometry(tumW, tumH, tumD);
        tumGeo.translate(cx, b.height + tumH / 2, cz);
        const tumMesh = new THREE.Mesh(tumGeo, wallMat);
        tumMesh.castShadow = true;
        root.add(tumMesh);
        disposables.push(tumGeo);

        // Water tank on tum
        const tankGeo = new THREE.CylinderGeometry(0.55, 0.55, 1.2, 8);
        tankGeo.translate(cx + 0.8, b.height + tumH + 0.6, cz);
        const tankMat = getMaterial("#bdc7cc", 0.3, 0.8);
        const tankMesh = new THREE.Mesh(tankGeo, tankMat);
        root.add(tankMesh);
        disposables.push(tankGeo);
      }
    } else if (b.roofType === "gabled" || b.roofType === "corrugated") {
      // Pitched roof over the building
      const roofPeakH = 1.6;
      const roofGeo = new THREE.ConeGeometry(3.5, roofPeakH, 4);
      roofGeo.rotateY(Math.PI / 4);
      roofGeo.translate(cx, b.height + roofPeakH / 2, cz);
      const roofMesh = new THREE.Mesh(roofGeo, roofMat);
      roofMesh.castShadow = true;
      root.add(roofMesh);
      disposables.push(roofGeo);
    }

    // Shopfront awning (mái hiên di động) for ground floor shops
    if (b.shop && b.polygon.length >= 2) {
      const p1 = b.polygon[0]!;
      const p2 = b.polygon[1]!;
      const dx = p2[0] - p1[0];
      const dz = p2[1] - p1[1];
      const len = Math.hypot(dx, dz);
      if (len > 2) {
        const awningMat = getMaterial("#b23d2b", 0.5, 0.0);
        const awningGeo = new THREE.BoxGeometry(len * 0.9, 0.08, 1.4);
        const angle = Math.atan2(dx, dz);
        awningGeo.rotateY(angle + Math.PI / 2);
        awningGeo.translate((p1[0] + p2[0]) / 2, 2.9, (p1[1] + p2[1]) / 2);
        const awningMesh = new THREE.Mesh(awningGeo, awningMat);
        awningMesh.castShadow = true;
        root.add(awningMesh);
        disposables.push(awningGeo);
      }
    }

    // Balconies for upper floors
    if (b.balconies && b.floors >= 2 && b.polygon.length >= 2) {
      const p1 = b.polygon[0]!;
      const p2 = b.polygon[1]!;
      const dx = p2[0] - p1[0];
      const dz = p2[1] - p1[1];
      const len = Math.hypot(dx, dz);
      const angle = Math.atan2(dx, dz);

      for (let f = 1; f < b.floors; f++) {
        const floorY = f * 3.4;
        const balGeo = new THREE.BoxGeometry(len * 0.75, 0.15, 0.9);
        balGeo.rotateY(angle + Math.PI / 2);
        balGeo.translate((p1[0] + p2[0]) / 2, floorY, (p1[1] + p2[1]) / 2);
        const balMesh = new THREE.Mesh(balGeo, getMaterial("#e6dfd1", 0.8, 0.1));
        balMesh.castShadow = true;
        root.add(balMesh);
        disposables.push(balGeo);
      }
    }
  }

  return { group: root, disposables };
}

/** Build road ribbons, sidewalks and intersection polygons */
export function buildRoadMeshes(
  roads: RoadSegment[],
  getMaterial: (
    color: string,
    roughness?: number,
    metalness?: number,
  ) => THREE.MeshStandardMaterial,
): DistrictMeshGroup {
  const root = new THREE.Group();
  root.name = "district-roads";
  const disposables: { dispose: () => void }[] = [];

  for (const road of roads) {
    if (road.points.length < 2) continue;

    const roadColor = road.surface === "asphalt" ? "#4b524c" : "#838a84";
    const roadMat = getMaterial(roadColor, 0.88, 0.05);
    const sidewalkMat = getMaterial("#aba192", 0.92, 0.02);

    const halfW = road.width / 2;
    const totalHalfW = halfW + road.sidewalkWidth;

    const roadVerts: number[] = [];
    const walkLeftVerts: number[] = [];
    const walkRightVerts: number[] = [];

    for (let i = 0; i < road.points.length - 1; i++) {
      const p0 = road.points[i]!;
      const p1 = road.points[i + 1]!;
      const dx = p1[0] - p0[0];
      const dz = p1[1] - p0[1];
      const len = Math.hypot(dx, dz);
      if (len === 0) continue;

      const nx = -dz / len;
      const nz = dx / len;

      // Road surface (Y = 0.02 to avoid z-fighting with ground)
      const ry = 0.02;
      const r_p0L = [p0[0] + nx * halfW, ry, p0[1] + nz * halfW];
      const r_p0R = [p0[0] - nx * halfW, ry, p0[1] - nz * halfW];
      const r_p1L = [p1[0] + nx * halfW, ry, p1[1] + nz * halfW];
      const r_p1R = [p1[0] - nx * halfW, ry, p1[1] - nz * halfW];

      roadVerts.push(
        r_p0L[0]!,
        r_p0L[1]!,
        r_p0L[2]!,
        r_p1L[0]!,
        r_p1L[1]!,
        r_p1L[2]!,
        r_p1R[0]!,
        r_p1R[1]!,
        r_p1R[2]!,

        r_p0L[0]!,
        r_p0L[1]!,
        r_p0L[2]!,
        r_p1R[0]!,
        r_p1R[1]!,
        r_p1R[2]!,
        r_p0R[0]!,
        r_p0R[1]!,
        r_p0R[2]!,
      );

      // Sidewalks (elevated to Y = 0.12)
      if (road.sidewalkWidth > 0) {
        const swY = 0.12;
        // Left sidewalk
        const sL_outer0 = [p0[0] + nx * totalHalfW, swY, p0[1] + nz * totalHalfW];
        const sL_outer1 = [p1[0] + nx * totalHalfW, swY, p1[1] + nz * totalHalfW];
        const sL_inner0 = [p0[0] + nx * halfW, swY, p0[1] + nz * halfW];
        const sL_inner1 = [p1[0] + nx * halfW, swY, p1[1] + nz * halfW];

        walkLeftVerts.push(
          sL_outer0[0]!,
          sL_outer0[1]!,
          sL_outer0[2]!,
          sL_outer1[0]!,
          sL_outer1[1]!,
          sL_outer1[2]!,
          sL_inner1[0]!,
          sL_inner1[1]!,
          sL_inner1[2]!,

          sL_outer0[0]!,
          sL_outer0[1]!,
          sL_outer0[2]!,
          sL_inner1[0]!,
          sL_inner1[1]!,
          sL_inner1[2]!,
          sL_inner0[0]!,
          sL_inner0[1]!,
          sL_inner0[2]!,
        );

        // Right sidewalk
        const sR_outer0 = [p0[0] - nx * totalHalfW, swY, p0[1] - nz * totalHalfW];
        const sR_outer1 = [p1[0] - nx * totalHalfW, swY, p1[1] - nz * totalHalfW];
        const sR_inner0 = [p0[0] - nx * halfW, swY, p0[1] - nz * halfW];
        const sR_inner1 = [p1[0] - nx * halfW, swY, p1[1] - nz * halfW];

        walkRightVerts.push(
          sR_inner0[0]!,
          sR_inner0[1]!,
          sR_inner0[2]!,
          sR_inner1[0]!,
          sR_inner1[1]!,
          sR_inner1[2]!,
          sR_outer1[0]!,
          sR_outer1[1]!,
          sR_outer1[2]!,

          sR_inner0[0]!,
          sR_inner0[1]!,
          sR_inner0[2]!,
          sR_outer1[0]!,
          sR_outer1[1]!,
          sR_outer1[2]!,
          sR_outer0[0]!,
          sR_outer0[1]!,
          sR_outer0[2]!,
        );
      }
    }

    if (roadVerts.length > 0) {
      const roadGeo = new THREE.BufferGeometry();
      roadGeo.setAttribute("position", new THREE.Float32BufferAttribute(roadVerts, 3));
      roadGeo.computeVertexNormals();
      const roadMesh = new THREE.Mesh(roadGeo, roadMat);
      roadMesh.receiveShadow = true;
      root.add(roadMesh);
      disposables.push(roadGeo);
    }

    const swVerts = [...walkLeftVerts, ...walkRightVerts];
    if (swVerts.length > 0) {
      const swGeo = new THREE.BufferGeometry();
      swGeo.setAttribute("position", new THREE.Float32BufferAttribute(swVerts, 3));
      swGeo.computeVertexNormals();
      const swMesh = new THREE.Mesh(swGeo, sidewalkMat);
      swMesh.receiveShadow = true;
      root.add(swMesh);
      disposables.push(swGeo);
    }
  }

  return { group: root, disposables };
}

/** Build trees and street props */
export function buildEnvironmentProps(
  trees: TreeFeature[],
  props: LandmarkProp[],
  getMaterial: (
    color: string,
    roughness?: number,
    metalness?: number,
  ) => THREE.MeshStandardMaterial,
): DistrictMeshGroup {
  const root = new THREE.Group();
  root.name = "district-props";
  const disposables: { dispose: () => void }[] = [];

  // Trees
  const trunkGeo = new THREE.CylinderGeometry(0.2, 0.28, 2.5, 6);
  const foliageGeo = new THREE.DodecahedronGeometry(1.6);
  disposables.push(trunkGeo, foliageGeo);

  const trunkMat = getMaterial("#5c4636", 0.9, 0.0);
  const foliageMat = getMaterial("#3f6b47", 0.7, 0.0);

  const treeGroup = new THREE.Group();
  treeGroup.name = "tree-layer";

  for (const t of trees) {
    const tRoot = new THREE.Group();
    tRoot.position.set(t.x, 0, t.z);

    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.y = 1.25;
    trunk.castShadow = true;
    tRoot.add(trunk);

    const foliage = new THREE.Mesh(foliageGeo, foliageMat);
    foliage.position.y = 2.8;
    foliage.castShadow = true;
    tRoot.add(foliage);

    treeGroup.add(tRoot);
  }
  root.add(treeGroup);

  // Street lights and electric poles
  const poleGeo = new THREE.CylinderGeometry(0.08, 0.12, 6.5, 6);
  const lampGeo = new THREE.BoxGeometry(0.3, 0.15, 0.6);
  disposables.push(poleGeo, lampGeo);

  const poleMat = getMaterial("#7d848c", 0.4, 0.6);
  const lampMat = getMaterial("#f2edd7", 0.2, 0.2);

  for (const p of props) {
    if (p.kind === "street_light" || p.kind === "electric_pole") {
      const pole = new THREE.Mesh(poleGeo, poleMat);
      pole.position.set(p.x, 3.25, p.z);
      pole.castShadow = true;
      root.add(pole);

      const lamp = new THREE.Mesh(lampGeo, lampMat);
      lamp.position.set(p.x, 6.2, p.z);
      root.add(lamp);
    }
  }

  return { group: root, disposables };
}
