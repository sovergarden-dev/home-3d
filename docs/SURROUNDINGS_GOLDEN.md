# Surroundings goldens (PR-2)

`src/test/surroundings-plan.test.ts` pins the SHA-256 of `JSON.stringify(planSurroundings(HOME_NEIGHBORHOOD, HOME_ENRICHMENT, tier))` for each tier, on the fixed home neighbourhood (`a6cdca34…2c9a`, `138` OSM roads and `339` core-zone footprints within `180 m` of home combining `135` OSM, `189` Overture `2026-11-18.0` / Google Open Buildings, and `15` focal-block buildings) and the committed layer `src/world/data/homeNeighborhood.enrichment.json` (layer revision `osm-surroundings-2026-11-13`, `midFactor = 0.25`, generator seed `20261113`).

| Tier | Trees | Props | SHA-256                                                            |
| ---- | ----: | ----: | ------------------------------------------------------------------ |
| low  |   150 |    80 | `97704fcbb6ad3e60c86a49ed65e1639fbeb9f951f14382e2c74648e1bf748ed3` |
| mid  |   271 |   200 | `0470e95578570fc113a7b33a0bb53a923a38e9fedb0bc3f712d209cee2b3f938` |
| high |   271 |   369 | `6d826d53dbf451e231ef07e339a560419e9a56f500a589ee697444f7789410a1` |

Composition (mid): 270 procedural + 1 OSM tree, 200 props (`mid` and `high` share `271` trees because all 271 road-clear candidates fit under the `mid` cap of 400).

_(Updated 2026-11-28 after trimming far-away buildings outside the `180 m` green core zone around home per owner direction, reducing `homeNeighborhood.json` from `1300` to `339` core buildings and tuning `midFactor` from `0.35` to `0.25` to keep the `> 1.5x` inner-ring green density falloff.)_

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

`src/test/planMassing.test.ts` pins the canonical-JSON SHA-256 of `planMassing(HOME_NEIGHBORHOOD, HOME_ENRICHMENT)` on the canonical neighborhood package (`a6cdca34…2c9a`) and enrichment layer (seed `20261113`, `floorHeight = 3.3`, `levelsWeights = [3, 4, 2, 1]`, `roofWeights = { corrugated: 4, flat: 3, terrace_tum: 3 }`, `homeExclusionRadius = 12`, `homeDominanceRadius = 30`, `homeMaxNeighbourLevels = 3`):

| Plan | Items | Skipped (known / sourced heights) | SHA-256 |
| --- | ---: | ---: | --- |
| `planMassing` | 322 | 17 | `9edbebd6ec6913541cbd9a6f1c6a4e0fed864ec4e109af5c3c4e180cc6c76c79` |

Skipped set (`17` buildings): `15` owner-authorized focal-block buildings (`source: "survey"`, verified heights/parts) and `2` OSM buildings with `buildingFacts.levels`. Every estimated item (`322`) carries `origin: "estimated_procedural"` and is inset `0.08 m` inside its footprint so party-wall neighbours neither intersect nor z-fight (`0` overlaps across all `339` buildings).

## Procedural street styling golden (PR-5)

`src/test/worldMesh.test.ts` pins the canonical-JSON SHA-256 of `planProceduralStreetTrim(HOME_NEIGHBORHOOD)` on the committed world (`138` OSM roads, `339` core building footprints):

| Plan | Sidewalk quads | Curb quads | Lane-marking quads | Alley-trim quads | SHA-256 |
| --- | ---: | ---: | ---: | ---: | --- |
| `planProceduralStreetTrim` | 706 | 706 | 1102 | 83 | `456ec49c79233b8677e48e85baa4ea05fbc36834678ad8297e11253827c4818c` |

Carriageway style classes across the 138 canonical roads (`surface: "unknown"`): 35 `primary_asphalt`, 26 `secondary_asphalt`, 20 `residential_asphalt` (11 `residential` + 9 `unknown`), 39 `service_pavement`, 18 `alley_concrete`. Every procedural trim quad (`2597` total) carries `origin: "estimated_procedural"`, renders in a single `InstancedMesh` draw call (`receiveShadow = false`), avoids all `339` building footprints (`0` overlaps), stays clear of crossing carriageways via 3-point sampling, and hides under geometry-confidence inspection (`setConfidenceVisible(true)`).

## Procedural massing facades golden (PR-6)

`src/test/planMassing.test.ts` pins the canonical-JSON SHA-256 of `planMassingFacades(HOME_NEIGHBORHOOD, HOME_ENRICHMENT, planMassing(HOME_NEIGHBORHOOD, HOME_ENRICHMENT))` (`balconyProbability = 0.6`, `shopProbabilityOnPrimary = 0.5`, `floorHeight = 3.3`):

| Plan | Balcony buildings | Primary-road shop buildings | Box instances | SHA-256 |
| --- | ---: | ---: | ---: | --- |
| `planMassingFacades` | 58 | 15 | 207 | `655755bb4bf2080a1c0a58feba8167d38f25db15c525a92601e85eaacf351b3e` |

Rendered in a single `InstancedMesh` (`estimated-facades:instanced`, `castShadow = false`, `receiveShadow = false`, no-op `raycast`, `0` neighbor building overlaps across all `339` buildings, hidden under `setConfidenceVisible(true)`).
