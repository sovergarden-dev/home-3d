import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { pickFeature } from "@/engine/interaction/featurePicking";
import { buildWorldMeshes } from "@/engine/world/buildWorldMeshes";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import { HOME_NEIGHBORHOOD } from "@/world/homeNeighborhood";
import type { Building, RoadSegment, WorldData } from "@/world/schema";

describe("world mesh lifecycle", () => {
  it("creates one layered world with real label and tree visibility controls", () => {
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const bundle = buildWorldMeshes(
      SYNTHETIC_NEIGHBORHOOD,
      (color, roughness = 0.8, metalness = 0) => {
        const key = `${color}:${roughness}:${metalness}`;
        let material = materials.get(key);
        if (!material) {
          material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
          materials.set(key, material);
        }
        return material;
      },
    );

    expect(bundle.group.name).toBe("world:synthetic-neighborhood-v1");
    expect(bundle.layers.roads.children.length).toBeGreaterThan(0);
    expect(bundle.layers.buildings.children.length).toBeGreaterThan(0);
    expect(bundle.layers.labels.children.length).toBeGreaterThan(0);
    expect(bundle.layers.trees.children.length).toBeGreaterThan(0);

    bundle.setLayerVisible("labels", false);
    bundle.setLayerVisible("trees", false);
    expect(bundle.layers.labels.visible).toBe(false);
    expect(bundle.layers.trees.visible).toBe(false);

    expect(bundle.dispose()).toBeUndefined();
  });

  it("renders readable Vietnamese/English road labels, omits raw localIds when localized, and builds a home-lot boundary curb", () => {
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const factory = (color: string, roughness = 0.8, metalness = 0) => {
      const key = `${color}:${roughness}:${metalness}`;
      let mat = materials.get(key);
      if (!mat) {
        mat = new THREE.MeshStandardMaterial({ color, roughness, metalness });
        materials.set(key, mat);
      }
      return mat;
    };
    const viBundle = buildWorldMeshes(SYNTHETIC_NEIGHBORHOOD, factory, "vi");
    const viLabels: string[] = [];
    viBundle.layers.labels.traverse((obj) => {
      if (typeof obj.userData["label"] === "string") viLabels.push(obj.userData["label"]);
    });
    expect(viLabels).toContain("Đường chính");
    expect(viLabels).toContain("Hẻm bên");
    expect(viLabels).not.toContain("building-neighbour-west");
    expect(viLabels).not.toContain("lot-home-empty");
    expect(viBundle.group.getObjectByName("lot:lot-home-empty")).toBeTruthy();

    viBundle.setLabelLanguage("en");
    const enLabels: string[] = [];
    viBundle.layers.labels.traverse((obj) => {
      if (typeof obj.userData["label"] === "string") enLabels.push(obj.userData["label"]);
    });
    expect(enLabels).toContain("Main Street");
    expect(enLabels).toContain("Side Alley");
    expect(enLabels).not.toContain("lot-home-empty");

    viBundle.dispose();
    materials.forEach((m) => m.dispose());
  });

  it("releases renderers from the geometry three.js shares across label sprites", () => {
    const material = new THREE.MeshStandardMaterial();
    const bundle = buildWorldMeshes(SYNTHETIC_NEIGHBORHOOD, () => material);
    const sprites: THREE.Sprite[] = [];
    bundle.group.traverse((object) => {
      if (object instanceof THREE.Sprite) sprites.push(object);
    });
    expect(sprites.length).toBeGreaterThan(1);
    const shared = sprites[0]!.geometry;
    expect(sprites.every((sprite) => sprite.geometry === shared)).toBe(true);
    // A renderer that drew a sprite keeps a listener like this, and with it its WebGL context,
    // until the geometry is disposed.
    const rendererCleanup = vi.fn(() => shared.removeEventListener("dispose", rendererCleanup));
    shared.addEventListener("dispose", rendererCleanup);
    bundle.dispose();
    expect(rendererCleanup).toHaveBeenCalledTimes(1);
    expect(shared.hasEventListener("dispose", rendererCleanup)).toBe(false);
    material.dispose();
  });

  it("renders tunnels below surface by structural layer while preserving surveyed elevation", () => {
    const road = (localId: string, overrides: Partial<RoadSegment>): RoadSegment => ({
      localId,
      polylineENU: [
        [0, 0],
        [10, 0],
      ],
      connectorIds: [],
      roadClass: "residential",
      carriagewayWidth: 6,
      elevationLayer: -1,
      structure: "tunnel",
      direction: "both",
      surface: "unknown",
      provenance: { source: "osm", quality: "source_only" },
      ...overrides,
    });
    const world: WorldData = {
      manifest: {
        schemaVersion: "1.0",
        datasetRevision: "road-structural-layer-test",
        units: "metres",
        frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
        isSynthetic: false,
        chunks: [],
        assetHashes: {},
        licences: ["OpenStreetMap"],
        coverage: { quality: "source_only", sourceCount: 1 },
      },
      roads: [
        road("tunnel-layer-prior", {}),
        road("tunnel-surveyed-elevation", { baseElevation: 2.75 }),
      ],
      buildings: [],
      lots: [],
    };
    const materials: THREE.Material[] = [];
    const bundle = buildWorldMeshes(world, (color, roughness = 0.82, metalness = 0) => {
      const material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      materials.push(material);
      return material;
    });

    const firstRoadVertexY = (localId: string) => {
      const roadGroup = bundle.group.getObjectByName(`road:${localId}`);
      const mesh = roadGroup?.children[0];
      if (!(mesh instanceof THREE.Mesh)) throw new Error("ROAD_MESH_NOT_FOUND");
      return mesh.geometry.getAttribute("position").getY(0);
    };

    expect(firstRoadVertexY("tunnel-layer-prior")).toBeCloseTo(-4.48);
    expect(firstRoadVertexY("tunnel-surveyed-elevation")).toBeCloseTo(2.75);
    bundle.dispose();
    materials.forEach((material) => material.dispose());
  });

  it("keeps all road strip faces front-facing through a hairpin", () => {
    const world: WorldData = {
      manifest: {
        schemaVersion: "1.0",
        datasetRevision: "road-hairpin-winding-test",
        units: "metres",
        frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
        isSynthetic: true,
        chunks: [],
        assetHashes: {},
        licences: ["Synthetic fixture"],
        coverage: { quality: "synthetic", sourceCount: 1 },
      },
      roads: [
        {
          localId: "road-hairpin",
          polylineENU: [
            [0, 0],
            [10, 0],
            [1, 1],
          ],
          connectorIds: [],
          roadClass: "residential",
          carriagewayWidth: 6,
          elevationLayer: 0,
          direction: "both",
          surface: "unknown",
          provenance: { source: "synthetic", quality: "synthetic" },
        },
      ],
      buildings: [],
      lots: [],
    };
    const material = new THREE.MeshStandardMaterial();
    const bundle = buildWorldMeshes(world, () => material);
    const road = bundle.group.getObjectByName("road:road-hairpin")?.children[0];
    if (!(road instanceof THREE.Mesh)) throw new Error("ROAD_MESH_NOT_FOUND");
    const normals = road.geometry.getAttribute("normal");
    expect(normals.count).toBeGreaterThan(0);
    for (let index = 0; index < normals.count; index += 1) {
      expect(normals.getY(index)).toBeGreaterThan(0.99);
    }
    bundle.dispose();
    material.dispose();
  });
});

const syntheticProvenance = { source: "synthetic" as const, quality: "synthetic" as const };

function rectangleBuilding(localId: string, minX: number, minZ: number): Building {
  return {
    localId,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [minX, minZ],
          [minX + 4, minZ],
          [minX + 4, minZ + 4],
          [minX, minZ + 4],
          [minX, minZ],
        ],
      ],
    },
    footprintKind: "footprint",
    wallHeight: 6,
    roofType: "flat",
    provenance: syntheticProvenance,
  };
}

function mergeFixture(): WorldData {
  return {
    manifest: {
      schemaVersion: "1.0",
      datasetRevision: "static-mesh-merge-test",
      units: "metres",
      frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
      isSynthetic: true,
      chunks: [],
      assetHashes: {},
      licences: ["Synthetic fixture"],
      coverage: { quality: "synthetic", sourceCount: 1 },
    },
    roads: [
      {
        localId: "merge-road-a",
        polylineENU: [
          [0, -8],
          [24, -8],
        ],
        connectorIds: [],
        roadClass: "residential",
        carriagewayWidth: 4,
        elevationLayer: 0,
        direction: "both",
        surface: "asphalt",
        provenance: syntheticProvenance,
      },
      {
        localId: "merge-road-b",
        polylineENU: [
          [0, 12],
          [24, 12],
        ],
        connectorIds: [],
        roadClass: "residential",
        carriagewayWidth: 4,
        elevationLayer: 0,
        direction: "both",
        surface: "asphalt",
        provenance: syntheticProvenance,
      },
    ],
    buildings: [
      rectangleBuilding("merge-building-a", 0, 0),
      rectangleBuilding("merge-building-b", 6, 0),
      rectangleBuilding("merge-building-c", 12, 0),
      rectangleBuilding("merge-building-d", 18, 0),
    ],
    lots: [],
  };
}

function sharedMaterialFactory() {
  const wall = new THREE.MeshStandardMaterial({
    color: "#d9c9b4",
    roughness: 0.82,
    metalness: 0.04,
  });
  return {
    wall,
    factory: () => wall,
    dispose() {
      wall.dispose();
    },
  };
}

function staticLayerMeshes(bundle: ReturnType<typeof buildWorldMeshes>) {
  const render: THREE.Mesh[] = [];
  const proxies: THREE.Mesh[] = [];
  const merged: THREE.Mesh[] = [];
  for (const layer of [bundle.layers.buildings, bundle.layers.roads]) {
    layer.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      if (object.userData["mergedStatic"]) merged.push(object);
      if (object.userData["staticPickProxy"]) proxies.push(object);
      if (object.layers.isEnabled(0) && object.visible) render.push(object);
    });
  }
  return { render, proxies, merged };
}

describe("static mesh merge by material", () => {
  it("emits one visible mesh per merged material and keeps source vertex totals", () => {
    const { factory, dispose } = sharedMaterialFactory();
    const bundle = buildWorldMeshes(mergeFixture(), factory);
    const { render, proxies, merged } = staticLayerMeshes(bundle);

    expect(merged.length).toBeGreaterThan(0);
    const mergedByMaterial = new Map<THREE.Material, THREE.Mesh[]>();
    for (const mesh of merged) {
      const material = mesh.material as THREE.Material;
      const list = mergedByMaterial.get(material) ?? [];
      list.push(mesh);
      mergedByMaterial.set(material, list);
    }
    for (const meshes of mergedByMaterial.values()) {
      expect(meshes).toHaveLength(1);
    }

    for (const mergedMesh of merged) {
      const key = mergedMesh.userData["mergeKey"];
      const sources = proxies.filter((mesh) => mesh.userData["mergeKey"] === key);
      expect(sources.length).toBeGreaterThan(1);
      const sourceVertices = sources.reduce(
        (total, mesh) => total + mesh.geometry.getAttribute("position").count,
        0,
      );
      expect(mergedMesh.geometry.getAttribute("position").count).toBe(sourceVertices);
    }

    expect(render.length).toBeLessThan(proxies.length);
    bundle.dispose();
    dispose();
  });

  it("keeps per-building picking, named groups, and selection highlight after merge", () => {
    const { factory, dispose } = sharedMaterialFactory();
    const bundle = buildWorldMeshes(mergeFixture(), factory);
    expect(bundle.group.getObjectByName("building:merge-building-a")).toBeTruthy();
    expect(bundle.group.getObjectByName("road:merge-road-a")).toBeTruthy();

    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.position.set(2, 20, 2);
    camera.lookAt(2, 0, 2);
    camera.updateMatrixWorld();
    const picked = pickFeature(
      new THREE.Raycaster(),
      new THREE.Vector2(0, 0),
      camera,
      bundle.group,
    );
    expect(picked).toMatchObject({ featureId: "merge-building-a", featureType: "building" });

    bundle.setSelectedFeature("merge-building-a");
    const { merged, proxies } = staticLayerMeshes(bundle);
    expect(merged.every((mesh) => mesh.visible === false)).toBe(true);
    const selected = proxies.find((mesh) => {
      let owner: THREE.Object3D | null = mesh;
      while (owner) {
        if (owner.userData["featureId"] === "merge-building-a") return true;
        owner = owner.parent;
      }
      return false;
    });
    expect(selected).toBeDefined();
    expect(selected!.layers.isEnabled(0)).toBe(true);
    const material = selected!.material as THREE.MeshStandardMaterial;
    expect(material.emissiveIntensity).toBeCloseTo(0.4);

    bundle.setSelectedFeature(null);
    expect(staticLayerMeshes(bundle).merged.every((mesh) => mesh.visible === true)).toBe(true);
    bundle.dispose();
    dispose();
  });

  it("disposes merged geometries on world teardown and leaves trees unmerged", () => {
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const bundle = buildWorldMeshes(
      SYNTHETIC_NEIGHBORHOOD,
      (color, roughness = 0.8, metalness = 0) => {
        const key = `${color}:${roughness}:${metalness}`;
        let material = materials.get(key);
        if (!material) {
          material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
          materials.set(key, material);
        }
        return material;
      },
    );

    bundle.layers.trees.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        expect(object.userData["mergedStatic"]).toBeUndefined();
        expect(object.layers.isEnabled(0)).toBe(true);
      }
    });

    const mergedGeometries: THREE.BufferGeometry[] = [];
    bundle.group.traverse((object) => {
      if (object instanceof THREE.Mesh && object.userData["mergedStatic"]) {
        mergedGeometries.push(object.geometry);
      }
    });
    expect(mergedGeometries.length).toBeGreaterThan(0);
    const listeners = mergedGeometries.map((geometry) => {
      const listener = vi.fn(() => geometry.removeEventListener("dispose", listener));
      geometry.addEventListener("dispose", listener);
      return listener;
    });
    bundle.dispose();
    for (const listener of listeners) expect(listener).toHaveBeenCalledTimes(1);
    materials.forEach((material) => material.dispose());
  });

  it("merges the canonical neighborhood static meshes far below the mid-tier draw-call budget", () => {
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const bundle = buildWorldMeshes(HOME_NEIGHBORHOOD, (color, roughness = 0.82, metalness = 0) => {
      const key = `${color}:${roughness}:${metalness}`;
      let material = materials.get(key);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
        materials.set(key, material);
      }
      return material;
    });
    const { render, proxies, merged } = staticLayerMeshes(bundle);
    expect(HOME_NEIGHBORHOOD.buildings).toHaveLength(317);
    expect(HOME_NEIGHBORHOOD.roads).toHaveLength(138);
    expect(merged.length).toBeGreaterThan(0);
    expect(render.length).toBeLessThan(40);
    expect(proxies.length).toBeGreaterThan(400);
    for (const mergedMesh of merged) {
      const sources = proxies.filter(
        (mesh) => mesh.userData["mergeKey"] === mergedMesh.userData["mergeKey"],
      );
      const sourceVertices = sources.reduce(
        (total, mesh) => total + mesh.geometry.getAttribute("position").count,
        0,
      );
      expect(mergedMesh.geometry.getAttribute("position").count).toBe(sourceVertices);
    }
    bundle.dispose();
    materials.forEach((material) => material.dispose());
  });
});
