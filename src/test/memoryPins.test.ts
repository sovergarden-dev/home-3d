import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { createMemoryPinLayer, type PinTier } from "@/memories/pins";
import type { Memory, Photo } from "@/memories/schema";

const memory = (index: number, position: Memory["position"] = [0, 0, 0]): Memory => ({
  id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  title: "Synthetic pin",
  body: "",
  position,
  camera: { mode: "diorama", target: [0, 0, 0], yaw: 0, pitch: 0.8, distance: 80, zoom: 1 },
  date: "2026-06-21",
  preset: "everyday",
  tags: [],
  photos: [],
  visibility: "public",
});

describe("memory pin presentation and picking", () => {
  it("keeps an empty layer out of shader warmup and reuses its mesh when content returns", () => {
    const layer = createMemoryPinLayer();
    const mesh = layer.mesh;
    expect(mesh.count).toBe(0);
    expect(layer.group.children).toEqual([]);
    layer.update([memory(1)], false);
    expect(layer.group.children).toEqual([mesh]);
    layer.update([], false);
    expect(layer.group.children).toEqual([]);
    expect(mesh.visible).toBe(false);
    layer.update([memory(2)], false);
    expect(layer.group.children).toEqual([mesh]);
    expect(mesh.visible).toBe(true);
    expect(layer.mesh).toBe(mesh);
    layer.dispose();
  });
  it.each<[PinTier, number]>([
    ["low", 40],
    ["mid", 120],
    ["high", 300],
    ["ultra", 300],
  ])("keeps %s capacity in one instanced mesh without mutating memories", (tier, count) => {
    const items = Array.from({ length: 300 }, (_, i) => memory(i));
    const before = JSON.stringify(items);
    const layer = createMemoryPinLayer(tier);
    layer.update(items, false);
    expect(layer.mesh.count).toBe(count);
    expect(layer.group.children).toEqual([layer.mesh]);
    expect(layer.mesh.isInstancedMesh).toBe(true);
    expect(JSON.stringify(items)).toBe(before);
    layer.dispose();
  });

  it("excludes private and unreviewed public entries in guest mode", () => {
    const layer = createMemoryPinLayer();
    const unreviewed = memory(2);
    unreviewed.photos = [{ reviewed: false } as Photo];
    layer.update([{ ...memory(1), visibility: "private" }, unreviewed, memory(3)], true);
    expect(layer.memories.map((item) => item.id)).toEqual([memory(3).id]);
    layer.dispose();
  });

  it.each([30, 380])("keeps the screen-space hit target at perspective distance %s", (distance) => {
    const camera = new THREE.PerspectiveCamera(42, 1000 / 800, 0.1, 2000);
    camera.position.set(0, distance * 0.6, distance);
    camera.lookAt(0, 0, 0);
    const layer = createMemoryPinLayer();
    layer.update([memory(1)], false);
    expect(layer.pick(520, 382, camera, 1000, 800)).toBe(memory(1).id);
    expect(layer.pick(524, 382, camera, 1000, 800)).toBeNull();
    layer.group.visible = false;
    expect(layer.pick(500, 382, camera, 1000, 800)).toBeNull();
    layer.dispose();
  });

  it("chooses the closest overlapping target and uses a stable ID for exact ties", () => {
    const camera = new THREE.OrthographicCamera(-100, 100, 80, -80, 0.1, 500);
    camera.position.set(0, 100, 0);
    camera.up.set(0, 0, -1);
    camera.lookAt(0, 0, 0);
    const layer = createMemoryPinLayer();
    layer.update([memory(1), memory(2, [2, 0, 0])], false);
    expect(layer.pick(508, 382, camera, 1000, 800)).toBe(memory(2).id);
    layer.update([memory(2), memory(1)], false);
    expect(layer.pick(500, 382, camera, 1000, 800)).toBe(memory(1).id);
    expect(layer.setHovered(memory(1).id)).toBe(true);
    expect(layer.setHovered(memory(1).id)).toBe(false);
    expect(layer.mesh.geometry.getAttribute("pinHighlight").getX(1)).toBe(1);
    expect(layer.setHovered(null)).toBe(true);
    expect(layer.setSelected(memory(2).id)).toBe(true);
    expect(layer.memories.at(-1)?.id).toBe(memory(2).id);
    expect(layer.mesh.geometry.getAttribute("pinHighlight").getX(1)).toBe(1);
    layer.dispose();
  });
});
