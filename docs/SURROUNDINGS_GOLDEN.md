# Surroundings goldens (PR-2)

`src/test/surroundings-plan.test.ts` pins the SHA-256 of
`JSON.stringify(planSurroundings(HOME_NEIGHBORHOOD, HOME_ENRICHMENT, tier))` for each tier, on the
fixed home neighbourhood (G1 `cd4f0146…7ce3`) and the committed layer
`src/world/data/homeNeighborhood.enrichment.json` (layer revision `osm-surroundings-2026-11-13`,
source revision `overpass-osm-base-2026-11-13T12:02:48Z`, generator seed `20261113`).

| Tier | Trees | Props | SHA-256 |
| ---- | ----: | ----: | ------- |
| low  |   150 |    80 | `d8d3e66ee15ff1c902e027c01214afc44bc31307b087313bdd6405a0cf7e396f` |
| mid  |   353 |   200 | `6e7a33f75d5d6223ba95a6bd7dc2e34bb99562ab1c7826d53f2858999e0f641f` |
| high |   353 |   400 | `c8cc7c3a33e62c1db56d929618c97f8852daaab9759a21c6d684bf3adf132613` |

Composition (mid): 352 procedural + 1 OSM tree; 123 parked motorbikes, 15 vendor carts,
21 + 1 OSM street lights, 34 + 6 OSM electric poles. `mid` and `high` have the same trees because
all 353 tree candidates fit under the `mid` cap (400).

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
