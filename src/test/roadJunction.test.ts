import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildWorldMeshes } from "@/engine/world/buildWorldMeshes";
import type { Position2, RoadSegment, WorldData } from "@/world/schema";

function road(
  localId: string,
  polylineENU: Position2[],
  carriagewayWidth: number,
  overrides: Partial<RoadSegment> = {},
): RoadSegment {
  return {
    localId,
    polylineENU,
    connectorIds: [],
    roadClass: "residential",
    carriagewayWidth,
    elevationLayer: 0,
    structure: "surface",
    direction: "both",
    surface: "unknown",
    provenance: { source: "synthetic", quality: "synthetic" },
    ...overrides,
  };
}

function worldWithRoads(roads: RoadSegment[]): WorldData {
  return {
    manifest: {
      schemaVersion: "1.0",
      datasetRevision: "same-layer-road-junction-test",
      units: "metres",
      frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
      isSynthetic: true,
      chunks: [],
      assetHashes: {},
      licences: ["Synthetic fixture"],
      coverage: { quality: "synthetic", sourceCount: 1 },
    },
    roads,
    buildings: [],
    lots: [],
  };
}

function cross2d(a: Position2, b: Position2, point: Position2) {
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
}

function pointInTriangle(point: Position2, a: Position2, b: Position2, c: Position2) {
  const ab = cross2d(a, b, point);
  const bc = cross2d(b, c, point);
  const ca = cross2d(c, a, point);
  return (ab >= -1e-6 && bc >= -1e-6 && ca >= -1e-6) || (ab <= 1e-6 && bc <= 1e-6 && ca <= 1e-6);
}

function roadSurfaceCovers(
  bundle: ReturnType<typeof buildWorldMeshes>,
  point: Position2,
  y = 0.02,
) {
  let covered = false;
  bundle.layers.roads.traverse((object) => {
    if (covered || !(object instanceof THREE.Mesh)) return;
    const positions = object.geometry.getAttribute("position");
    for (let index = 0; index + 2 < positions.count; index += 3) {
      const a: Position2 = [positions.getX(index), positions.getZ(index)];
      const b: Position2 = [positions.getX(index + 1), positions.getZ(index + 1)];
      const c: Position2 = [positions.getX(index + 2), positions.getZ(index + 2)];
      if (
        Math.abs(positions.getY(index) - y) > 1e-4 ||
        Math.abs(positions.getY(index + 1) - y) > 1e-4 ||
        Math.abs(positions.getY(index + 2) - y) > 1e-4
      )
        continue;
      if (pointInTriangle(point, a, b, c)) {
        covered = true;
        return;
      }
    }
  });
  return covered;
}

function junctionPatches(bundle: ReturnType<typeof buildWorldMeshes>) {
  let count = 0;
  bundle.layers.roads.traverse((object) => {
    if (object instanceof THREE.Mesh) count += Number(object.userData["junctionPatchCount"] ?? 0);
  });
  return Array.from({ length: count }, (_, index) => index);
}

function build(roads: RoadSegment[]) {
  const materials: THREE.Material[] = [];
  const bundle = buildWorldMeshes(
    worldWithRoads(roads),
    (color, roughness = 0.82, metalness = 0) => {
      const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.push(material);
      return material;
    },
  );
  return {
    bundle,
    dispose() {
      bundle.dispose();
      materials.forEach((material) => material.dispose());
    },
  };
}

describe("road ribbon geometry and same-layer junction coverage", () => {
  it("preserves full road width at an internal straight polyline vertex", () => {
    const { bundle, dispose } = build([
      road(
        "straight",
        [
          [0, 0],
          [5, 0],
          [10, 0],
        ],
        4,
      ),
    ]);
    const mesh = bundle.group.getObjectByName("road:straight")?.children[0];
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    const positions = (mesh as THREE.Mesh).geometry.getAttribute("position");
    const middleZ: number[] = [];
    for (let index = 0; index < positions.count; index += 1) {
      if (Math.abs(positions.getX(index) - 5) < 1e-6) middleZ.push(positions.getZ(index));
    }
    expect(Math.max(...middleZ) - Math.min(...middleZ)).toBeCloseTo(4, 3);
    dispose();
  });

  it("fills a direction-changing node split without replacing the road source geometry", () => {
    const { bundle, dispose } = build([
      road(
        "west",
        [
          [-10, 0],
          [0, 0],
        ],
        4,
      ),
      road(
        "north",
        [
          [0, 0],
          [0, 10],
        ],
        4,
      ),
    ]);
    expect(junctionPatches(bundle)).toHaveLength(1);
    expect(roadSurfaceCovers(bundle, [0.05, -1.95])).toBe(true);
    const westRoad = bundle.group.getObjectByName("road:west")?.children[0] as THREE.Mesh;
    const positions = westRoad.geometry.getAttribute("position");
    const normals = westRoad.geometry.getAttribute("normal");
    const junctionTriangles = Number(westRoad.userData["junctionPatchTriangles"]);
    expect(normals.count).toBe(positions.count);
    for (let index = positions.count - junctionTriangles * 3; index < positions.count; index += 1) {
      expect(Number.isFinite(normals.getX(index))).toBe(true);
      expect(Number.isFinite(normals.getY(index))).toBe(true);
      expect(Number.isFinite(normals.getZ(index))).toBe(true);
      expect(normals.getY(index)).toBeGreaterThan(0.99);
    }
    dispose();
  });

  it("fills T, Y, and unequal-width shared endpoint joins", () => {
    const fixtures = [
      {
        name: "T",
        roads: [
          road(
            "t-west",
            [
              [-10, 0],
              [0, 0],
            ],
            8,
          ),
          road(
            "t-east",
            [
              [0, 0],
              [10, 0],
            ],
            2,
          ),
          road(
            "t-north",
            [
              [0, 0],
              [0, 10],
            ],
            2,
          ),
        ],
        gapSample: [0.05, -3.75] as Position2,
      },
      {
        name: "Y",
        roads: [
          road(
            "y-west",
            [
              [-10, 0],
              [0, 0],
            ],
            4,
          ),
          road(
            "y-north-east",
            [
              [0, 0],
              [5, 8.66],
            ],
            4,
          ),
          road(
            "y-south-east",
            [
              [0, 0],
              [5, -8.66],
            ],
            4,
          ),
        ],
        gapSample: [0, 0] as Position2,
      },
      {
        name: "unequal widths",
        roads: [
          road(
            "wide-west",
            [
              [-10, 0],
              [0, 0],
            ],
            12,
          ),
          road(
            "narrow-east",
            [
              [0, 0],
              [10, 0],
            ],
            2,
          ),
          road(
            "narrow-north-east",
            [
              [0, 0],
              [6, 10],
            ],
            2,
          ),
        ],
        gapSample: [0.05, -5.65] as Position2,
      },
    ];

    for (const fixture of fixtures) {
      const { bundle, dispose } = build(fixture.roads);
      expect(junctionPatches(bundle), fixture.name).toHaveLength(1);
      expect(roadSurfaceCovers(bundle, fixture.gapSample), fixture.name).toBe(true);
      dispose();
    }
  });

  it("keeps a collinear split continuous without adding a degenerate junction patch", () => {
    const { bundle, dispose } = build([
      road(
        "west-through",
        [
          [-10, 0],
          [0, 0],
        ],
        4,
      ),
      road(
        "east-through",
        [
          [0, 0],
          [10, 0],
        ],
        4,
      ),
    ]);
    expect(junctionPatches(bundle)).toHaveLength(0);
    expect(roadSurfaceCovers(bundle, [0, 1.5])).toBe(true);
    dispose();
  });

  it("does not connect bridge, tunnel, different elevation layers, or distinct base elevations", () => {
    const { bundle, dispose } = build([
      road(
        "surface-ground",
        [
          [-10, 0],
          [0, 0],
        ],
        4,
        { elevationLayer: 0 },
      ),
      road(
        "surface-raised-layer",
        [
          [0, 0],
          [10, 0],
        ],
        4,
        { elevationLayer: 1 },
      ),
      road(
        "surface-raised-base",
        [
          [0, 0],
          [0, 10],
        ],
        4,
        { baseElevation: 0.22 },
      ),
      road(
        "bridge-a",
        [
          [0, 0],
          [0, -10],
        ],
        4,
        { structure: "bridge", elevationLayer: 0 },
      ),
      road(
        "bridge-b",
        [
          [0, 0],
          [10, -10],
        ],
        4,
        { structure: "bridge", elevationLayer: 0 },
      ),
      road(
        "tunnel-a",
        [
          [0, 0],
          [-10, -10],
        ],
        4,
        { structure: "tunnel", elevationLayer: 0 },
      ),
      road(
        "tunnel-b",
        [
          [0, 0],
          [-10, 10],
        ],
        4,
        { structure: "tunnel", elevationLayer: 0 },
      ),
    ]);
    expect(junctionPatches(bundle)).toHaveLength(0);
    dispose();
  });

  it("depth-biases road surface materials while retaining depth testing", () => {
    const { bundle, dispose } = build([
      road(
        "single-road",
        [
          [0, 0],
          [10, 0],
        ],
        4,
      ),
    ]);
    const mesh = bundle.group.getObjectByName("road:single-road")?.children[0];
    expect(mesh).toBeInstanceOf(THREE.Mesh);
    const material = (mesh as THREE.Mesh).material as THREE.MeshStandardMaterial;
    expect(material.polygonOffset).toBe(true);
    expect(material.polygonOffsetFactor).toBe(-1);
    expect(material.polygonOffsetUnits).toBe(-1);
    expect(material.depthTest).toBe(true);
    dispose();
  });
});
