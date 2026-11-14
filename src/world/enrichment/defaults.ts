import type { GeneratorParams } from "./schema";

/** Generator parameters written into the snapshot by the offline script. */
export const DEFAULT_GENERATOR_PARAMS: GeneratorParams = {
  seed: 20261113,
  homeExclusionRadius: 12,
  homeDominanceRadius: 30,
  homeMaxNeighbourLevels: 3,
  density: { denseRadius: 150, midRadius: 300, midFactor: 0.4, farFactor: 0.12 },
  streetTreeSpacing: {
    primary: 14,
    secondary: 16,
    residential: 20,
    alley: 0,
    service: 0,
    unknown: 0,
  },
  poleSpacing: 35,
  vendorCartsPer100m: 0.8,
  parkedMotorbikesPer100m: 6,
  massing: {
    levelsWeights: [3, 4, 2, 1],
    roofWeights: { corrugated: 4, flat: 3, terrace_tum: 3 },
    balconyProbability: 0.6,
    shopProbabilityOnPrimary: 0.5,
    floorHeight: 3.3,
  },
  life: { motorbikeToCarRatio: 2.5, pedestriansPer100m: 3 },
};
