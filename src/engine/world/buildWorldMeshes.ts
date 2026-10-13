import * as THREE from "three";
import { polygonsOf, ringWithoutClosure, surfaceCentroid } from "@/world/geometry";
import type {
  Building,
  FrontageCandidate,
  Position2,
  RoadSegment,
  SurfaceGeometry,
  WorldData,
} from "@/world/schema";

type Disposable = { dispose: () => void };
type LayerName = "roads" | "buildings" | "trees" | "props" | "labels";

export interface WorldMeshBundle {
  group: THREE.Group;
  layers: Record<LayerName, THREE.Group>;
  setLayerVisible: (layer: LayerName, visible: boolean) => void;
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
) {
  if (building.hidden) return;
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
        roofType: part.roofType,
      }))
    : [
        {
          localId: building.localId,
          geometry: building.geometry,
          wallHeight: building.wallHeight,
          baseElevation,
          roofType: building.roofType,
        },
      ];

  for (const part of renderables) {
    const shell = createSurfaceMeshes(
      part.geometry,
      part.wallHeight,
      part.baseElevation,
      material,
      disposables,
    );
    shell.name = `building-part:${part.localId}`;
    if (part.roofType !== "flat" && part.roofType !== "terrace_tum") {
      shell.userData["roofFallback"] = "flat_cap";
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
  for (let index = 0; index < left.length - 1; index += 1) {
    const aLeft = left[index]!;
    const aRight = right[index]!;
    const bLeft = left[index + 1]!;
    const bRight = right[index + 1]!;
    positions.push(
      aLeft[0],
      y,
      aLeft[1],
      bLeft[0],
      y,
      bLeft[1],
      bRight[0],
      y,
      bRight[1],
      aLeft[0],
      y,
      aLeft[1],
      bRight[0],
      y,
      bRight[1],
      aRight[0],
      y,
      aRight[1],
    );
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  disposables.push(geometry);
  return mesh;
}

function addRoad(
  road: RoadSegment,
  group: THREE.Group,
  materialFactory: MaterialFactory,
  disposables: Disposable[],
) {
  if (road.polylineENU.length < 2 || !road.carriagewayWidth) return;
  const roadGroup = new THREE.Group();
  roadGroup.name = `road:${road.localId}`;
  roadGroup.userData = { localId: road.localId, elevationLayer: road.elevationLayer };
  const halfCarriageway = road.carriagewayWidth / 2;
  const left = offsetPolyline(road.polylineENU, halfCarriageway);
  const right = offsetPolyline(road.polylineENU, -halfCarriageway);
  roadGroup.add(
    createStrip(
      left,
      right,
      0.02 + road.elevationLayer * 0.01,
      materialFactory("#4c5551", 0.92, 0),
      disposables,
    ),
  );

  const [leftSidewalk = 0, rightSidewalk = 0] = road.sidewalkWidths ?? [];
  if (leftSidewalk > 0) {
    roadGroup.add(
      createStrip(
        offsetPolyline(road.polylineENU, halfCarriageway + leftSidewalk),
        left,
        0.12 + road.elevationLayer * 0.01,
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
        0.12 + road.elevationLayer * 0.01,
        materialFactory("#aaa393", 0.95, 0),
        disposables,
      ),
    );
  }
  group.add(roadGroup);
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

  world.roads.forEach((road) => addRoad(road, layers.roads, materialFactory, disposables));
  world.buildings.forEach((building) => {
    addBuilding(building, layers.buildings, materialFactory, disposables);
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
    dispose() {
      disposables.forEach((disposable) => disposable.dispose());
      group.removeFromParent();
      group.clear();
    },
  };
}
