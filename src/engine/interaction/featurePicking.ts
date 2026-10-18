import * as THREE from "three";
import type { FeatureSelection } from "@/world/featureSelection";

export interface PickableMesh extends THREE.Object3D {
  userData: THREE.Object3D["userData"] & {
    featureId?: string;
    featureType?: FeatureSelection["featureType"];
    confidence?: FeatureSelection["confidence"];
  };
}

export function pickFeature(
  raycaster: THREE.Raycaster,
  pointerNdc: THREE.Vector2,
  camera: THREE.Camera,
  root: THREE.Object3D,
  hiddenLayers: ReadonlySet<string> = new Set(),
): FeatureSelection | null {
  raycaster.setFromCamera(pointerNdc, camera);
  const hits = raycaster.intersectObject(root, true);
  for (const hit of hits) {
    let current: THREE.Object3D | null = hit.object;
    let hidden = false;
    let candidate: FeatureSelection | null = null;
    while (current && current !== root) {
      const layerName = current.name.startsWith("layer:") ? current.name.slice(6) : null;
      if (!current.visible || (layerName && hiddenLayers.has(layerName))) {
        hidden = true;
        break;
      }
      const data = (current as PickableMesh).userData;
      if (!candidate && data.featureId && data.featureType) {
        candidate = {
          featureId: data.featureId,
          featureType: data.featureType,
          ...(data.confidence ? { confidence: data.confidence } : {}),
          ...(typeof current.userData["parentFeatureId"] === "string"
            ? { parentFeatureId: current.userData["parentFeatureId"] as string }
            : {}),
        };
      }
      current = current.parent;
    }
    if (hidden) continue;
    if (candidate) return candidate;
  }
  return null;
}

export function isTap(start: THREE.Vector2, end: THREE.Vector2, maxDistanceCss = 6) {
  return start.distanceTo(end) <= maxDistanceCss;
}
