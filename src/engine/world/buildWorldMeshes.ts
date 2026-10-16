import * as THREE from "three";
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

type Disposable = { dispose: () => void };
type LayerName = "roads" | "buildings" | "trees" | "props" | "labels";

export interface WorldMeshBundle {
  group: THREE.Group;
  layers: Record<LayerName, THREE.Group>;
  setLayerVisible: (layer: LayerName, visible: boolean) => void;
  setRoadWet: (wet: boolean) => void;
  dispose: () => void;
}

export type MaterialFactory = (
  color: string,
  roughness?: number,
  metalness?: number,
) => THREE.MeshStandardMaterial;

function colorFor(localId: string) {
  const palette = ["#d9c9b4", "#d4c4ad", "#c7d4c6", "#d8c1a8", "#c9d0d6", "#ded2bd"];
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
  const material = new THREE.MeshStandardMaterial({
    color: roofType === "corrugated" ? "#9aa3a8" : "#7b4a3d",
    roughness: roofType === "corrugated" ? 0.55 : 0.85,
    metalness: roofType === "corrugated" ? 0.3 : 0.02,
    side: THREE.DoubleSide,
  });
  const roof = new THREE.Mesh(roofGeometry, material);
  roof.name = "roof-prism";
  roof.userData = { roofType, approximation: `${roofType}_prism_approx` };
  roof.castShadow = true;
  roof.receiveShadow = true;
  disposables.push(roofGeometry, material);
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
  buildingGroup.userData = { localId: building.localId, quality: building.provenance.quality };
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
    const topY = part.baseElevation + renderedHeight;
    if (
      part.heightAssessment.status !== "unknown" &&
      (part.roofType === "gabled" || part.roofType === "hipped" || part.roofType === "corrugated")
    ) {
      const roof = addRoofPrism(part.geometry, topY, part.roofType, part.roofHeight, disposables);
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
  roadGroup.userData = { localId: road.localId, elevationLayer: road.elevationLayer };
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
  const trunk = new THREE.CylinderGeometry(0.16, 0.22, 2.5, 6);
  const foliage = new THREE.DodecahedronGeometry(1.4);
  const trunkMaterial = materialFactory("#614a37", 0.9, 0);
  const foliageMaterial = materialFactory("#3e6e4d", 0.75, 0);
  disposables.push(trunk, foliage);
  trees.forEach((tree) => {
    const root = new THREE.Group();
    root.name = `tree:${tree.localId}`;
    root.position.set(tree.position[0], 0, tree.position[1]);
    const treeHeight = tree.height ?? 4;
    const trunkMesh = new THREE.Mesh(trunk, trunkMaterial);
    trunkMesh.scale.y = treeHeight / 4;
    trunkMesh.position.y = treeHeight / 4;
    const canopy = new THREE.Mesh(foliage, foliageMaterial);
    canopy.position.y = treeHeight * 0.72;
    canopy.scale.setScalar(Math.max(0.75, treeHeight / 4));
    root.add(trunkMesh, canopy);
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
  const poleGeometry = new THREE.CylinderGeometry(0.08, 0.12, 6, 6);
  const lampGeometry = new THREE.BoxGeometry(0.35, 0.15, 0.55);
  const material = materialFactory("#69747a", 0.45, 0.5);
  disposables.push(poleGeometry, lampGeometry);
  props.forEach((prop) => {
    const root = new THREE.Group();
    root.name = `prop:${prop.localId}`;
    root.position.set(prop.position[0], 0, prop.position[1]);
    const pole = new THREE.Mesh(poleGeometry, material);
    pole.position.y = 3;
    root.add(pole);
    if (prop.kind === "street_light") {
      const lamp = new THREE.Mesh(lampGeometry, material);
      lamp.position.y = 5.9;
      root.add(lamp);
    }
    group.add(root);
  });
}

export function buildWorldMeshes(
  world: WorldData,
  materialFactory: MaterialFactory,
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
    );
    if (!building.hidden) {
      const centroid = surfaceCentroid(building.geometry);
      layers.labels.add(createLabelSprite(building.localId, centroid, disposables));
    }
  });
  world.lots.forEach((lot) => {
    if (lot.status !== "empty") return;
    const marker = createLabelSprite(lot.localId, surfaceCentroid(lot.geometry), disposables);
    marker.name = `label:${lot.localId}`;
    layers.labels.add(marker);
  });
  addTrees(world, layers.trees, materialFactory, disposables);
  addProps(world, layers.props, materialFactory, disposables);

  return {
    group,
    layers,
    setLayerVisible(layer, visible) {
      layers[layer].visible = visible;
    },
    setRoadWet(wet) {
      const roughness = wet ? 0.32 : 0.92;
      roadMeshes.forEach((mesh) => {
        if (mesh.material instanceof THREE.MeshStandardMaterial) {
          mesh.material.roughness = roughness;
        }
      });
    },
    dispose() {
      disposables.forEach((disposable) => disposable.dispose());
      group.removeFromParent();
      group.clear();
    },
  };
}
