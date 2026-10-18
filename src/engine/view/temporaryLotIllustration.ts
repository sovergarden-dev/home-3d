/** UI-only marker definition. This is intentionally not part of WorldData or package geometry. */
export const TEMPORARY_LOT_ILLUSTRATION = Object.freeze({
  classification: "illustrative-only",
  anchor: "supplied-enu-origin",
  boundaryGeometry: null,
} as const);

/** A small visual lift above the supplied origin; horizontal anchor remains (0, 0). */
export const TEMPORARY_LOT_ILLUSTRATION_POSITION = Object.freeze({
  x: 0,
  y: 0.35,
  z: 0,
} as const);
