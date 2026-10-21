import { afterEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";
import {
  BUILDING_LABELS_MAX_PER_ATLAS,
  createBuildingLabelBatches,
} from "@/engine/world/buildingLabels";

const originalDocument = globalThis.document;
const originalUserAgent = globalThis.navigator?.userAgent;

function installCanvasDocument() {
  const context = {
    fillStyle: "",
    font: "",
    textAlign: "",
    textBaseline: "",
    fill() {},
    fillRect() {},
    fillText: vi.fn(),
    beginPath() {},
    roundRect() {},
    save() {},
    restore() {},
    translate() {},
  } as unknown as CanvasRenderingContext2D;
  globalThis.document = {
    createElement() {
      return {
        width: 0,
        height: 0,
        getContext: () => context,
      } as unknown as HTMLCanvasElement;
    },
  } as unknown as Document;
  if (globalThis.navigator) {
    Object.defineProperty(globalThis.navigator, "userAgent", {
      configurable: true,
      value: "vitest",
    });
  }
  return context;
}

afterEach(() => {
  globalThis.document = originalDocument;
  if (globalThis.navigator && originalUserAgent !== undefined) {
    Object.defineProperty(globalThis.navigator, "userAgent", {
      configurable: true,
      value: originalUserAgent,
    });
  }
});

describe("building label atlas batches", () => {
  it("uses at most ceil(N/336) instanced batches with bounded atlas UVs", () => {
    const context = installCanvasDocument();
    const labels = Array.from({ length: BUILDING_LABELS_MAX_PER_ATLAS + 2 }, (_, index) => ({
      text: `building-${index}`,
      position: [index, index * 2] as [number, number],
    }));
    const source = structuredClone(labels);
    const disposables: THREE.Texture[] = [];
    const result = createBuildingLabelBatches(labels, disposables);

    expect(result?.batchCount).toBe(2);
    expect(result?.batchCount).toBeLessThanOrEqual(Math.ceil(labels.length / 336));
    expect(result?.labelCount).toBe(labels.length);
    expect(result?.group.children.every((child) => child instanceof THREE.InstancedMesh)).toBe(
      true,
    );
    result?.group.children.forEach((child, batchIndex) => {
      const mesh = child as THREE.InstancedMesh;
      expect(mesh.count).toBeLessThanOrEqual(BUILDING_LABELS_MAX_PER_ATLAS);
      const uv = mesh.geometry.getAttribute("labelUv");
      for (let index = 0; index < uv.count; index += 1) {
        expect(uv.getX(index)).toBeGreaterThanOrEqual(0);
        expect(uv.getY(index)).toBeGreaterThanOrEqual(0);
        expect(uv.getX(index) + uv.getZ(index)).toBeLessThanOrEqual(1);
        expect(uv.getY(index) + uv.getW(index)).toBeLessThanOrEqual(1);
      }
      const matrix = new THREE.Matrix4();
      mesh.getMatrixAt(0, matrix);
      expect(matrix.elements[12]).toBe(batchIndex * BUILDING_LABELS_MAX_PER_ATLAS);
      expect(matrix.elements[13]).toBe(0.5);
    });
    expect(labels).toEqual(source);
    expect(context.fillText).toHaveBeenCalledWith("building-0", 128, 24);
    const firstMesh = result!.group.children[0] as THREE.InstancedMesh;
    const disposed = vi.fn();
    firstMesh.addEventListener("dispose", disposed);
    expect(firstMesh.boundingSphere!.radius).toBeGreaterThan(4);
    expect((firstMesh.material as THREE.ShaderMaterial).uniforms["fogColor"]).toBeDefined();
    expect(disposables).toHaveLength(8);
    disposables.forEach((resource) => resource.dispose());
    expect(disposed).toHaveBeenCalledOnce();
  });

  it("returns the canvas-unavailable fallback signal without changing source text", () => {
    globalThis.document = undefined as unknown as Document;
    const result = createBuildingLabelBatches(
      [{ text: "exact-building-id", position: [1, 2] }],
      [],
    );
    expect(result).toBeNull();
  });
});
