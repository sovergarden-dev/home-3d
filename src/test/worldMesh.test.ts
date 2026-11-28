import { createHash } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import { pickFeature } from "@/engine/interaction/featurePicking";
import { buildWorldMeshes } from "@/engine/world/buildWorldMeshes";
import { planProceduralStreetTrim, resolveRoadSurfaceStyle } from "@/engine/world/streetStyling";
import { HOME_ENRICHMENT } from "@/world/enrichment/homeEnrichment";
import { planMassing } from "@/world/enrichment/planMassing";
import { planMassingFacades } from "@/world/enrichment/planMassingFacades";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import { surfaceBounds, surfaceIntersects } from "@/world/geometry";
import { HOME_NEIGHBORHOOD } from "@/world/homeNeighborhood";
import type { Building, RoadSegment, WorldData } from "@/world/schema";
import { validateWorld } from "@/world/validate";
import { assessWallHeight } from "@/world/wallHeight";

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
    expect(HOME_NEIGHBORHOOD.buildings).toHaveLength(1300);
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

  it("mounts estimated massing as a separate merged layer with procedural provenance and budget compliance", () => {
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const massingPlan = planMassing(HOME_NEIGHBORHOOD, HOME_ENRICHMENT!);
    const facadePlan = planMassingFacades(HOME_NEIGHBORHOOD, HOME_ENRICHMENT!, massingPlan);
    const bundle = buildWorldMeshes(
      HOME_NEIGHBORHOOD,
      (color, roughness = 0.82, metalness = 0) => {
        const key = `${color}:${roughness}:${metalness}`;
        let material = materials.get(key);
        if (!material) {
          material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
          materials.set(key, material);
        }
        return material;
      },
      "vi",
      massingPlan,
      facadePlan,
    );

    const estimatedGroup = bundle.layers.buildings.getObjectByName("estimated-massing");
    expect(estimatedGroup).toBeTruthy();
    expect(estimatedGroup!.userData).toMatchObject({
      origin: "estimated_procedural",
      estimated: true,
      provenance: { origin: "estimated_procedural", estimated: true },
      facades: {
        origin: "estimated_procedural",
        balconyBuildingCount: 237,
        shopBuildingCount: 40,
        instanceCount: 858,
        meshCount: 1,
      },
    });
    const facadeInstanced = estimatedGroup!.getObjectByName(
      "estimated-facades:instanced",
    ) as THREE.InstancedMesh;
    expect(facadeInstanced).toBeInstanceOf(THREE.InstancedMesh);
    expect(facadeInstanced.count).toBe(858);

    const { render, merged } = staticLayerMeshes(bundle);
    expect(render.length).toBeLessThan(60);
    const estimatedMerged = merged.filter(
      (mesh) => mesh.userData["origin"] === "estimated_procedural",
    );
    expect(estimatedMerged.length).toBeGreaterThan(0);
    expect(estimatedMerged.length).toBeLessThanOrEqual(15);

    // Canonical unknown-height buildings remain untouched at status="unknown"
    const unknownCount = HOME_NEIGHBORHOOD.buildings.filter(
      (building) => assessWallHeight(building, false).status === "unknown",
    ).length;
    expect(unknownCount).toBe(1280);

    // Picking a 3D estimated building returns estimated_procedural provenance
    const sample = massingPlan.items[0]!;
    const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    camera.position.set(sample.position[0], sample.wallHeight + 25, sample.position[1]);
    camera.lookAt(sample.position[0], 0, sample.position[1]);
    camera.updateMatrixWorld();
    const picked = pickFeature(
      new THREE.Raycaster(),
      new THREE.Vector2(0, 0),
      camera,
      bundle.group,
    );
    expect(picked).toMatchObject({
      featureId: sample.sourceBuildingId,
      featureType: "building",
      confidence: "unknown",
      estimatedOrigin: "estimated_procedural",
      estimatedLevels: sample.levels,
    });

    // Geometry confidence mode hides procedural volumes so canonical unknown status is visible
    bundle.setConfidenceVisible(true);
    expect(estimatedGroup!.visible).toBe(false);
    bundle.setConfidenceVisible(false);
    expect(estimatedGroup!.visible).toBe(true);

    bundle.dispose();
    materials.forEach((material) => material.dispose());
  });

  it("plans deterministic, order-independent street styling without overlapping buildings or mutating canonical roads", () => {
    const plan = planProceduralStreetTrim(HOME_NEIGHBORHOOD);
    const goldenSha = createHash("sha256").update(JSON.stringify(plan)).digest("hex");
    expect(goldenSha).toBe("71b7443a3ce0db34b2eb2f6bc9728414940bed46180b284236d29cc26ec7991a");
    expect(plan.styledRoadCounts).toEqual({
      primary_asphalt: 35,
      secondary_asphalt: 26,
      residential_asphalt: 20,
      service_pavement: 39,
      alley_concrete: 18,
      surveyed_concrete: 0,
      surveyed_paving: 0,
    });
    expect(plan.countsByKind).toEqual({
      inferred_sidewalk: 776,
      curb: 776,
      lane_marking: 1102,
      alley_trim: 83,
    });
    const alleyTrims = plan.quads.filter((quad) => quad.kind === "alley_trim");
    expect(alleyTrims.every((quad) => quad.y < 0.02)).toBe(true);
    const medianAlleyTrims = alleyTrims.filter(
      (quad) => quad.roadId === "road-osm-300m-primary-way-716738900-26a3e409fd",
    );
    expect(medianAlleyTrims.length).toBeGreaterThan(0);
    for (const quad of medianAlleyTrims) {
      for (const [x] of [quad.aLeft, quad.aRight, quad.bLeft, quad.bRight]) {
        expect(x).toBeLessThan(-10.5);
        expect(x).toBeGreaterThan(-17.2);
      }
    }

    const shuffled = planProceduralStreetTrim({
      ...HOME_NEIGHBORHOOD,
      roads: [...HOME_NEIGHBORHOOD.roads].reverse(),
      buildings: [...HOME_NEIGHBORHOOD.buildings].reverse(),
    });
    expect(createHash("sha256").update(JSON.stringify(shuffled)).digest("hex")).toBe(goldenSha);
    expect(HOME_NEIGHBORHOOD.roads.every((road) => road.sidewalkWidths === undefined)).toBe(true);
    expect(HOME_NEIGHBORHOOD.roads.every((road) => road.surface === "unknown")).toBe(true);

    const activeBuildings = HOME_NEIGHBORHOOD.buildings
      .filter((building) => !building.hidden)
      .map((building) => ({ building, bounds: surfaceBounds(building.geometry) }));
    const overlaps: string[] = [];
    for (const quad of plan.quads) {
      if (quad.kind !== "inferred_sidewalk" && quad.kind !== "curb") continue;
      const minX = Math.min(quad.aLeft[0], quad.aRight[0], quad.bLeft[0], quad.bRight[0]);
      const maxX = Math.max(quad.aLeft[0], quad.aRight[0], quad.bLeft[0], quad.bRight[0]);
      const minZ = Math.min(quad.aLeft[1], quad.aRight[1], quad.bLeft[1], quad.bRight[1]);
      const maxZ = Math.max(quad.aLeft[1], quad.aRight[1], quad.bLeft[1], quad.bRight[1]);
      const quadPoly = {
        type: "Polygon" as const,
        coordinates: [[quad.aLeft, quad.bLeft, quad.bRight, quad.aRight, quad.aLeft]],
      };
      for (const { building, bounds } of activeBuildings) {
        if (
          maxX + 1e-6 < bounds.minX ||
          minX - 1e-6 > bounds.maxX ||
          maxZ + 1e-6 < bounds.minZ ||
          minZ - 1e-6 > bounds.maxZ
        ) {
          continue;
        }
        if (surfaceIntersects(quadPoly, building.geometry)) {
          overlaps.push(`${quad.roadId}:${building.localId}`);
        }
      }
    }
    expect(overlaps).toEqual([]);

    const syntheticPlan = planProceduralStreetTrim(SYNTHETIC_NEIGHBORHOOD);
    expect(syntheticPlan.countsByKind).toEqual({
      inferred_sidewalk: 0,
      curb: 0,
      lane_marking: 30,
      alley_trim: 8,
    });
    expect(
      resolveRoadSurfaceStyle({
        ...SYNTHETIC_NEIGHBORHOOD.roads[0]!,
        surface: "paving",
      }).styleClass,
    ).toBe("surveyed_paving");
  });

  it("renders road-class surface styles, keeps canonical road picking through lane markings, and hides procedural trim in confidence mode", () => {
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

    const stylingMeta = bundle.layers.roads.userData["streetStyling"] as {
      origin: string;
      styleClasses: string[];
      trimMeshCount: number;
    };
    expect(stylingMeta.origin).toBe("estimated_procedural");
    expect(stylingMeta.styleClasses).toHaveLength(5);
    expect(stylingMeta.trimMeshCount).toBe(1);

    const trimGroup = bundle.layers.roads.getObjectByName("estimated-street-styling");
    expect(trimGroup).toBeTruthy();
    expect(trimGroup!.children).toHaveLength(1);
    const instancedTrim = trimGroup!.getObjectByName(
      "street-trim:instanced",
    ) as THREE.InstancedMesh;
    expect(instancedTrim).toBeInstanceOf(THREE.InstancedMesh);
    expect(instancedTrim.count).toBe(2737);
    expect(instancedTrim.geometry.getAttribute("normal").getY(0)).toBeGreaterThan(0.99);

    const plan = planProceduralStreetTrim(HOME_NEIGHBORHOOD);
    const mark = plan.quads.find((quad) => quad.kind === "lane_marking")!;
    const cx = (mark.aLeft[0] + mark.bRight[0]) / 2;
    const cz = (mark.aLeft[1] + mark.bRight[1]) / 2;
    const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 200);
    camera.position.set(cx, 25, cz);
    camera.lookAt(cx, 0, cz);
    camera.updateMatrixWorld();
    const picked = pickFeature(
      new THREE.Raycaster(),
      new THREE.Vector2(0, 0),
      camera,
      bundle.group,
    );
    expect(picked).toMatchObject({ featureId: mark.roadId, featureType: "road" });

    bundle.setConfidenceVisible(true);
    expect(trimGroup!.visible).toBe(false);
    bundle.setConfidenceVisible(false);
    expect(trimGroup!.visible).toBe(true);

    const markMat = instancedTrim.material as THREE.MeshStandardMaterial;
    const dryMarkRoughness = markMat.roughness;
    bundle.setRoadWet(true);
    expect(markMat.roughness).toBeLessThan(dryMarkRoughness);
    bundle.setRoadWet(false);
    expect(markMat.roughness).toBeCloseTo(dryMarkRoughness);

    bundle.dispose();
    materials.forEach((material) => material.dispose());
  });

  it("validates and renders explicit facadeColor and roofColor on verified buildings and parts", () => {
    const base = structuredClone(SYNTHETIC_NEIGHBORHOOD);
    const { parts: _parts, ...baseBuilding } = base.buildings[0]!;
    const sample = {
      ...baseBuilding,
      localId: "building-colored-test",
      facadeColor: "#d97033",
      roofColor: "#5c7a52",
      roofType: "flat" as const,
      wallHeight: 7.2,
      levels: 2,
      provenance: { source: "survey" as const, quality: "verified" as const },
      attributes: { wallHeight: { source: "survey" as const, quality: "verified" as const } },
    };
    const validWorld = {
      ...base,
      manifest: { ...base.manifest, isSynthetic: false },
      buildings: [sample],
    };
    expect(validateWorld(validWorld).valid).toBe(true);

    const invalidWorld = {
      ...validWorld,
      buildings: [{ ...sample, facadeColor: "not-a-hex-color" }],
    };
    const invalidReport = validateWorld(invalidWorld);
    expect(invalidReport.valid).toBe(false);
    expect(invalidReport.issues.some((issue) => issue.code === "BUILDING_INVALID_COLOR")).toBe(
      true,
    );

    const requestedColors: string[] = [];
    const materials = new Map<string, THREE.MeshStandardMaterial>();
    const bundle = buildWorldMeshes(validWorld, (color, roughness = 0.82, metalness = 0) => {
      requestedColors.push(color);
      const key = `${color}:${roughness}:${metalness}`;
      let material = materials.get(key);
      if (!material) {
        material = new THREE.MeshStandardMaterial({ color, roughness, metalness });
        materials.set(key, material);
      }
      return material;
    });
    expect(requestedColors).toContain("#d97033");
    expect(requestedColors).toContain("#5c7a52");
    bundle.dispose();
    materials.forEach((material) => material.dispose());
  });
});
