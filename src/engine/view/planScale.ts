export interface PlanScaleBar {
  metres: number;
  cssPixels: number;
}

export function calculatePlanScaleBar(metresPerPixel: number, targetCssPixels = 120): PlanScaleBar {
  if (!Number.isFinite(metresPerPixel) || metresPerPixel <= 0) {
    throw new Error("PLAN_SCALE_INVALID_METRES_PER_PIXEL");
  }
  if (!Number.isFinite(targetCssPixels) || targetCssPixels <= 0) {
    throw new Error("PLAN_SCALE_INVALID_TARGET_WIDTH");
  }

  const targetMetres = metresPerPixel * targetCssPixels;
  const exponent = Math.floor(Math.log10(targetMetres));
  const base = 10 ** exponent;
  const candidates = [1, 2, 5, 10].map((factor) => factor * base);
  const metres = candidates.filter((candidate) => candidate <= targetMetres).at(-1) ?? base / 10;

  return { metres, cssPixels: metres / metresPerPixel };
}
