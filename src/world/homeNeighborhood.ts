import { WORLD_SCHEMA_VERSION, type Provenance, type WorldData } from "./schema";
import { SYNTHETIC_NEIGHBORHOOD } from "./fixtures/syntheticNeighborhood";

const provenance: Provenance = { source: "synthetic", quality: "synthetic" };
const synthetic = structuredClone(SYNTHETIC_NEIGHBORHOOD);

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const HOME_NEIGHBORHOOD = deepFreeze<WorldData>({
  manifest: {
    schemaVersion: WORLD_SCHEMA_VERSION,
    datasetRevision: "home-neighborhood-v1",
    units: "metres",
    frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
    isSynthetic: true,
    chunks: [{ localId: "home-core", bounds: [-80, -40, 80, 45], tier: "core" }],
    assetHashes: {},
    licences: ["CC0-1.0 Sanitized Neighborhood Baseline"],
    coverage: { quality: "synthetic", sourceCount: 1 },
  },
  roads: synthetic.roads.map((r) => ({ ...r, provenance })),
  buildings: synthetic.buildings.map((b) => ({ ...b, provenance })),
  lots: synthetic.lots.map((l) => ({ ...l, provenance })),
  trees: [
    { localId: "tree-front-1", position: [-14, -8], height: 5.2, provenance },
    { localId: "tree-front-2", position: [-2, -8], height: 4.8, provenance },
    { localId: "tree-front-3", position: [12, -7], height: 5.6, provenance },
    { localId: "tree-front-4", position: [26, -6], height: 6.0, provenance },
    { localId: "tree-front-5", position: [42, -5], height: 4.5, provenance },
    { localId: "tree-alley-1", position: [20, 4], height: 4.2, provenance },
    { localId: "tree-alley-2", position: [16, 18], height: 5.0, provenance },
    { localId: "tree-alley-3", position: [14, 28], height: 4.6, provenance },
    { localId: "tree-back-1", position: [-18, 41], height: 5.5, provenance },
    { localId: "tree-back-2", position: [4, 38], height: 5.2, provenance },
    { localId: "tree-back-3", position: [28, 36], height: 6.2, provenance },
  ],
  props: [
    { localId: "pole-1", position: [-20, -10], kind: "electric_pole", provenance },
    { localId: "pole-2", position: [8, -8], kind: "electric_pole", provenance },
    { localId: "pole-3", position: [36, -6], kind: "electric_pole", provenance },
    { localId: "light-1", position: [-6, -9], kind: "street_light", provenance },
    { localId: "light-2", position: [22, -7], kind: "street_light", provenance },
    { localId: "bench-1", position: [2, -9], kind: "bench", provenance },
    { localId: "bench-2", position: [30, -7], kind: "bench", provenance },
  ],
});
