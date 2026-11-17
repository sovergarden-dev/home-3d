# Surroundings goldens (PR-2)

`src/test/surroundings-plan.test.ts` pins the SHA-256 of
`JSON.stringify(planSurroundings(HOME_NEIGHBORHOOD, HOME_ENRICHMENT, tier))` for each tier, on the
fixed home neighbourhood (G1 `cd4f0146…7ce3`) and the committed layer
`src/world/data/homeNeighborhood.enrichment.json` (layer revision `osm-surroundings-2026-11-13`,
source revision `overpass-osm-base-2026-11-13T12:02:48Z`, generator seed `20261113`).

| Tier | Trees | Props | SHA-256                                                            |
| ---- | ----: | ----: | ------------------------------------------------------------------ |
| low  |   150 |    80 | `b632057c20115be3e9017f31e147bf4c2c1d7cb0b883b4a129e735baefd9541a` |
| mid  |   352 |   200 | `b3e7e0ad506a51e8479e6bab463a701fe6a34f628ba4b193d9419c9b2d8985b9` |
| high |   352 |   400 | `eee40bacc5aae989ddccb942b6b633e8a161b0b506b9cb196ec8845b6b084055` |

Composition (mid): 351 procedural + 1 OSM tree; 123 parked motorbikes, 15 vendor carts,
21 + 1 OSM street lights, 34 + 6 OSM electric poles. `mid` and `high` have the same trees because
all 352 tree candidates fit under the `mid` cap (400).

_(Updated 2026-11-14 to enforce 1.0 m clearance pass across all tiers, eliminating 17 tree↔prop
overlap pairs and 1 tree↔tree overlap pair (0.42 m) identified in PR #28 QA review)._

## What changes a golden

Any of these changes the hashes and must be an explicit, reviewed update of this file and the
test literals, never a silent regeneration:

- the generator code in `src/world/enrichment/planSurroundings.ts` (spacing, offsets, rejection
  rules, PRNG keys, tier caps in `src/world/enrichment/schema.ts`);
- `generator` parameters or `pointFacts` in the layer file;
- re-running `scripts/osm-surroundings-snapshot.ts` (the OSM `sourceRevision` is part of each
  fact's provenance);
- the canonical package (impossible without breaking G1).

The same test also checks that the plan is identical across repeated runs and under shuffled
road/building order, and that `low ⊆ mid ⊆ high`.

## What it does not guard

Surroundings are decoration only. They are not colliders and are never passed to
`buildPovRoute` or to life solids, so the POV route golden in `docs/POV_ROUTE_GOLDEN.md` is
unaffected by construction (and is still asserted by `p9-pov-route-golden.test.ts`).

## Estimated building massing golden (PR-3)

`src/test/planMassing.test.ts` pins the canonical-JSON SHA-256 of `planMassing(HOME_NEIGHBORHOOD, HOME_ENRICHMENT)` on the same G1 package and enrichment layer (seed `20261113`, `floorHeight = 3.3`, `levelsWeights = [3, 4, 2, 1]`, `roofWeights = { corrugated: 4, flat: 3, terrace_tum: 3 }`, `homeExclusionRadius = 12`, `homeDominanceRadius = 30`, `homeMaxNeighbourLevels = 3`):

| Plan | Items | Skipped (OSM `buildingFacts`) | SHA-256 |
| --- | ---: | ---: | --- |
| `planMassing` | 315 | 2 | `9e47e8b5561515380303677837c73e7a55fa302819a84ae570fe9635965cf6a7` |

Composition: 81 × 1F, 129 × 2F, 69 × 3F, 36 × 4F; roofs: 119 `corrugated`, 98 `flat`, 98 `terrace_tum`. Every item carries `origin: "estimated_procedural"` and is inset `0.08 m` inside its canonical OSM footprint so party-wall neighbours neither intersect nor z-fight.

## Procedural street styling golden (PR-5)

`src/test/worldMesh.test.ts` pins the canonical-JSON SHA-256 of `planProceduralStreetTrim(HOME_NEIGHBORHOOD)` on the committed G1 world (`138` OSM roads, `317` OSM building footprints):

| Plan | Sidewalk quads | Curb quads | Lane-marking quads | Alley-trim quads | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| `planProceduralStreetTrim` | 729 | 729 | 1602 | 94 | `d324b18505e9736b45861badc25caf9a30f6f6466deb9cd6b7377d8815640bc0` |

Carriageway style classes across the 138 canonical roads (`surface: "unknown"`): 35 `primary_asphalt`, 26 `secondary_asphalt`, 11 `residential_asphalt`, 9 `unclassified_asphalt`, 39 `service_pavement`, 18 `alley_concrete`. Every procedural trim quad carries `origin: "estimated_procedural"`, avoids canonical building footprints (`0` overlaps), and hides under geometry-confidence inspection (`setConfidenceVisible(true)`).
