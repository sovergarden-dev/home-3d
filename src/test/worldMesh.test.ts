import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildWorldMeshes } from "@/engine/world/buildWorldMeshes";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import type { RoadSegment, WorldData } from "@/world/schema";

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

    expect(() => bundle.dispose()).not.toThrow();
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
