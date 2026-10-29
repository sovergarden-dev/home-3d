import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { createLifeRenderer } from "@/engine/life/rendering";
import { createLifeSimulation } from "@/engine/life/simulation";
import type { WorldData } from "@/world/schema";

const world = {
  manifest: {
    schemaVersion: "1.0",
    datasetRevision: "release-synthetic",
    units: "metres",
    frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
    isSynthetic: true,
    chunks: [],
    assetHashes: {},
    licences: ["CC0-1.0"],
    coverage: { quality: "synthetic", sourceCount: 1 },
  },
  roads: [
    {
      localId: "road",
      polylineENU: [
        [-100, 0],
        [100, 0],
      ],
      connectorIds: [],
      roadClass: "residential",
      carriagewayWidth: 7,
      sidewalkWidths: [1.5, 1.5],
      elevationLayer: 0,
      direction: "both",
      surface: "asphalt",
      provenance: { source: "synthetic", quality: "synthetic" },
    },
  ],
  buildings: [],
  lots: [],
} as WorldData;

describe("P9 presentation resource ownership", () => {
  it("does not allocate actor meshes or shaders for an unusable graph", () => {
    const simulation = createLifeSimulation({ ...world, roads: [] }, 42);
    expect(simulation.graph.enabled).toBe(false);
    const rendering = createLifeRenderer(simulation);
    const scene = new THREE.Scene();
    scene.add(rendering.group);
    rendering.setVisible(true);
    rendering.update(0.1, { visible: true });
    expect(rendering.group.children).toHaveLength(0);
    expect(rendering.group.visible).toBe(false);
    expect(simulation.agents).toHaveLength(0);
    rendering.dispose();
    rendering.dispose();
    expect(scene.children).toHaveLength(0);
    simulation.dispose();
  });

  it("releases every instance buffer including headlamps and removes the old group once", () => {
    const scene = new THREE.Scene();
    const simulation = createLifeSimulation(world, 42);
    expect(simulation.graph.enabled).toBe(true);
    const rendering = createLifeRenderer(simulation);
    scene.add(rendering.group);
    const meshes = rendering.group.children.slice() as THREE.InstancedMesh[];
    const disposed: string[] = [];
    for (const mesh of meshes) mesh.addEventListener("dispose", () => disposed.push(mesh.name));
    expect(meshes).toHaveLength(11);
    expect(meshes.some((mesh) => mesh.name === "life-headlamps")).toBe(true);
    rendering.dispose();
    rendering.dispose();
    expect(disposed.sort()).toEqual(meshes.map((mesh) => mesh.name).sort());
    expect(scene.children).toHaveLength(0);
    expect(rendering.group.children).toHaveLength(0);
    simulation.dispose();
  });
});

it("enlarges only Diorama presentation while preserving actor positions and resource counts", () => {
  const simulation = createLifeSimulation(world, 42),
    rendering = createLifeRenderer(simulation);
  rendering.update(1, { speed: 1, visible: true, hour: 12 });
  rendering.update(0, { speed: 0, visible: true, hour: 12 });
  const meshes = rendering.group.children as THREE.InstancedMesh[];
  const mesh = meshes.find((mesh) => mesh.count > 0 && mesh.name !== "life-headlamps")!;
  const before = new THREE.Matrix4();
  mesh.getMatrixAt(0, before);
  const actors = JSON.stringify(simulation.agents);
  rendering.setDiorama(true);
  rendering.update(0, { speed: 0, visible: true, hour: 12 });
  const enlarged = new THREE.Matrix4();
  mesh.getMatrixAt(0, enlarged);
  expect(enlarged.elements[12]).toBe(before.elements[12]);
  expect(enlarged.elements[14]).toBe(before.elements[14]);
  const scale = (matrix: THREE.Matrix4) => new THREE.Vector3().setFromMatrixScale(matrix).x;
  expect(scale(enlarged) / scale(before)).toBeCloseTo(mesh.name === "life-pedestrian" ? 2 : 1.6, 4);
  expect(JSON.stringify(simulation.agents)).toBe(actors);
  expect(meshes).toHaveLength(11);
  rendering.setDiorama(false);
  rendering.update(0, { speed: 0, visible: true, hour: 12 });
  const restored = new THREE.Matrix4();
  mesh.getMatrixAt(0, restored);
  expect(restored.elements).toEqual(before.elements);
  rendering.dispose();
  simulation.dispose();
});
