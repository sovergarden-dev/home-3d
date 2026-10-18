import * as THREE from "three";
import type { Position2 } from "@/world/schema";

type Disposable = { dispose: () => void };

const TILE_WIDTH = 256;
const TILE_HEIGHT = 48;
const ATLAS_COLUMNS = 8;
const ATLAS_ROWS = 42;
const MAX_LABELS_PER_ATLAS = ATLAS_COLUMNS * ATLAS_ROWS;
const LABEL_WIDTH = 8;
const LABEL_HEIGHT = 1.5;

export interface BuildingLabelInput {
  text: string;
  position: Position2;
}

export interface BuildingLabelBatchResult {
  group: THREE.Group;
  batchCount: number;
  labelCount: number;
}

function canDrawText() {
  return (
    typeof document !== "undefined" &&
    !(typeof navigator !== "undefined" && /jsdom/i.test(navigator.userAgent))
  );
}

function drawLabel(context: CanvasRenderingContext2D, text: string) {
  context.fillStyle = "rgba(31, 42, 37, 0.82)";
  if (typeof context.roundRect === "function") {
    context.beginPath();
    context.roundRect(0, 0, TILE_WIDTH, TILE_HEIGHT, 10);
    context.fill();
  } else {
    context.fillRect(0, 0, TILE_WIDTH, TILE_HEIGHT);
  }
  context.fillStyle = "#fffaf0";
  context.font = "600 20px system-ui";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, TILE_WIDTH / 2, TILE_HEIGHT / 2);
}

function createMaterial(texture: THREE.CanvasTexture) {
  const material = new THREE.ShaderMaterial({
    uniforms: { ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog), map: { value: texture } },
    vertexShader: `
      attribute vec4 labelUv;
      varying vec2 vLabelUv;
      #include <fog_pars_vertex>
      void main() {
        vec4 mvPosition = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        mvPosition.xy += position.xy * vec2(${LABEL_WIDTH.toFixed(1)}, ${LABEL_HEIGHT.toFixed(1)});
        gl_Position = projectionMatrix * mvPosition;
        vLabelUv = labelUv.xy + uv * labelUv.zw;
        #include <fog_vertex>
      }
    `,
    fragmentShader: `
      uniform sampler2D map;
      varying vec2 vLabelUv;
      #include <common>
      #include <fog_pars_fragment>
      void main() {
        vec4 sampled = texture2D(map, vLabelUv);
        if (sampled.a < 0.01) discard;
        gl_FragColor = sampled;
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }
    `,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: true,
    toneMapped: true,
  });
  return material;
}

function makeBatch(labels: BuildingLabelInput[], disposables: Disposable[]) {
  const columns = ATLAS_COLUMNS;
  const rows = Math.ceil(labels.length / columns);
  const canvas = document.createElement("canvas");
  canvas.width = columns * TILE_WIDTH;
  canvas.height = rows * TILE_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) return null;

  const uvData = new Float32Array(labels.length * 4);
  labels.forEach((label, index) => {
    const column = index % columns;
    const row = Math.floor(index / columns);
    const x = column * TILE_WIDTH;
    const y = row * TILE_HEIGHT;
    context.save();
    context.translate(x, y);
    drawLabel(context, label.text);
    context.restore();

    // Keep a one-pixel inset on every tile so linear filtering cannot sample a neighbour.
    const inset = 1;
    uvData.set(
      [
        (x + inset) / canvas.width,
        (canvas.height - y - TILE_HEIGHT + inset) / canvas.height,
        (TILE_WIDTH - inset * 2) / canvas.width,
        (TILE_HEIGHT - inset * 2) / canvas.height,
      ],
      index * 4,
    );
  });

  const texture = new THREE.CanvasTexture(canvas);
  // Match the previous Sprite CanvasTexture's colour interpretation.
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.flipY = true;
  const material = createMaterial(texture);
  const geometry = new THREE.PlaneGeometry(1, 1);
  geometry.setAttribute("labelUv", new THREE.InstancedBufferAttribute(uvData, 4));
  const mesh = new THREE.InstancedMesh(geometry, material, labels.length);
  mesh.name = "building-labels-batch";
  labels.forEach((label, index) => {
    mesh.setMatrixAt(
      index,
      new THREE.Matrix4().makeTranslation(label.position[0], 0.5, label.position[1]),
    );
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.frustumCulled = true;
  mesh.computeBoundingSphere();
  // Shader billboard dimensions exceed the unit plane used for CPU bounds.
  if (mesh.boundingSphere) mesh.boundingSphere.radius += Math.hypot(LABEL_WIDTH, LABEL_HEIGHT) / 2;
  disposables.push(mesh, geometry, texture, material);
  return mesh;
}

/** Returns null when canvas text is unavailable so callers can retain the Sprite fallback. */
export function createBuildingLabelBatches(
  labels: BuildingLabelInput[],
  disposables: Disposable[],
): BuildingLabelBatchResult | null {
  if (!canDrawText() || labels.length === 0) return null;
  const group = new THREE.Group();
  group.name = "building-labels";
  const firstResource = disposables.length;
  let batchCount = 0;
  for (let start = 0; start < labels.length; start += MAX_LABELS_PER_ATLAS) {
    const mesh = makeBatch(labels.slice(start, start + MAX_LABELS_PER_ATLAS), disposables);
    if (!mesh) {
      disposables.splice(firstResource).forEach((resource) => resource.dispose());
      group.clear();
      return null;
    }
    group.add(mesh);
    batchCount += 1;
  }
  return { group, batchCount, labelCount: labels.length };
}

export const BUILDING_LABELS_MAX_PER_ATLAS = MAX_LABELS_PER_ATLAS;
