import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { buildWorldMeshes } from "@/engine/world/buildWorldMeshes";
import { surfaceAreaIntersects } from "@/world/geometry";
import { applyWorldOverrides } from "@/world/overrides";
import type { SurfaceGeometry, WorldData, WorldOverrideDocument } from "@/world/schema";
import { validateWorld } from "@/world/validate";

const provenance = { source: "synthetic" as const, quality: "synthetic" as const };
const manifest = {
  schemaVersion: "1.0" as const,
  datasetRevision: "synthetic-v4-test",
  units: "metres" as const,
  frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH" as const,
  isSynthetic: true,
  chunks: [],
  assetHashes: {},
  licences: ["CC0-1.0"],
  coverage: { quality: "synthetic" as const, sourceCount: 1 },
};

function rectangle(minX: number, minZ: number, maxX: number, maxZ: number): SurfaceGeometry {
  return {
    type: "Polygon",
    coordinates: [
      [
        [minX, minZ],
        [maxX, minZ],
        [maxX, maxZ],
        [minX, maxZ],
        [minX, minZ],
      ],
    ],
  };
}

const courtyard: SurfaceGeometry = {
  type: "Polygon",
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ],
    [
      [1, 1],
      [9, 1],
      [9, 9],
      [1, 9],
      [1, 1],
    ],
  ],
};

function building(
  localId: string,
  geometry: SurfaceGeometry,
  wallHeight: number,
  roofType: "flat" | "gabled" | "hipped" | "corrugated" = "flat",
) {
  return {
    localId,
    geometry,
    footprintKind: "footprint" as const,
    wallHeight,
    roofType,
    provenance,
  };
}

function world(buildings: WorldData["buildings"], lots: WorldData["lots"] = []): WorldData {
  return { manifest, roads: [], buildings, lots };
}

function material(color: string, roughness = 0.8, metalness = 0) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness });
}

function triangleContains(pointX: number, pointZ: number, a: number[], b: number[], c: number[]) {
  const cross = (p: number[], q: number[], r: number[]) =>
    (p[0]! - r[0]!) * (q[1]! - r[1]!) - (q[0]! - r[0]!) * (p[1]! - r[1]!);
  const point = [pointX, pointZ];
  const first = cross(point, a, b);
  const second = cross(point, b, c);
  const third = cross(point, c, a);
  const hasNegative = first < -1e-6 || second < -1e-6 || third < -1e-6;
  const hasPositive = first > 1e-6 || second > 1e-6 || third > 1e-6;
  return !(hasNegative && hasPositive);
}

function projectedTopArea(root: THREE.Object3D, y: number) {
  root.updateMatrixWorld(true);
  let area = 0;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || object.name.startsWith("roof:")) return;
    const positions = object.geometry.getAttribute("position");
    const indices = object.geometry.index;
    const count = indices?.count ?? positions.count;
    for (let index = 0; index < count; index += 3) {
      const vertex = (offset: number) => {
        const item = indices ? indices.getX(index + offset) : index + offset;
        return new THREE.Vector3()
          .fromBufferAttribute(positions, item)
          .applyMatrix4(object.matrixWorld);
      };
      const a = vertex(0);
      const b = vertex(1);
      const c = vertex(2);
      if (Math.abs(a.y - y) > 1e-4 || Math.abs(b.y - y) > 1e-4 || Math.abs(c.y - y) > 1e-4)
        continue;
      area += Math.abs((b.x - a.x) * (c.z - a.z) - (b.z - a.z) * (c.x - a.x)) / 2;
    }
  });
  return area;
}

function projectedRoofCovers(root: THREE.Object3D, pointX: number, pointZ: number) {
  root.updateMatrixWorld(true);
  let covered = false;
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !object.name.startsWith("roof:")) return;
    const positions = object.geometry.getAttribute("position");
    const indices = object.geometry.index;
    const count = indices?.count ?? positions.count;
    for (let index = 0; index < count; index += 3) {
      const vertex = (offset: number) => {
        const item = indices ? indices.getX(index + offset) : index + offset;
        return new THREE.Vector3()
          .fromBufferAttribute(positions, item)
          .applyMatrix4(object.matrixWorld);
      };
      const a = vertex(0);
      const b = vertex(1);
      const c = vertex(2);
      if (triangleContains(pointX, pointZ, [a.x, a.z], [b.x, b.z], [c.x, c.z])) covered = true;
    }
  });
  return covered;
}

describe("H6 V4 geometry and renderer regressions", () => {
  it("counts identical courtyard surfaces as 36 m² overlap in the real world validator", () => {
    const report = validateWorld(
      world(
        [building("building-courtyard", courtyard, 8)],
        [
          {
            localId: "lot-same-surface",
            geometry: courtyard,
            confirmed: true,
            status: "empty",
            provenance,
          },
        ],
      ),
    );

    expect(surfaceAreaIntersects(courtyard, courtyard)).toBe(true);
    expect(report.valid).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "BUILDING_INTERSECTS_CONFIRMED_EMPTY_LOT",
        featureIds: ["building-courtyard", "lot-same-surface"],
      }),
    );
  });

  it("detects same-height building parts with identical courtyard footprints as overlapping", () => {
    const parent = {
      ...building("building-parent", courtyard, 8),
      parts: [
        {
          localId: "part-a",
          geometry: courtyard,
          wallHeight: 8,
          roofType: "flat" as const,
          provenance,
        },
        {
          localId: "part-b",
          geometry: courtyard,
          wallHeight: 8,
          roofType: "flat" as const,
          provenance,
        },
      ],
    };
    const report = validateWorld(world([parent]));

    expect(report.valid).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "BUILDING_PARTS_OVERLAP",
        featureIds: ["building-parent", "part-a", "part-b"],
      }),
    );
  });

  it("keeps a courtyard roof cap out of the hole while preserving 36 m² of top footprint", () => {
    const fixture = world(
      [building("building-roof", courtyard, 6, "gabled")],
      [
        {
          localId: "lot-in-courtyard",
          geometry: rectangle(2, 2, 8, 8),
          confirmed: true,
          status: "empty",
          provenance,
        },
      ],
    );
    expect(validateWorld(fixture).valid).toBe(true);

    const bundle = buildWorldMeshes(fixture, material);
    try {
      const buildingGroup = bundle.layers.buildings.children.find(
        (child) => child.name === "building:building-roof",
      );
      expect(buildingGroup).toBeDefined();
      expect(buildingGroup?.getObjectByName("roof:building-roof")).toBeUndefined();
      expect(projectedTopArea(buildingGroup!, 6)).toBeCloseTo(36, 4);
      expect(projectedRoofCovers(buildingGroup!, 5, 5)).toBe(false);
    } finally {
      bundle.dispose();
    }
  });

  it("rejects an incomplete parent/parts partition instead of silently losing uncovered parent geometry", () => {
    const parent = {
      ...building("building-parent", rectangle(0, 0, 10, 10), 12),
      parts: [
        {
          localId: "part-left",
          geometry: rectangle(0, 0, 2, 10),
          wallHeight: 4,
          roofType: "flat" as const,
          provenance,
        },
      ],
    };
    const fixture = world([parent]);
    const report = validateWorld(fixture);

    expect(report.valid).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        code: "BUILDING_PARTS_DO_NOT_PARTITION_PARENT",
        featureIds: ["building-parent"],
      }),
    );
    expect(() => buildWorldMeshes(fixture, material)).toThrow(
      "BUILDING_PARTS_DO_NOT_PARTITION_PARENT",
    );
  });

  it("does not accept a parent height edit when only part meshes are rendered", () => {
    const parent = {
      ...building("building-parent", rectangle(0, 0, 10, 10), 12),
      parts: [
        {
          localId: "part-left",
          geometry: rectangle(0, 0, 5, 10),
          wallHeight: 4,
          roofType: "flat" as const,
          provenance,
        },
        {
          localId: "part-right",
          geometry: rectangle(5, 0, 10, 10),
          wallHeight: 4,
          roofType: "flat" as const,
          provenance,
        },
      ],
    };
    const document: WorldOverrideDocument = {
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "override-parent-height",
          revision: 1,
          reason: "Synthetic parent edit repro",
          provenance: { source: "manual_override", quality: "inferred" },
          patch: {
            operation: "patch_building",
            featureId: "building-parent",
            patch: { wallHeight: 12 },
          },
        },
      ],
    };
    const result = applyWorldOverrides(world([parent]), document);

    expect(result.issues).toContain("OVERRIDE_PARENT_PARTS_NOT_RENDERED:building-parent");
    expect(result.world.buildings[0]?.parts?.map((part) => part.wallHeight)).toEqual([4, 4]);
  });

  it("rebuilds the part mesh with the edited height while preserving its footprint", () => {
    const parent = {
      ...building("building-parent", rectangle(0, 0, 10, 10), 12),
      parts: [
        {
          localId: "part-left",
          geometry: rectangle(0, 0, 2, 10),
          wallHeight: 4,
          roofType: "flat" as const,
          provenance,
        },
        {
          localId: "part-right",
          geometry: rectangle(2, 0, 10, 10),
          wallHeight: 4,
          roofType: "flat" as const,
          provenance,
        },
      ],
    };
    const document: WorldOverrideDocument = {
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "override-part-height",
          revision: 1,
          reason: "Synthetic rendered-part height edit",
          provenance: { source: "manual_override", quality: "inferred" },
          patch: {
            operation: "patch_building_part",
            buildingId: "building-parent",
            partId: "part-left",
            patch: { wallHeight: 8, levels: 3, roofType: "flat" },
          },
        },
      ],
    };
    const applied = applyWorldOverrides(world([parent]), document);
    expect(applied.issues).toEqual([]);
    expect(applied.world.buildings[0]?.wallHeight).toBe(12);
    expect(applied.world.buildings[0]?.parts?.[0]?.wallHeight).toBe(8);

    const bundle = buildWorldMeshes(applied.world, material);
    try {
      const group = bundle.layers.buildings.children.find(
        (child) => child.name === "building:building-parent",
      );
      expect(group).toBeDefined();
      expect(projectedTopArea(group!, 8)).toBeCloseTo(20, 4);
      const bounds = new THREE.Box3().setFromObject(group!);
      expect(bounds.max.y).toBeCloseTo(8, 4);
    } finally {
      bundle.dispose();
    }
  });

  it("updates provenance only for overridden fields", () => {
    const sourceBuilding = {
      ...building("building-surveyed", rectangle(0, 0, 4, 4), 6),
      attributes: {
        wallHeight: { source: "survey" as const, quality: "verified" as const },
        roofType: { source: "survey" as const, quality: "verified" as const },
      },
    };
    const document: WorldOverrideDocument = {
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "override-wall-height",
          revision: 1,
          reason: "Synthetic inferred correction",
          provenance: { source: "manual_override", quality: "inferred" },
          patch: {
            operation: "patch_building",
            featureId: "building-surveyed",
            patch: { wallHeight: 9 },
          },
        },
      ],
    };
    const result = applyWorldOverrides(world([sourceBuilding]), document);

    expect(result.world.buildings[0]?.wallHeight).toBe(9);
    expect(result.world.buildings[0]?.attributes).toMatchObject({
      wallHeight: { source: "manual_override", quality: "inferred" },
      roofType: { source: "survey", quality: "verified" },
    });
  });
});

it("uses footprint-preserving flat-cap roof fallback for concave and disjoint component shapes", () => {
  const concave: SurfaceGeometry = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [4, 0],
        [4, 1],
        [1, 1],
        [1, 4],
        [0, 4],
        [0, 0],
      ],
    ],
  };
  const disjoint: SurfaceGeometry = {
    type: "MultiPolygon",
    coordinates: [
      [
        [
          [10, 0],
          [12, 0],
          [12, 2],
          [10, 2],
          [10, 0],
        ],
      ],
      [
        [
          [14, 0],
          [16, 0],
          [16, 2],
          [14, 2],
          [14, 0],
        ],
      ],
    ],
  };
  const fixture = world([
    building("building-concave-roof", concave, 6, "gabled"),
    building("building-disjoint-roof", disjoint, 6, "hipped"),
  ]);
  const bundle = buildWorldMeshes(fixture, material);
  try {
    for (const [id, topY, expectedArea] of [
      ["building-concave-roof", 6, 7],
      ["building-disjoint-roof", 6, 8],
    ] as const) {
      const group = bundle.layers.buildings.children.find(
        (child) => child.name === `building:${id}`,
      );
      expect(group).toBeDefined();
      expect(group?.getObjectByName(`roof:${id}`)).toBeUndefined();
      expect(projectedTopArea(group!, topY)).toBeCloseTo(expectedArea, 4);
      let fallback: unknown;
      group!.traverse((object) => {
        if (object.userData["roofFallback"]) fallback = object.userData["roofFallback"];
      });
      expect(fallback).toBe("flat_cap_footprint_preserved");
    }
  } finally {
    bundle.dispose();
  }
});

it("renders a validated complete parts partition with full parent projected area and expected height bounds", () => {
  const parent = {
    ...building("building-partition-mesh", rectangle(0, 0, 10, 10), 12),
    parts: [
      {
        localId: "part-partition-left",
        geometry: rectangle(0, 0, 2, 10),
        wallHeight: 4,
        roofType: "flat" as const,
        provenance,
      },
      {
        localId: "part-partition-right",
        geometry: rectangle(2, 0, 10, 10),
        wallHeight: 4,
        roofType: "flat" as const,
        provenance,
      },
    ],
  };
  const fixture = world([parent]);
  expect(validateWorld(fixture).valid).toBe(true);
  const bundle = buildWorldMeshes(fixture, material);
  try {
    const group = bundle.layers.buildings.children.find(
      (child) => child.name === "building:building-partition-mesh",
    );
    expect(group).toBeDefined();
    expect(projectedTopArea(group!, 4)).toBeCloseTo(100, 4);
    const bounds = new THREE.Box3().setFromObject(group!);
    expect(bounds.min.y).toBeCloseTo(0, 4);
    expect(bounds.max.y).toBeCloseTo(4, 4);
  } finally {
    bundle.dispose();
  }
});
