# Surroundings goldens (PR-2)

`src/test/surroundings-plan.test.ts` pins the SHA-256 of `JSON.stringify(planSurroundings(HOME_NEIGHBORHOOD, HOME_ENRICHMENT, tier))` for each tier, on the fixed home neighbourhood (`6f2f2dd0…db48`, `138` OSM roads and `1300` footprints combining `317` OSM, `968` Overture `2026-11-18.0` / Google Open Buildings, and `15` focal-block buildings) and the committed layer `src/world/data/homeNeighborhood.enrichment.json` (layer revision `osm-surroundings-2026-11-13`, `midFactor = 0.35`, generator seed `20261113`).

| Tier | Trees | Props | SHA-256                                                            |
| ---- | ----: | ----: | ------------------------------------------------------------------ |
| low  |   150 |    80 | `29f0729e8ec3173bfe0705063ae34cfa682ec6d78ebea7f3b9110fa4d1bde264` |
| mid  |   285 |   200 | `cb4a3bf45024e229bac83592b24afdadb2fe706aef3b2ead6609d08c93a2112e` |
| high |   285 |   344 | `53c586aa98719748a3a4adc4f0931d43378f6014fc94c8d24d9399f78e64cca5` |

Composition (mid): 284 procedural + 1 OSM tree, 200 props (`mid` and `high` share `285` trees because all 285 road-clear candidates fit under the `mid` cap of 400).

_(Updated 2026-11-28 after owner-authorized conflation of Overture `2026-11-18.0` / Google Open Buildings footprints and focal-block building models into `homeNeighborhood.json`, adjusting `midFactor` from `0.4` to `0.35` to preserve the `> 1.5x` inner-ring density falloff around the newly populated core blocks.)_

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

`src/test/planMassing.test.ts` pins the canonical-JSON SHA-256 of `planMassing(HOME_NEIGHBORHOOD, HOME_ENRICHMENT)` on the canonical neighborhood package (`6f2f2dd0…db48`) and enrichment layer (seed `20261113`, `floorHeight = 3.3`, `levelsWeights = [3, 4, 2, 1]`, `roofWeights = { corrugated: 4, flat: 3, terrace_tum: 3 }`, `homeExclusionRadius = 12`, `homeDominanceRadius = 30`, `homeMaxNeighbourLevels = 3`):

| Plan | Items | Skipped (known / sourced heights) | SHA-256 |
| --- | ---: | ---: | --- |
| `planMassing` | 1280 | 20 | `cd80662015bd763c7693453e4d59685fd3c7ccecc7f9ae7a8a3e69ae065de651` |

Skipped set (`20` buildings): `15` owner-authorized focal-block buildings (`source: "survey"`, verified heights/parts), `2` OSM buildings with `buildingFacts.levels`, and `3` Overture buildings with `num_floors`. Every estimated item (`1280`) carries `origin: "estimated_procedural"` and is inset `0.08 m` inside its footprint so party-wall neighbours neither intersect nor z-fight (`0` overlaps across all `1300` buildings).

## Procedural street styling golden (PR-5)

`src/test/worldMesh.test.ts` pins the canonical-JSON SHA-256 of `planProceduralStreetTrim(HOME_NEIGHBORHOOD)` on the committed world (`138` OSM roads, `1300` building footprints):

| Plan | Sidewalk quads | Curb quads | Lane-marking quads | Alley-trim quads | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| `planProceduralStreetTrim` | 776 | 776 | 1102 | 83 | `71b7443a3ce0db34b2eb2f6bc9728414940bed46180b284236d29cc26ec7991a` |

Carriageway style classes across the 138 canonical roads (`surface: "unknown"`): 35 `primary_asphalt`, 26 `secondary_asphalt`, 20 `residential_asphalt` (11 `residential` + 9 `unknown`), 39 `service_pavement`, 18 `alley_concrete`. Every procedural trim quad (`2737` total) carries `origin: "estimated_procedural"`, renders in a single `InstancedMesh` draw call (`receiveShadow = false`), avoids all `1300` building footprints (`0` overlaps), stays clear of crossing carriageways via 3-point sampling, and hides under geometry-confidence inspection (`setConfidenceVisible(true)`).

## Procedural massing facades golden (PR-6)

`src/test/planMassing.test.ts` pins the canonical-JSON SHA-256 of `planMassingFacades(HOME_NEIGHBORHOOD, HOME_ENRICHMENT, planMassing(HOME_NEIGHBORHOOD, HOME_ENRICHMENT))` (`balconyProbability = 0.6`, `shopProbabilityOnPrimary = 0.5`, `floorHeight = 3.3`):

| Plan | Balcony buildings | Primary-road shop buildings | Box instances | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `planMassingFacades` | 237 | 40 | 858 | `8bc514ef1ce27f793d59f605132465a9074fbfb096be1b0152e71525a90c6e77` |

Rendered in a single `InstancedMesh` (`estimated-facades:instanced`, `castShadow = false`, `receiveShadow = false`, no-op `raycast`, `0` neighbor building overlaps across all `1300` buildings, hidden under `setConfidenceVisible(true)`).
