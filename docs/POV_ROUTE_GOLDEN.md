# POV route golden (G1)

`src/test/p9-pov-route-golden.test.ts` pins the SHA-256 of
`JSON.stringify(buildPovRoute(HOME_NEIGHBORHOOD))` on the fixed home neighbourhood (G1,
`src/world/data/homeNeighborhood.json`). It guards the AABB broadphase in
`src/engine/life/pov.ts`: the route must stay byte-identical to the exhaustive
point-in-polygon builder it replaced (b6293467), not just have the same segment count.

The broadphase pads each solid's bounds by `EPSILON` from `src/world/geometry.ts`, inclusive
(`>=`/`<=`), because `pointInPolygon` counts points within `EPSILON` of an edge as inside.

## Regenerate or re-verify

```sh
node scripts/pov-route-golden.mjs            # hash of the working tree
node scripts/pov-route-golden.mjs b6293467   # also the exhaustive reference (about 40 s)
```

Both lines must print the same `sha256`. The script runs the route inside Vitest (Node/V8),
the runtime of the unit test and the same engine family as Chromium. Do not regenerate under
Bun: JavaScriptCore's `Math.hypot` differs in the last bit for some segment lengths, which
changes the hash without any real route change.

Only update the pinned hash when G1 or the route algorithm changes on purpose, and record
why in the commit message. If G1 changes, regenerate from a revision whose `pov.ts` is known
good against the new data.
