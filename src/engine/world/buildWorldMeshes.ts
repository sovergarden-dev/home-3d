import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { FEATURE_PICK_LAYER } from "@/engine/interaction/featurePicking";
import {
  polygonsOf,
  ringWithoutClosure,
  surfaceCentroid,
  surfacePartitionCovers,
} from "@/world/geometry";
import type {
  Building,
  FrontageCandidate,
  Position2,
  RoadSegment,
  RoofType,
  SurfaceGeometry,
  WorldData,
} from "@/world/schema";
import { assessWallHeight } from "@/world/wallHeight";
import { confidenceColor } from "@/engine/confidence/wallConfidence";
import { createBuildingLabelBatches } from "@/engine/world/buildingLabels";

type Disposable = { dispose: () => void };
type LayerName = "roads" | "buildings" | "trees" | "props" | "labels";

export interface WorldMeshBundle {
  group: THREE.Group;
  layers: Record<LayerName, THREE.Group>;
  setLayerVisible: (layer: LayerName, visible: boolean) => void;
  setLabelLanguage: (language: "vi" | "en") => void;
  setRoadWet: (wet: boolean) => void;
  setAtmospherePresentation: (season: "dry" | "wet" | null, night: boolean) => void;
  setConfidenceVisible: (visible: boolean) => void;
  setSelectedFeature: (featureId: string | null) => void;
  dispose: () => void;
}

export type MaterialFactory = (
  color: string,
  roughness?: number,
  metalness?: number,
) => THREE.MeshStandardMaterial;

function colorFor(localId: string) {
  const palette = [
    "#d9c9b4",
    "#d4c4ad",
    "#c7d4c6",
    "#d8c1a8",
    "#c9d0d6",
    "#ded2bd",
    "#e2c89c",
    "#cfe0d8",
    "#e0c3b6",
    "#d7d4be",
  ];
  let hash = 0;
  for (const character of localId) hash = (Math.imul(hash, 31) + character.charCodeAt(0)) | 0;
  return palette[Math.abs(hash) % palette.length]!;
}

function shapeForPolygon(geometry: Extract<SurfaceGeometry, { type: "Polygon" }>) {
  const [outer, ...holes] = geometry.coordinates;
  if (!outer) throw new Error("WORLD_POLYGON_WITHOUT_OUTER_RING");
  const outerPoints = ringWithoutClosure(outer);
  const shape = new THREE.Shape();
  shape.moveTo(outerPoints[0]![0], -outerPoints[0]![1]);
  outerPoints.slice(1).forEach(([x, z]) => shape.lineTo(x, -z));
  shape.closePath();
  holes.forEach((hole) => {
    const holePoints = ringWithoutClosure(hole);
    const path = new THREE.Path();
    path.moveTo(holePoints[0]![0], -holePoints[0]![1]);
    holePoints.slice(1).forEach(([x, z]) => path.lineTo(x, -z));
    path.closePath();
    shape.holes.push(path);
  });
  return shape;
}

function createSurfaceMeshes(
  geometry: SurfaceGeometry,
  height: number,
  baseElevation: number,
  material: THREE.Material,
  disposables: Disposable[],
) {
  const group = new THREE.Group();
  for (const polygon of polygonsOf(geometry)) {
    const shape = shapeForPolygon(polygon);
    const extruded = new THREE.ExtrudeGeometry(shape, {
      depth: Math.max(height, 0.05),
      bevelEnabled: false,
    });
    extruded.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(extruded, material);
    mesh.position.y = baseElevation;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    disposables.push(extruded);
  }
  return group;
}

function attributeSignature(geometry: THREE.BufferGeometry) {
  return `${geometry.index ? "i" : "n"}:${Object.keys(geometry.attributes).sort().join(",")}`;
}

function bakeWorldGeometry(mesh: THREE.Mesh) {
  mesh.updateWorldMatrix(true, false);
  const geometry = mesh.geometry.clone();
  geometry.applyMatrix4(mesh.matrixWorld);
  return geometry;
}

function mergeStaticLayer(
  layer: THREE.Group,
  disposables: Disposable[],
  pickProxies: Set<THREE.Mesh>,
  mergedMeshes: THREE.Mesh[],
) {
  const sources: THREE.Mesh[] = [];
  layer.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh) return;
    if (Array.isArray(object.material) || object.userData["mergedStatic"]) return;
    sources.push(object);
  });

  const buckets = new Map<string, { material: THREE.Material; meshes: THREE.Mesh[] }>();
  for (const mesh of sources) {
    const material = mesh.material as THREE.Material;
    const key = [
      material.uuid,
      mesh.castShadow ? "c" : "",
      mesh.receiveShadow ? "r" : "",
      attributeSignature(mesh.geometry),
    ].join("|");
    const bucket = buckets.get(key);
    if (bucket) bucket.meshes.push(mesh);
    else buckets.set(key, { material, meshes: [mesh] });
  }

  const mergedGroup = new THREE.Group();
  mergedGroup.name = "merged-static";
  mergedGroup.userData["nonPickable"] = true;

  for (const [key, { material, meshes }] of buckets) {
    if (meshes.length < 2) continue;
    const baked = meshes.map(bakeWorldGeometry);
    let mergedGeometry: THREE.BufferGeometry | null = null;
    try {
      mergedGeometry = mergeGeometries(baked, false);
    } catch {
      mergedGeometry = null;
    }
    baked.forEach((geometry) => geometry.dispose());
    if (!mergedGeometry) continue;
    mergedGeometry.computeBoundingBox();
    mergedGeometry.computeBoundingSphere();
    const merged = new THREE.Mesh(mergedGeometry, material);
    merged.name = `merged:${material.uuid}`;
    merged.castShadow = meshes[0]!.castShadow;
    merged.receiveShadow = meshes[0]!.receiveShadow;
    merged.userData["mergedStatic"] = true;
    merged.userData["nonPickable"] = true;
    merged.userData["mergeKey"] = key;
    mergedGroup.add(merged);
    disposables.push(mergedGeometry);
    mergedMeshes.push(merged);
    for (const mesh of meshes) {
      mesh.layers.set(FEATURE_PICK_LAYER);
      mesh.userData["staticPickProxy"] = true;
      mesh.userData["mergeKey"] = key;
      pickProxies.add(mesh);
    }
  }

  if (mergedGroup.children.length > 0) layer.add(mergedGroup);
}

function roofMaterial(
  roofType: RoofType,
  cache: Map<string, THREE.MeshStandardMaterial>,
  disposables: Disposable[],
) {
  const corrugated = roofType === "corrugated";
  const key = corrugated ? "corrugated" : "tiled";
  let material = cache.get(key);
  if (!material) {
    material = new THREE.MeshStandardMaterial({
      color: corrugated ? "#9aa3a8" : "#7b4a3d",
      roughness: corrugated ? 0.55 : 0.85,
      metalness: corrugated ? 0.3 : 0.02,
      side: THREE.DoubleSide,
    });
    cache.set(key, material);
    disposables.push(material);
  }
  return material;
}

function footprintBounds(geometry: SurfaceGeometry) {
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (const polygon of polygonsOf(geometry)) {
    for (const [x, z] of ringWithoutClosure(polygon.coordinates[0] ?? [])) {
      if (x < minX) minX = x;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (z > maxZ) maxZ = z;
    }
  }
  return { minX, minZ, maxX, maxZ };
}

function isAxisAlignedRectangle(geometry: SurfaceGeometry): boolean {
  if (geometry.type !== "Polygon" || geometry.coordinates.length !== 1) return false;
  const points = ringWithoutClosure(geometry.coordinates[0] ?? []);
  if (points.length !== 4) return false;
  const xs = [...new Set(points.map(([x]) => x))];
  const zs = [...new Set(points.map(([, z]) => z))];
  if (xs.length !== 2 || zs.length !== 2) return false;
  const corners = new Set(points.map(([x, z]) => `${x},${z}`));
  return corners.size === 4 && xs.every((x) => zs.every((z) => corners.has(`${x},${z}`)));
}

// Explicitly approximated roof volumes for pitched roof types: a ridge prism over the
// footprint bounds. Tagged as `*_prism_approx` so UI/quality never treats it as a
// surveyed roof; unknown shapes keep the flat cap with a `flat_cap` fallback tag.
function addRoofPrism(
  geometry: SurfaceGeometry,
  topY: number,
  roofType: RoofType,
  requestedRoofHeight: number | undefined,
  material: THREE.MeshStandardMaterial,
  disposables: Disposable[],
) {
  // A bbox prism is footprint-safe only for a single, axis-aligned rectangle.
  // Holes, concavities, rotated outlines, and disjoint components retain the
  // ExtrudeGeometry flat cap instead of filling courtyard/open space.
  if (!isAxisAlignedRectangle(geometry)) return null;
  const { minX, minZ, maxX, maxZ } = footprintBounds(geometry);
  if (!Number.isFinite(minX)) return null;
  const spanX = maxX - minX;
  const spanZ = maxZ - minZ;
  if (spanX <= 0.6 || spanZ <= 0.6) return null;

  const alongX = spanX >= spanZ;
  const roofHeight =
    requestedRoofHeight === undefined
      ? Math.max(1.2, Math.min(4, Math.min(spanX, spanZ) * 0.35))
      : requestedRoofHeight;
  if (!Number.isFinite(roofHeight) || roofHeight <= 0) return null;
  const inset = Math.min(0.6, Math.min(spanX, spanZ) * 0.08);

  let eaveA: Position2;
  let eaveB: Position2;
  let eaveC: Position2;
  let eaveD: Position2;
  let ridge1: Position2;
  let ridge2: Position2;
  if (alongX) {
    const midZ = (minZ + maxZ) / 2;
    eaveA = [minX, minZ];
    eaveB = [maxX, minZ];
    eaveC = [maxX, maxZ];
    eaveD = [minX, maxZ];
    ridge1 = [minX + inset, midZ];
    ridge2 = [maxX - inset, midZ];
  } else {
    const midX = (minX + maxX) / 2;
    eaveA = [minX, minZ];
    eaveB = [minX, maxZ];
    eaveC = [maxX, maxZ];
    eaveD = [maxX, minZ];
    ridge1 = [midX, minZ + inset];
    ridge2 = [midX, maxZ - inset];
  }

  const top = topY;
  const apex = topY + roofHeight;
  const quad = (p1: Position2, p2: Position2, p3: Position2, p4: Position2) => [
    p1[0],
    top,
    p1[1],
    p2[0],
    top,
    p2[1],
    p3[0],
    apex,
    p3[1],
    p1[0],
    top,
    p1[1],
    p3[0],
    apex,
    p3[1],
    p4[0],
    apex,
    p4[1],
  ];
  const tri = (p1: Position2, p2: Position2, p3: Position2) => [
    p1[0],
    top,
    p1[1],
    p2[0],
    apex,
    p2[1],
    p3[0],
    top,
    p3[1],
  ];
  const positions = new Float32Array([
    ...quad(eaveA, eaveB, ridge2, ridge1),
    ...quad(eaveC, eaveD, ridge1, ridge2),
    ...tri(eaveA, ridge1, eaveD),
    ...tri(eaveB, eaveC, ridge2),
  ]);

  const roofGeometry = new THREE.BufferGeometry();
  roofGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  roofGeometry.computeVertexNormals();
  const roof = new THREE.Mesh(roofGeometry, material);
  roof.name = "roof-prism";
  roof.userData = { roofType, approximation: `${roofType}_prism_approx` };
  roof.castShadow = true;
  roof.receiveShadow = true;
  disposables.push(roofGeometry);
  return roof;
}

function candidateEdge(
  geometry: SurfaceGeometry,
  candidate: FrontageCandidate | undefined,
): [Position2, Position2] | null {
  if (!candidate || geometry.type !== "Polygon") return null;
  const ring = geometry.coordinates[candidate.ringIndex];
  if (!ring) return null;
  const points = ringWithoutClosure(ring);
  if (points.length < 2) return null;
  const start = points[candidate.edgeIndex];
  const end = points[(candidate.edgeIndex + 1) % points.length];
  return start && end ? ([start, end] as [Position2, Position2]) : null;
}

function addFrontageMarker(
  building: Building,
  group: THREE.Group,
  material: THREE.Material,
  disposables: Disposable[],
) {
  const edge = candidateEdge(building.geometry, building.frontageCandidates?.[0]);
  if (!edge) return;
  const [start, end] = edge;
  const points = [
    new THREE.Vector3(start[0], building.baseElevation ?? 0.04, start[1]),
    new THREE.Vector3(end[0], building.baseElevation ?? 0.04, end[1]),
  ];
  const geometry = new THREE.BufferGeometry().setFromPoints(points);
  const marker = new THREE.Line(geometry, material);
  marker.name = `frontage:${building.localId}`;
  group.add(marker);
  disposables.push(geometry);
}

function addBuilding(
  building: Building,
  group: THREE.Group,
  materialFactory: MaterialFactory,
  disposables: Disposable[],
  syntheticWorld: boolean,
  roofMaterials: Map<string, THREE.MeshStandardMaterial>,
) {
  if (building.hidden) return;
  if (
    building.parts?.length &&
    !surfacePartitionCovers(
      building.geometry,
      building.parts.map((part) => part.geometry),
    )
  ) {
    throw new Error("BUILDING_PARTS_DO_NOT_PARTITION_PARENT");
  }
  const buildingGroup = new THREE.Group();
  buildingGroup.name = `building:${building.localId}`;
  buildingGroup.userData = {
    localId: building.localId,
    quality: building.provenance.quality,
    featureId: building.localId,
    featureType: "building",
  };
  const material = materialFactory(colorFor(building.localId), 0.82, 0.04);
  const baseElevation = building.baseElevation ?? 0;
  const renderables = building.parts?.length
    ? building.parts.map((part) => ({
        localId: part.localId,
        geometry: part.geometry,
        wallHeight: part.wallHeight,
        baseElevation: part.baseElevation ?? baseElevation,
        roofHeight: part.roofHeight,
        roofType: part.roofType,
        heightAssessment: assessWallHeight(part, syntheticWorld),
      }))
    : [
        {
          localId: building.localId,
          geometry: building.geometry,
          wallHeight: building.wallHeight,
          baseElevation,
          roofHeight: building.roofHeight,
          roofType: building.roofType,
          heightAssessment: assessWallHeight(building, syntheticWorld),
        },
      ];

  for (const part of renderables) {
    const renderedHeight = part.heightAssessment.renderedHeight;
    const shell = createSurfaceMeshes(
      part.geometry,
      renderedHeight,
      part.baseElevation,
      material,
      disposables,
    );
    shell.name = `building-part:${part.localId}`;
    shell.userData["wallHeightStatus"] = part.heightAssessment.status;
    shell.userData["featureId"] = part.localId;
    shell.userData["featureType"] = building.parts?.length ? "building-part" : "building";
    if (building.parts?.length) shell.userData["parentFeatureId"] = building.localId;
    shell.userData["confidence"] = part.heightAssessment.status;
    const topY = part.baseElevation + renderedHeight;
    if (
      part.heightAssessment.status !== "unknown" &&
      (part.roofType === "gabled" || part.roofType === "hipped" || part.roofType === "corrugated")
    ) {
      const roof = addRoofPrism(
        part.geometry,
        topY,
        part.roofType,
        part.roofHeight,
        roofMaterial(part.roofType, roofMaterials, disposables),
        disposables,
      );
      if (roof) {
        roof.name = `roof:${part.localId}`;
        shell.add(roof);
        shell.userData["roofApproximation"] = roof.userData["approximation"];
      } else {
        shell.userData["roofFallback"] = "flat_cap_footprint_preserved";
      }
    } else if (part.heightAssessment.status === "unknown") {
      shell.userData["roofFallback"] = "height_unknown_footprint_only";
    } else if (part.roofType !== "flat" && part.roofType !== "terrace_tum") {
      shell.userData["roofFallback"] = "flat_cap_footprint_preserved";
    }
    buildingGroup.add(shell);
  }

  addFrontageMarker(building, buildingGroup, materialFactory("#475f5d", 0.55, 0.15), disposables);
  group.add(buildingGroup);
}

function normalized(vector: Position2): Position2 {
  const length = Math.hypot(vector[0], vector[1]);
  return length > 0 ? [vector[0] / length, vector[1] / length] : [0, 0];
}

function offsetPolyline(points: Position2[], offset: number) {
  return points.map((point, index) => {
    const previous = points[Math.max(0, index - 1)]!;
    const next = points[Math.min(points.length - 1, index + 1)]!;
    const before = normalized([point[0] - previous[0], point[1] - previous[1]]);
    const after = normalized([next[0] - point[0], next[1] - point[1]]);
    const beforeNormal: Position2 = [-before[1], before[0]];
    const afterNormal: Position2 = [-after[1], after[0]];
    const miter = normalized([beforeNormal[0] + afterNormal[0], beforeNormal[1] + afterNormal[1]]);
    const denominator = Math.abs(miter[0] * afterNormal[0] + miter[1] * afterNormal[1]);
    const miterLength =
      denominator > 1e-6
        ? Math.min(Math.abs(offset) / denominator, Math.abs(offset) * 4)
        : Math.abs(offset);
    const sign = offset < 0 ? -1 : 1;
    return [
      point[0] + miter[0] * miterLength * sign,
      point[1] + miter[1] * miterLength * sign,
    ] as Position2;
  });
}

function createStrip(
  left: Position2[],
  right: Position2[],
  y: number,
  material: THREE.Material,
  disposables: Disposable[],
) {
  const positions: number[] = [];
  const pushUpwardTriangle = (a: Position2, b: Position2, c: Position2) => {
    const signedArea = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const vertices = signedArea > 0 ? [a, c, b] : [a, b, c];
    for (const [x, z] of vertices) positions.push(x, y, z);
  };
  for (let index = 0; index < left.length - 1; index += 1) {
    const aLeft = left[index]!;
    const aRight = right[index]!;
    const bLeft = left[index + 1]!;
    const bRight = right[index + 1]!;
    pushUpwardTriangle(aLeft, bLeft, bRight);
    pushUpwardTriangle(aLeft, bRight, aRight);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  disposables.push(geometry);
  return mesh;
}

function roadDisplayElevation(road: RoadSegment) {
  const structuralLayer =
    road.structure === "tunnel"
      ? Math.min(road.elevationLayer, -1)
      : road.structure === "bridge"
        ? Math.max(road.elevationLayer, 1)
        : road.elevationLayer;
  return road.baseElevation ?? 0.02 + structuralLayer * 4.5;
}

const ROAD_NODE_TOLERANCE_METRES = 0.001;

type RoadEndpoint = {
  road: RoadSegment;
  atStart: boolean;
  point: Position2;
};

function cross2d(a: Position2, b: Position2, c: Position2) {
  return (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
}

function convexHull(points: Position2[]) {
  const sorted = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const unique = sorted.filter(
    (point, index) =>
      index === 0 ||
      Math.hypot(point[0] - sorted[index - 1]![0], point[1] - sorted[index - 1]![1]) > 1e-8,
  );
  if (unique.length < 3) return unique;

  const lower: Position2[] = [];
  unique.forEach((point) => {
    while (lower.length >= 2 && cross2d(lower.at(-2)!, lower.at(-1)!, point) <= 1e-8) {
      lower.pop();
    }
    lower.push(point);
  });

  const upper: Position2[] = [];
  [...unique].reverse().forEach((point) => {
    while (upper.length >= 2 && cross2d(upper.at(-2)!, upper.at(-1)!, point) <= 1e-8) {
      upper.pop();
    }
    upper.push(point);
  });
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

function polygonArea(points: Position2[]) {
  let twiceArea = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]!;
    const next = points[(index + 1) % points.length]!;
    twiceArea += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(twiceArea) / 2;
}

function appendUpwardTriangle(
  positions: number[],
  a: Position2,
  b: Position2,
  c: Position2,
  y: number,
) {
  const signedArea = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const vertices = signedArea > 0 ? [a, c, b] : [a, b, c];
  for (const [x, z] of vertices) positions.push(x, y, z);
}

function addRoadJunctionCoverage(roads: RoadSegment[], roadMeshes: Map<RoadSegment, THREE.Mesh>) {
  const endpointGroups: RoadEndpoint[][] = [];
  const endpointBuckets = new Map<string, Set<RoadEndpoint[]>>();
  const cellKey = (x: number, z: number) => `${x}:${z}`;

  roads.forEach((road) => {
    if (
      road.polylineENU.length < 2 ||
      !road.carriagewayWidth ||
      (road.structure !== undefined && road.structure !== "surface")
    )
      return;

    ([true, false] as const).forEach((atStart) => {
      const point = atStart ? road.polylineENU[0]! : road.polylineENU.at(-1)!;
      const cellX = Math.floor(point[0] / ROAD_NODE_TOLERANCE_METRES);
      const cellZ = Math.floor(point[1] / ROAD_NODE_TOLERANCE_METRES);
      let matchingGroup: RoadEndpoint[] | undefined;
      const seenGroups = new Set<RoadEndpoint[]>();

      for (let offsetX = -1; offsetX <= 1 && !matchingGroup; offsetX += 1) {
        for (let offsetZ = -1; offsetZ <= 1 && !matchingGroup; offsetZ += 1) {
          const candidates = endpointBuckets.get(cellKey(cellX + offsetX, cellZ + offsetZ));
          if (!candidates) continue;
          for (const candidate of candidates) {
            if (seenGroups.has(candidate)) continue;
            seenGroups.add(candidate);
            const anchor = candidate[0]!.point;
            if (
              Math.hypot(point[0] - anchor[0], point[1] - anchor[1]) <= ROAD_NODE_TOLERANCE_METRES
            ) {
              matchingGroup = candidate;
              break;
            }
          }
        }
      }

      const endpoint: RoadEndpoint = { road, atStart, point };
      if (!matchingGroup) {
        matchingGroup = [endpoint];
        endpointGroups.push(matchingGroup);
      } else {
        matchingGroup.push(endpoint);
      }

      const key = cellKey(cellX, cellZ);
      const bucket = endpointBuckets.get(key) ?? new Set<RoadEndpoint[]>();
      bucket.add(matchingGroup);
      endpointBuckets.set(key, bucket);
    });
  });

  const positionsByMesh = new Map<THREE.Mesh, number[]>();
  const patchesByMesh = new Map<THREE.Mesh, number>();
  const patchTrianglesByMesh = new Map<THREE.Mesh, number>();

  endpointGroups.forEach((endpoints) => {
    if (endpoints.length < 2) return;
    const byElevationLayer = new Map<number, RoadEndpoint[]>();
    endpoints.forEach((endpoint) => {
      const layerEndpoints = byElevationLayer.get(endpoint.road.elevationLayer) ?? [];
      layerEndpoints.push(endpoint);
      byElevationLayer.set(endpoint.road.elevationLayer, layerEndpoints);
    });

    byElevationLayer.forEach((layerEndpoints) => {
      const elevationGroups: Array<{ y: number; endpoints: RoadEndpoint[] }> = [];
      layerEndpoints.forEach((endpoint) => {
        const y = roadDisplayElevation(endpoint.road);
        const elevationGroup = elevationGroups.find(
          (candidate) => Math.abs(candidate.y - y) <= ROAD_NODE_TOLERANCE_METRES,
        );
        if (elevationGroup) elevationGroup.endpoints.push(endpoint);
        else elevationGroups.push({ y, endpoints: [endpoint] });
      });

      elevationGroups.forEach(({ y, endpoints: sameElevationEndpoints }) => {
        if (sameElevationEndpoints.length < 2) return;
        const boundaryPoints: Position2[] = [];
        sameElevationEndpoints.forEach(({ road, atStart }) => {
          const halfWidth = road.carriagewayWidth! / 2;
          const left = offsetPolyline(road.polylineENU, halfWidth);
          const right = offsetPolyline(road.polylineENU, -halfWidth);
          const endpointIndex = atStart ? 0 : road.polylineENU.length - 1;
          const leftPoint = left[endpointIndex];
          const rightPoint = right[endpointIndex];
          if (leftPoint && rightPoint) boundaryPoints.push(leftPoint, rightPoint);
        });

        const hull = convexHull(boundaryPoints);
        if (hull.length < 3 || polygonArea(hull) < 1e-3) return;
        const targetMesh = roadMeshes.get(sameElevationEndpoints[0]!.road);
        if (!targetMesh) return;

        const positions =
          positionsByMesh.get(targetMesh) ??
          Array.from(targetMesh.geometry.getAttribute("position").array);
        for (let index = 1; index < hull.length - 1; index += 1) {
          appendUpwardTriangle(positions, hull[0]!, hull[index]!, hull[index + 1]!, y);
        }
        positionsByMesh.set(targetMesh, positions);
        patchesByMesh.set(targetMesh, (patchesByMesh.get(targetMesh) ?? 0) + 1);
        patchTrianglesByMesh.set(
          targetMesh,
          (patchTrianglesByMesh.get(targetMesh) ?? 0) + hull.length - 2,
        );
      });
    });
  });

  positionsByMesh.forEach((positions, mesh) => {
    mesh.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    mesh.geometry.deleteAttribute("normal");
    mesh.geometry.computeVertexNormals();
    mesh.geometry.computeBoundingBox();
    mesh.geometry.computeBoundingSphere();
    mesh.userData["junctionPatchCount"] = patchesByMesh.get(mesh) ?? 0;
    mesh.userData["junctionPatchTriangles"] = patchTrianglesByMesh.get(mesh) ?? 0;
  });
}

function addRoad(
  road: RoadSegment,
  group: THREE.Group,
  materialFactory: MaterialFactory,
  disposables: Disposable[],
): THREE.Mesh | null {
  if (road.polylineENU.length < 2 || !road.carriagewayWidth) return null;
  const roadGroup = new THREE.Group();
  roadGroup.name = `road:${road.localId}`;
  roadGroup.userData = {
    localId: road.localId,
    elevationLayer: road.elevationLayer,
    featureId: road.localId,
    featureType: "road",
  };
  const halfCarriageway = road.carriagewayWidth / 2;
  const left = offsetPolyline(road.polylineENU, halfCarriageway);
  const right = offsetPolyline(road.polylineENU, -halfCarriageway);
  // Vertical placement: an explicit surveyed baseElevation wins; otherwise respect the tagged
  // structural layer for bridges and tunnels. This is only a display prior, never source fact.
  const y = roadDisplayElevation(road);
  const carriageway = createStrip(left, right, y, materialFactory("#4c5551", 0.92, 0), disposables);
  roadGroup.add(carriageway);

  const [leftSidewalk = 0, rightSidewalk = 0] = road.sidewalkWidths ?? [];
  if (leftSidewalk > 0) {
    roadGroup.add(
      createStrip(
        offsetPolyline(road.polylineENU, halfCarriageway + leftSidewalk),
        left,
        y + 0.1,
        materialFactory("#aaa393", 0.95, 0),
        disposables,
      ),
    );
  }
  if (rightSidewalk > 0) {
    roadGroup.add(
      createStrip(
        right,
        offsetPolyline(road.polylineENU, -(halfCarriageway + rightSidewalk)),
        y + 0.1,
        materialFactory("#aaa393", 0.95, 0),
        disposables,
      ),
    );
  }
  group.add(roadGroup);
  return carriageway;
}

function createLabelSprite(text: string, position: Position2, disposables: Disposable[]) {
  let material: THREE.SpriteMaterial;
  const canDrawText =
    typeof document !== "undefined" &&
    !(typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent));
  if (canDrawText) {
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");
    if (context) {
      canvas.width = 256;
      canvas.height = 48;
      context.fillStyle = "rgba(31, 42, 37, 0.82)";
      context.roundRect(0, 0, canvas.width, canvas.height, 10);
      context.fill();
      context.fillStyle = "#fffaf0";
      context.font = "600 20px system-ui";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText(text, canvas.width / 2, canvas.height / 2);
      const texture = new THREE.CanvasTexture(canvas);
      material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
      disposables.push(texture, material);
    } else {
      material = new THREE.SpriteMaterial({ color: "#385d52", depthWrite: false });
      disposables.push(material);
    }
  } else {
    material = new THREE.SpriteMaterial({ color: "#385d52", depthWrite: false });
    disposables.push(material);
  }
  const sprite = new THREE.Sprite(material);
  // three.js shares one geometry across every Sprite. Each renderer that draws it adds a
  // "dispose" listener holding that renderer's WebGL context, so a torn-down scene stays
  // reachable until the geometry is disposed. Disposing frees GPU buffers only; the next
  // renderer uploads it again.
  if (!disposables.includes(sprite.geometry)) disposables.push(sprite.geometry);
  sprite.position.set(position[0], 0.5, position[1]);
  sprite.scale.set(8, 1.5, 1);
  sprite.userData = { label: text };
  return sprite;
}

function addTrees(
  world: WorldData,
  group: THREE.Group,
  materialFactory: MaterialFactory,
  disposables: Disposable[],
) {
  const trees = world.trees ?? [];
  if (trees.length === 0) return;
  const trunk = new THREE.CylinderGeometry(0.14, 0.24, 2.5, 6);
  const palmTrunk = new THREE.CylinderGeometry(0.11, 0.19, 3.0, 6);
  const crownBroad = new THREE.DodecahedronGeometry(1.45, 0);
  const crownRound = new THREE.IcosahedronGeometry(1.3, 0);
  const crownCone = new THREE.ConeGeometry(1.35, 2.5, 7);
  const crownFrond = new THREE.ConeGeometry(1.6, 0.85, 6);
  const potGeo = new THREE.CylinderGeometry(0.45, 0.36, 0.42, 6);
  const trunkMaterial = materialFactory("#5e4632", 0.9, 0);
  const palmTrunkMaterial = materialFactory("#705941", 0.88, 0);
  const potMaterial = materialFactory("#9a5b3e", 0.85, 0);
  const foliageDark = materialFactory("#2f6341", 0.76, 0);
  const foliageMid = materialFactory("#3e6e4d", 0.75, 0);
  const foliageBright = materialFactory("#4e8249", 0.74, 0);
  const blossomFlamboyant = materialFactory("#c85232", 0.7, 0);
  const blossomLagerstroemia = materialFactory("#9b5ea2", 0.72, 0);
  const blossomCassia = materialFactory("#d9a738", 0.72, 0);
  disposables.push(trunk, palmTrunk, crownBroad, crownRound, crownCone, crownFrond, potGeo);
  trees.forEach((tree, index) => {
    const root = new THREE.Group();
    root.name = `tree:${tree.localId}`;
    root.position.set(tree.position[0], 0, tree.position[1]);
    const treeHeight = tree.height ?? 4.5;
    let hash = index * 17;
    for (const ch of tree.localId) hash = (Math.imul(hash, 31) + ch.charCodeAt(0)) | 0;
    const archetype = Math.abs(hash) % 6;

    // Concrete/terracotta street tree planter ring at the base
    const planter = new THREE.Mesh(potGeo, potMaterial);
    planter.position.y = 0.21;
    root.add(planter);

    if (archetype === 0) {
      // Bàng (Tropical Almond) — tiered pagoda horizontal crowns
      const trunkMesh = new THREE.Mesh(trunk, trunkMaterial);
      trunkMesh.scale.y = treeHeight / 3.8;
      trunkMesh.position.y = treeHeight * 0.32;
      root.add(trunkMesh);
      for (let tier = 0; tier < 3; tier++) {
        const tierMesh = new THREE.Mesh(crownBroad, tier === 1 ? foliageBright : foliageMid);
        tierMesh.userData["seasonalFoliage"] = true;
        const s = (treeHeight / 4.2) * (1.15 - tier * 0.24);
        tierMesh.scale.set(s * 1.35, s * 0.42, s * 1.35);
        tierMesh.position.y = treeHeight * (0.52 + tier * 0.21);
        root.add(tierMesh);
      }
    } else if (archetype === 1) {
      // Phượng vĩ (Flamboyant) — wide umbrella canopy with red-orange blossom clusters
      const trunkMesh = new THREE.Mesh(trunk, trunkMaterial);
      trunkMesh.scale.y = treeHeight / 4;
      trunkMesh.position.y = treeHeight * 0.28;
      const mainCanopy = new THREE.Mesh(crownBroad, foliageMid);
      mainCanopy.userData["seasonalFoliage"] = true;
      const s = Math.max(0.85, treeHeight / 3.8);
      mainCanopy.scale.set(s * 1.45, s * 0.55, s * 1.35);
      mainCanopy.position.y = treeHeight * 0.72;
      const topBlossom = new THREE.Mesh(crownRound, blossomFlamboyant);
      topBlossom.scale.set(s * 1.15, s * 0.38, s * 1.1);
      topBlossom.position.y = treeHeight * 0.9;
      root.add(trunkMesh, mainCanopy, topBlossom);
    } else if (archetype === 2) {
      // Sao đen / Dầu rái — tall straight trunk with layered conical/domed dark green crown
      const trunkMesh = new THREE.Mesh(trunk, trunkMaterial);
      trunkMesh.scale.set(0.95, treeHeight / 3.2, 0.95);
      trunkMesh.position.y = treeHeight * 0.38;
      const lowerCrown = new THREE.Mesh(crownCone, foliageDark);
      lowerCrown.userData["seasonalFoliage"] = true;
      const s = Math.max(0.8, treeHeight / 4);
      lowerCrown.scale.set(s * 1.05, s * 1.1, s * 1.05);
      lowerCrown.position.y = treeHeight * 0.74;
      const upperCrown = new THREE.Mesh(crownRound, foliageMid);
      upperCrown.userData["seasonalFoliage"] = true;
      upperCrown.scale.set(s * 0.75, s * 0.75, s * 0.75);
      upperCrown.position.y = treeHeight * 0.98;
      root.add(trunkMesh, lowerCrown, upperCrown);
    } else if (archetype === 3) {
      // Cau / Dừa cảnh (Areca Palm) — slender ringed trunk with radiating tropical frond crown
      const trunkMesh = new THREE.Mesh(palmTrunk, palmTrunkMaterial);
      trunkMesh.scale.y = treeHeight / 3.2;
      trunkMesh.position.y = treeHeight * 0.42;
      const frondLower = new THREE.Mesh(crownFrond, foliageBright);
      frondLower.userData["seasonalFoliage"] = true;
      const s = Math.max(0.8, treeHeight / 4);
      frondLower.scale.set(s * 1.15, s * 0.65, s * 1.15);
      frondLower.position.y = treeHeight * 0.84;
      const frondUpper = new THREE.Mesh(crownFrond, foliageMid);
      frondUpper.userData["seasonalFoliage"] = true;
      frondUpper.scale.set(s * 0.85, s * 0.8, s * 0.85);
      frondUpper.position.y = treeHeight * 0.96;
      frondUpper.rotation.y = Math.PI / 6;
      root.add(trunkMesh, frondLower, frondUpper);
    } else if (archetype === 4) {
      // Bằng lăng tím (Purple Crape Myrtle) — rounded multi-lobe crown with violet-purple blossoms
      const trunkMesh = new THREE.Mesh(trunk, trunkMaterial);
      trunkMesh.scale.y = treeHeight / 4;
      trunkMesh.position.y = treeHeight * 0.28;
      const baseCanopy = new THREE.Mesh(crownRound, foliageMid);
      baseCanopy.userData["seasonalFoliage"] = true;
      const s = Math.max(0.8, treeHeight / 4);
      baseCanopy.scale.set(s * 1.15, s * 0.85, s * 1.15);
      baseCanopy.position.y = treeHeight * 0.7;
      const purpleCrown = new THREE.Mesh(crownBroad, blossomLagerstroemia);
      purpleCrown.scale.set(s * 0.92, s * 0.55, s * 0.92);
      purpleCrown.position.y = treeHeight * 0.9;
      root.add(trunkMesh, baseCanopy, purpleCrown);
    } else {
      // Muồng hoàng yến / Me tây (Golden Shower / Tamarind) — multi-puff dome with golden accent
      const trunkMesh = new THREE.Mesh(trunk, trunkMaterial);
      trunkMesh.scale.y = treeHeight / 4;
      trunkMesh.position.y = treeHeight * 0.28;
      const s = Math.max(0.8, treeHeight / 4);
      const mainCanopy = new THREE.Mesh(crownBroad, foliageBright);
      mainCanopy.userData["seasonalFoliage"] = true;
      mainCanopy.scale.set(s * 1.25, s * 0.75, s * 1.2);
      mainCanopy.position.y = treeHeight * 0.72;
      const goldenPuff = new THREE.Mesh(crownRound, blossomCassia);
      goldenPuff.scale.set(s * 0.85, s * 0.45, s * 0.85);
      goldenPuff.position.y = treeHeight * 0.88;
      root.add(trunkMesh, mainCanopy, goldenPuff);
    }
    group.add(root);
  });
}

function addProps(
  world: WorldData,
  group: THREE.Group,
  materialFactory: MaterialFactory,
  disposables: Disposable[],
) {
  const props = world.props ?? [];
  if (props.length === 0) return;
  const poleGeometry = new THREE.CylinderGeometry(0.08, 0.13, 6.2, 6);
  const crossArmGeometry = new THREE.BoxGeometry(1.1, 0.09, 0.09);
  const transformerGeometry = new THREE.CylinderGeometry(0.22, 0.22, 0.65, 8);
  const lampArmGeometry = new THREE.BoxGeometry(0.1, 0.08, 1.1);
  const lampGeometry = new THREE.BoxGeometry(0.38, 0.14, 0.58);
  const benchSeatGeometry = new THREE.BoxGeometry(1.4, 0.08, 0.46);
  const benchBackGeometry = new THREE.BoxGeometry(1.4, 0.36, 0.07);
  const benchLegGeometry = new THREE.BoxGeometry(0.08, 0.42, 0.44);
  const material = materialFactory("#69747a", 0.45, 0.5);
  const darkMetal = materialFactory("#454d52", 0.5, 0.6);
  const woodMaterial = materialFactory("#8c5e3c", 0.8, 0.05);
  disposables.push(
    poleGeometry,
    crossArmGeometry,
    transformerGeometry,
    lampArmGeometry,
    lampGeometry,
    benchSeatGeometry,
    benchBackGeometry,
    benchLegGeometry,
  );
  props.forEach((prop) => {
    const root = new THREE.Group();
    root.name = `prop:${prop.localId}`;
    root.position.set(prop.position[0], 0, prop.position[1]);
    if (prop.kind === "bench") {
      const seat = new THREE.Mesh(benchSeatGeometry, woodMaterial);
      seat.position.y = 0.44;
      const back = new THREE.Mesh(benchBackGeometry, woodMaterial);
      back.position.set(0, 0.64, -0.2);
      const legL = new THREE.Mesh(benchLegGeometry, darkMetal);
      legL.position.set(-0.55, 0.21, 0);
      const legR = new THREE.Mesh(benchLegGeometry, darkMetal);
      legR.position.set(0.55, 0.21, 0);
      root.add(seat, back, legL, legR);
      group.add(root);
      return;
    }
    const pole = new THREE.Mesh(poleGeometry, material);
    pole.position.y = 3.1;
    root.add(pole);
    if (prop.kind === "electric_pole") {
      const arm1 = new THREE.Mesh(crossArmGeometry, darkMetal);
      arm1.position.y = 5.6;
      const arm2 = new THREE.Mesh(crossArmGeometry, darkMetal);
      arm2.position.y = 5.1;
      const transformer = new THREE.Mesh(transformerGeometry, darkMetal);
      transformer.position.set(0.28, 4.3, 0);
      root.add(arm1, arm2, transformer);
    }
    if (prop.kind === "street_light") {
      const arm = new THREE.Mesh(lampArmGeometry, darkMetal);
      arm.position.set(0, 5.85, 0.35);
      const lampMaterial = material.clone();
      disposables.push(lampMaterial);
      const lamp = new THREE.Mesh(lampGeometry, lampMaterial);
      lamp.userData["existingStreetLight"] = true;
      lamp.position.set(0, 5.8, 0.72);
      root.add(arm, lamp);
    }
    group.add(root);
  });
}

const ROAD_DISPLAY_NAMES: Record<string, { vi: string; en: string }> = {
  "road-main": { vi: "Đường chính", en: "Main Street" },
  "road-back": { vi: "Đường sau", en: "Back Lane" },
  "road-alley": { vi: "Hẻm bên", en: "Side Alley" },
  "road-deadend": { vi: "Hẻm cụt", en: "Cul-de-sac" },
};

const BUILDING_DISPLAY_NAMES: Record<string, { vi: string; en: string }> = {
  "building-neighbour-west": { vi: "Nhà ống 3 tầng", en: "3F Townhouse" },
  "building-neighbour-east": { vi: "Nhà phố 4 tầng", en: "4F Townhouse" },
  "building-corner-oblique": { vi: "Nhà góc mái ngói", en: "Corner Gabled House" },
  "building-courtyard": { vi: "Khu nhà sân trong", en: "Courtyard Block" },
  "building-multipolygon": { vi: "Cụm nhà xưởng nhỏ", en: "Workshop Cluster" },
};

function polylineMidpoint(points: Position2[]): Position2 {
  if (points.length === 0) return [0, 0];
  if (points.length === 1) return points[0]!;
  let total = 0;
  const lengths: number[] = [];
  for (let i = 0; i < points.length - 1; i++) {
    const seg = Math.hypot(points[i + 1]![0] - points[i]![0], points[i + 1]![1] - points[i]![1]);
    lengths.push(seg);
    total += seg;
  }
  const half = total / 2;
  let acc = 0;
  for (let i = 0; i < lengths.length; i++) {
    const seg = lengths[i]!;
    if (acc + seg >= half && seg > 0) {
      const t = (half - acc) / seg;
      return [
        points[i]![0] + (points[i + 1]![0] - points[i]![0]) * t,
        points[i]![1] + (points[i + 1]![1] - points[i]![1]) * t,
      ];
    }
    acc += seg;
  }
  return points[Math.floor(points.length / 2)]!;
}

function addHomeLotTreatment(
  world: WorldData,
  group: THREE.Group,
  materialFactory: MaterialFactory,
  disposables: Disposable[],
) {
  const turfMaterial = materialFactory("#b8c29b", 0.94, 0);
  const curbMaterial = materialFactory("#e7dfd0", 0.78, 0.02);
  const postMaterial = materialFactory("#385d52", 0.65, 0.08);
  const apronMaterial = materialFactory("#b9b1a1", 0.9, 0);
  const postGeo = new THREE.CylinderGeometry(0.11, 0.13, 0.58, 6);
  disposables.push(postGeo);

  for (const lot of world.lots) {
    if (!lot.confirmed || lot.status !== "empty") continue;
    const lotGroup = new THREE.Group();
    lotGroup.name = `lot:${lot.localId}`;
    lotGroup.userData = {
      localId: lot.localId,
      featureId: lot.localId,
      featureType: "lot",
      confidence: lot.provenance.quality,
    };

    const turf = createSurfaceMeshes(lot.geometry, 0.06, 0.01, turfMaterial, disposables);
    turf.name = `lot-surface:${lot.localId}`;
    lotGroup.add(turf);

    const outer = polygonsOf(lot.geometry)[0]?.coordinates[0];
    const corners = outer ? ringWithoutClosure(outer) : [];
    corners.forEach(([x, z], idx) => {
      const post = new THREE.Mesh(postGeo, postMaterial);
      post.position.set(x, 0.29, z);
      post.castShadow = true;
      lotGroup.add(post);

      const next = corners[(idx + 1) % corners.length];
      if (!next) return;
      const dx = next[0] - x;
      const dz = next[1] - z;
      const length = Math.hypot(dx, dz);
      if (length < 0.4) return;
      const isFrontEdge = idx === 0;
      if (isFrontEdge && length > 2.4) {
        const sideSpan = (length - 2.2) / 2;
        for (const sign of [-1, 1] as const) {
          const offset = (length / 2 - sideSpan / 2) * sign;
          const beamGeo = new THREE.BoxGeometry(sideSpan, 0.2, 0.16);
          disposables.push(beamGeo);
          const beam = new THREE.Mesh(beamGeo, curbMaterial);
          const midX = (x + next[0]) / 2 + (dx / length) * offset;
          const midZ = (z + next[1]) / 2 + (dz / length) * offset;
          beam.position.set(midX, 0.12, midZ);
          beam.rotation.y = -Math.atan2(dz, dx);
          lotGroup.add(beam);
        }
        const apronGeo = new THREE.BoxGeometry(2.2, 0.05, 1.3);
        disposables.push(apronGeo);
        const apron = new THREE.Mesh(apronGeo, apronMaterial);
        apron.position.set((x + next[0]) / 2, 0.04, (z + next[1]) / 2 - 0.6);
        apron.rotation.y = -Math.atan2(dz, dx);
        lotGroup.add(apron);
      } else {
        const beamGeo = new THREE.BoxGeometry(length, 0.2, 0.16);
        disposables.push(beamGeo);
        const beam = new THREE.Mesh(beamGeo, curbMaterial);
        beam.position.set((x + next[0]) / 2, 0.12, (z + next[1]) / 2);
        beam.rotation.y = -Math.atan2(dz, dx);
        lotGroup.add(beam);
      }
    });

    group.add(lotGroup);
  }
}

export function buildWorldMeshes(
  world: WorldData,
  materialFactory: MaterialFactory,
  labelLanguage?: "vi" | "en",
): WorldMeshBundle {
  const disposables: Disposable[] = [];
  const group = new THREE.Group();
  group.name = `world:${world.manifest.datasetRevision}`;
  const layers: Record<LayerName, THREE.Group> = {
    roads: new THREE.Group(),
    buildings: new THREE.Group(),
    trees: new THREE.Group(),
    props: new THREE.Group(),
    labels: new THREE.Group(),
  };
  Object.entries(layers).forEach(([name, layer]) => {
    layer.name = `layer:${name}`;
    group.add(layer);
  });

  const roadMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const roadMaterialFactory: MaterialFactory = (color, roughness = 0.82, metalness = 0) => {
    const key = `${color}:${roughness}:${metalness}`;
    let material = roadMaterials.get(key);
    if (!material) {
      material = materialFactory(color, roughness, metalness).clone();
      material.polygonOffset = true;
      material.polygonOffsetFactor = -1;
      material.polygonOffsetUnits = -1;
      roadMaterials.set(key, material);
      disposables.push(material);
    }
    return material;
  };
  const roadMeshes = new Map<RoadSegment, THREE.Mesh>();
  const roofMaterials = new Map<string, THREE.MeshStandardMaterial>();
  const pickProxies = new Set<THREE.Mesh>();
  const mergedStaticMeshes: THREE.Mesh[] = [];
  const confidenceOriginals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const confidenceVariants = new Map<string, THREE.Material>();
  let disposed = false;
  let confidenceVisible = false;
  let selectedFeatureId: string | null = null;
  const labelDisposables: Disposable[] = [];
  let currentLabelLanguage = labelLanguage;

  function clearLabels() {
    labelDisposables.forEach((d) => d.dispose());
    labelDisposables.length = 0;
    layers.labels.clear();
  }

  function rebuildLabels(lang: "vi" | "en" | undefined) {
    clearLabels();
    if (!lang) {
      const buildingLabels: Array<{ text: string; position: Position2 }> = [];
      world.buildings.forEach((building) => {
        if (!building.hidden) {
          buildingLabels.push({
            text: building.localId,
            position: surfaceCentroid(building.geometry),
          });
        }
      });
      const buildingLabelBatches = createBuildingLabelBatches(buildingLabels, labelDisposables);
      if (buildingLabelBatches) {
        layers.labels.add(buildingLabelBatches.group);
      } else {
        buildingLabels.forEach(({ text, position }) => {
          layers.labels.add(createLabelSprite(text, position, labelDisposables));
        });
      }
      world.lots.forEach((lot) => {
        if (lot.status !== "empty") return;
        const marker = createLabelSprite(
          lot.localId,
          surfaceCentroid(lot.geometry),
          labelDisposables,
        );
        marker.name = `label:${lot.localId}`;
        marker.userData["featureId"] = lot.localId;
        marker.userData["featureType"] = "lot";
        layers.labels.add(marker);
      });
      return;
    }

    const planLabels: Array<{ text: string; position: Position2 }> = [];
    world.roads.forEach((road) => {
      const mapped = ROAD_DISPLAY_NAMES[road.localId]?.[lang];
      const fallback =
        road.roadClass === "alley"
          ? lang === "vi"
            ? "Hẻm nội bộ"
            : "Alley"
          : lang === "vi"
            ? "Đường khu phố"
            : "Street";
      planLabels.push({
        text: mapped ?? fallback,
        position: polylineMidpoint(road.polylineENU),
      });
    });
    world.buildings.forEach((building) => {
      if (building.hidden) return;
      const mapped = BUILDING_DISPLAY_NAMES[building.localId]?.[lang];
      if (!mapped) return;
      planLabels.push({
        text: mapped,
        position: surfaceCentroid(building.geometry),
      });
    });

    const batches = createBuildingLabelBatches(planLabels, labelDisposables);
    if (batches) {
      layers.labels.add(batches.group);
    }
    planLabels.forEach(({ text, position }) => {
      if (!batches) {
        layers.labels.add(createLabelSprite(text, position, labelDisposables));
      } else {
        const tag = new THREE.Object3D();
        tag.position.set(position[0], 0.5, position[1]);
        tag.userData = { label: text };
        layers.labels.add(tag);
      }
    });
  }

  world.roads.forEach((road) => {
    const mesh = addRoad(road, layers.roads, roadMaterialFactory, disposables);
    if (mesh) roadMeshes.set(road, mesh);
  });
  addRoadJunctionCoverage(world.roads, roadMeshes);
  world.buildings.forEach((building) => {
    addBuilding(
      building,
      layers.buildings,
      materialFactory,
      disposables,
      world.manifest.isSynthetic,
      roofMaterials,
    );
  });
  addHomeLotTreatment(world, layers.buildings, materialFactory, disposables);
  mergeStaticLayer(layers.roads, disposables, pickProxies, mergedStaticMeshes);
  mergeStaticLayer(layers.buildings, disposables, pickProxies, mergedStaticMeshes);
  rebuildLabels(currentLabelLanguage);
  addTrees(world, layers.trees, materialFactory, disposables);
  addProps(world, layers.props, materialFactory, disposables);

  group.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.userData["mergedStatic"]) return;
    let owner: THREE.Object3D | null = object;
    while (owner && owner !== group && !owner.userData["featureId"]) owner = owner.parent;
    if (owner?.userData["featureId"]) confidenceOriginals.set(object, object.material);
  });

  function updatePresentation() {
    const inspecting = confidenceVisible || selectedFeatureId !== null;
    mergedStaticMeshes.forEach((mesh) => {
      mesh.visible = !inspecting;
    });
    pickProxies.forEach((mesh) => {
      mesh.layers.set(inspecting ? 0 : FEATURE_PICK_LAYER);
    });
    confidenceOriginals.forEach((original, mesh) => {
      let owner: THREE.Object3D | null = mesh;
      let status: "known" | "inferred" | "synthetic" | "unknown" | undefined;
      let selected = false;
      while (owner && owner !== group) {
        status ??= owner.userData["confidence"] as typeof status;
        if (selectedFeatureId !== null && owner.userData["featureId"] === selectedFeatureId)
          selected = true;
        owner = owner.parent;
      }
      if (!selected && !(confidenceVisible && status)) {
        mesh.material = original;
        return;
      }
      const variants = (Array.isArray(original) ? original : [original]).map((material) => {
        const key = `${material.uuid}:${confidenceVisible ? (status ?? "none") : "none"}:${selected}`;
        let variant = confidenceVariants.get(key);
        if (!variant) {
          variant = material.clone();
          if (variant instanceof THREE.MeshStandardMaterial) {
            if (confidenceVisible && status) variant.color.set(confidenceColor(status));
            if (selected) {
              variant.emissive.set("#c99422");
              variant.emissiveIntensity = 0.4;
            }
          }
          confidenceVariants.set(key, variant);
        }
        if (
          variant instanceof THREE.MeshStandardMaterial &&
          material instanceof THREE.MeshStandardMaterial
        )
          variant.roughness = material.roughness;
        return variant;
      });
      mesh.material = Array.isArray(original) ? variants : variants[0]!;
    });
  }

  return {
    group,
    layers,
    setLayerVisible(layer, visible) {
      layers[layer].visible = visible;
    },
    setLabelLanguage(language) {
      if (disposed || currentLabelLanguage === language) return;
      currentLabelLanguage = language;
      rebuildLabels(currentLabelLanguage);
    },
    setRoadWet(wet) {
      const roughness = wet ? 0.32 : 0.92;
      roadMeshes.forEach((mesh) => {
        const original = confidenceOriginals.get(mesh) ?? mesh.material;
        if (original instanceof THREE.MeshStandardMaterial) {
          original.roughness = roughness;
        }
      });
      updatePresentation();
    },
    setAtmospherePresentation(season, night) {
      layers.trees.traverse((object) => {
        if (
          object instanceof THREE.Mesh &&
          object.userData["seasonalFoliage"] &&
          object.material instanceof THREE.MeshStandardMaterial
        )
          object.material.color.set(
            season === "dry" ? "#7b8150" : season === "wet" ? "#366746" : "#3e6e4d",
          );
      });
      layers.props.traverse((object) => {
        if (
          object instanceof THREE.Mesh &&
          object.userData["existingStreetLight"] &&
          object.material instanceof THREE.MeshStandardMaterial
        ) {
          object.material.emissive.set(night ? "#ffd58a" : "#000000");
          object.material.emissiveIntensity = night ? 1 : 0;
        }
      });
    },
    setConfidenceVisible(visible) {
      confidenceVisible = visible;
      updatePresentation();
    },
    setSelectedFeature(featureId) {
      selectedFeatureId = featureId;
      updatePresentation();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearLabels();
      confidenceVariants.forEach((material) => material.dispose());
      disposables.forEach((disposable) => disposable.dispose());
      group.removeFromParent();
      group.clear();
    },
  };
}
