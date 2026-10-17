export interface FeatureSelection {
  featureId: string;
  featureType: "building" | "building-part" | "road" | "lot" | "tree" | "prop";
  parentFeatureId?: string;
  confidence?: "known" | "inferred" | "synthetic" | "unknown";
}

export const FEATURE_SELECTION_EVENT = "home3d:feature-selection";
export const CONFIDENCE_VISIBILITY_EVENT = "home3d:confidence-visibility";

let selectedFeature: FeatureSelection | null = null;
let confidenceVisible = false;
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((listener) => listener());
}

export function getSelectedFeature() {
  return selectedFeature;
}

export function selectFeature(selection: FeatureSelection | null) {
  selectedFeature = selection;
  notify();
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(FEATURE_SELECTION_EVENT, { detail: selection }));
}

export function subscribeFeatureSelection(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isConfidenceVisible() {
  return confidenceVisible;
}

export function setConfidenceVisible(visible: boolean) {
  confidenceVisible = visible;
  notify();
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent(CONFIDENCE_VISIBILITY_EVENT, { detail: visible }));
}

export function subscribeConfidenceVisibility(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
