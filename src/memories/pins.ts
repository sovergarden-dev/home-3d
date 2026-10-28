import * as THREE from "three";
import type { Memory } from "./schema";
export type MemoryPin = Memory;
export type PinTier = "low" | "mid" | "high" | "ultra";
export const PIN_CAPS: Record<PinTier, number> = { low: 40, mid: 120, high: 300, ultra: 300 };
export const PIN_DIAMETER_CSS = 20;
export const PIN_HIT_DIAMETER_CSS = 44;
const quadSize = PIN_DIAMETER_CSS / 0.7;
const circleOffset = quadSize * 0.625;
export function pinCap(tier: PinTier) {
  return PIN_CAPS[tier];
}
export interface MemoryPinLayer {
  group: THREE.Group;
  mesh: THREE.InstancedMesh;
  memories: MemoryPin[];
  update: (memories: readonly MemoryPin[], guest: boolean) => void;
  pick: (
    x: number,
    y: number,
    camera: THREE.Camera,
    width: number,
    height: number,
  ) => string | null;
  setHovered: (id: string | null) => boolean;
  setSelected: (id: string | null) => boolean;
  dispose: () => void;
}
export function createMemoryPinLayer(tier: PinTier = "mid"): MemoryPinLayer {
  const cap = pinCap(tier),
    group = new THREE.Group();
  group.name = "memory-pins";
  const geometry = new THREE.PlaneGeometry(2, 2);
  const highlight = new THREE.InstancedBufferAttribute(new Float32Array(cap), 1);
  highlight.setUsage(THREE.DynamicDrawUsage);
  geometry.setAttribute("pinHighlight", highlight);
  const viewport = new THREE.Vector2(1, 1);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      pinViewport: { value: viewport },
      pinQuadSize: { value: quadSize },
      pinColor: { value: new THREE.Color("#d86845") },
    },
    transparent: true,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
    vertexShader: `
      uniform vec2 pinViewport;
      uniform float pinQuadSize;
      attribute float pinHighlight;
      varying vec2 pinUv;
      varying float pinActive;
      void main() {
        pinUv = uv;
        pinActive = pinHighlight;
        gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        vec2 offset = (position.xy + vec2(0.0, 1.0)) * pinQuadSize * 0.5;
        gl_Position.xy += 2.0 * offset / pinViewport * gl_Position.w;
      }
    `,
    fragmentShader: `
      uniform vec3 pinColor;
      uniform float pinQuadSize;
      varying vec2 pinUv;
      varying float pinActive;
      void main() {
        vec2 p = pinUv * 2.0 - 1.0;
        float circle = length(p - vec2(0.0, 0.25)) - 0.7;
        float tail = max((abs(p.x) - 0.56 * (p.y + 1.0)) / sqrt(1.3136), p.y + 0.15);
        float distance = min(circle, tail);
        float aa = max(fwidth(distance), 0.001);
        float alpha = 1.0 - smoothstep(-aa, aa, distance);
        if (alpha <= 0.001) discard;
        float stroke = mix(0.75, 2.0, pinActive) * 2.0 / pinQuadSize;
        float edge = smoothstep(-stroke - aa, -stroke + aa, distance);
        vec3 outline = mix(pinColor * 0.55, vec3(1.0), pinActive);
        gl_FragColor = vec4(mix(pinColor, outline, edge), alpha);
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, cap);
  mesh.name = "memory-pins-instanced";
  mesh.count = 0;
  mesh.visible = false;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  mesh.frustumCulled = false;
  // DOM home markers and the existing transparent label layer retain priority.
  mesh.renderOrder = -1;
  mesh.onBeforeRender = (renderer) => {
    const target = renderer.getRenderTarget();
    const cssHeight = Math.max(1, renderer.domElement.clientHeight);
    viewport.set(
      target
        ? (cssHeight * target.width) / target.height
        : Math.max(1, renderer.domElement.clientWidth),
      cssHeight,
    );
  };
  const position = new THREE.Vector3(),
    quaternion = new THREE.Quaternion(),
    scale = new THREE.Vector3(1, 1, 1),
    matrix = new THREE.Matrix4(),
    visibleMemories: MemoryPin[] = [];
  const projected = new THREE.Vector4();
  let hovered: string | null = null;
  let selected: string | null = null;
  const writePosition = (index: number) => {
    const memory = visibleMemories[index]!;
    position.set(memory.position[0], memory.position[1], memory.position[2]);
    mesh.setMatrixAt(index, matrix.compose(position, quaternion, scale));
  };
  const raiseActive = () => {
    const id = hovered ?? selected;
    if (!id || visibleMemories.length < 2) return;
    const last = visibleMemories.length - 1;
    const index = visibleMemories.findIndex((memory) => memory.id === id);
    if (index < 0 || index === last) return;
    const memory = visibleMemories[index]!;
    visibleMemories[index] = visibleMemories[last]!;
    visibleMemories[last] = memory;
    writePosition(index);
    writePosition(last);
    mesh.instanceMatrix.needsUpdate = true;
  };
  const refreshHighlight = () => {
    let changed = false;
    for (let i = 0; i < visibleMemories.length; i++) {
      const active =
        visibleMemories[i]!.id === hovered || visibleMemories[i]!.id === selected ? 1 : 0;
      if (highlight.getX(i) !== active) {
        highlight.setX(i, active);
        changed = true;
      }
    }
    if (changed) highlight.needsUpdate = true;
    return changed;
  };
  const update = (memories: readonly MemoryPin[], guest: boolean) => {
    visibleMemories.length = 0;
    for (const memory of memories) {
      if (visibleMemories.length >= cap) break;
      if (
        guest &&
        (memory.visibility !== "public" || memory.photos.some((photo) => !photo.reviewed))
      )
        continue;
      visibleMemories.push(memory);
      position.set(memory.position[0], memory.position[1], memory.position[2]);
      mesh.setMatrixAt(visibleMemories.length - 1, matrix.compose(position, quaternion, scale));
    }
    mesh.count = visibleMemories.length;
    mesh.visible = mesh.count > 0;
    // compile() traverses invisible meshes too; detach the empty layer until it has content.
    if (mesh.visible) {
      if (mesh.parent !== group) group.add(mesh);
    } else mesh.removeFromParent();
    mesh.instanceMatrix.needsUpdate = true;
    raiseActive();
    refreshHighlight();
  };
  return {
    group,
    mesh,
    memories: visibleMemories,
    update,
    pick(x, y, camera, width, height) {
      if (!group.visible || width <= 0 || height <= 0 || x < 0 || y < 0 || x > width || y > height)
        return null;
      camera.updateMatrixWorld();
      let nearest: string | null = null;
      let distance = (PIN_HIT_DIAMETER_CSS / 2) ** 2;
      for (const memory of visibleMemories) {
        projected.set(memory.position[0], memory.position[1], memory.position[2], 1);
        projected.applyMatrix4(camera.matrixWorldInverse).applyMatrix4(camera.projectionMatrix);
        if (projected.w <= 0 || Math.abs(projected.z / projected.w) > 1) continue;
        const px = ((projected.x / projected.w) * 0.5 + 0.5) * width;
        const anchorY = ((-projected.y / projected.w) * 0.5 + 0.5) * height;
        if (
          px + PIN_DIAMETER_CSS / 2 < 0 ||
          px - PIN_DIAMETER_CSS / 2 > width ||
          anchorY < 0 ||
          anchorY - quadSize > height
        )
          continue;
        const py = anchorY - circleOffset;
        const candidate = (px - x) ** 2 + (py - y) ** 2;
        if (
          candidate < distance ||
          (candidate === distance && (nearest === null || memory.id < nearest))
        ) {
          distance = candidate;
          nearest = memory.id;
        }
      }
      return nearest;
    },
    setHovered(id) {
      if (hovered === id) return false;
      hovered = id;
      raiseActive();
      return refreshHighlight();
    },
    setSelected(id) {
      if (selected === id) return false;
      selected = id;
      raiseActive();
      return refreshHighlight();
    },
    dispose() {
      visibleMemories.length = 0;
      group.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
    },
  };
}
