# Fixed Neighborhood Reuse Playbook

This guide describes how to create a separate fixed-home deployment from this app without reintroducing runtime world uploads, package editing, or personal data into a public repository. Treat each neighborhood as a separately reviewed dataset and deployment. The current `HOME_NEIGHBORHOOD` is an illustrative synthetic fixture, not a survey or a verified record of any property.

## Product contract

A fixed-home build has exactly one bundled `WorldData` source. The scene reads it through a read-only session and always keeps the configured home center. Users can change the time preset, simulated weather, language, zoom, compass orientation, and Diorama/Plan camera mode. There is no URL switch, file picker, package export, or mutable package store.

Keep these boundaries:

- Neighborhood geometry is immutable build-time data. UI state stays in Zustand; do not copy world geometry or exact coordinates into shared or server-rendered state.
- `homeWorldSession` exposes a snapshot, subscription, and harmless read-only metadata only. Do not add `openFile`, `openText`, export, reset, or mutation APIs.
- Synthetic geometry remains explicitly marked synthetic. Do not describe estimates as cadastral or surveyed truth.
- Keep secrets, exact address/coordinates, source photographs, and non-public source material out of Git, CI artifacts, browser logs, analytics, and public build output.
- Do not derive new geometry or imagery from Google Maps Platform content. Use sources with suitable licenses or material supplied and authorized by the owner.

## Fork procedure

1. Create a new private working copy or repository from the approved application baseline. Keep the application license, notices, lockfile, CI security settings, and existing safety checks.
2. Decide the data classification and publication boundary before importing anything. Public synthetic data and private real-neighborhood data are distinct paths. For a public build, only sanitized and authorized data belongs in source control.
3. Prepare a candidate `WorldData` offline. Normalize geometry to the project ENU convention: metres, +X east, +Y up, and -Z north; the origin is the intended home center. Validate geometry, IDs, schema version, bounds, provenance, and licensing before bundling.
4. Replace `src/world/homeNeighborhood.ts` with the reviewed dataset. Give the dataset a new revision and preserve truthful provenance and `isSynthetic` status. Do not include geodetic origin coordinates or an address in the public dataset.
5. Update `src/config/site.ts`: translated home label, neutral neighborhood subtitle, and default hour/weather. The visible controls are six radios: three time presets (Morning, Afternoon, Evening) and three weather presets (Sunny, Cloudy, Rain). Keep the presets and labels aligned with the store types and i18n dictionaries.
6. Review the artwork in `src/engine/illustration/details.ts`, `src/engine/life/rendering.ts`, and `src/engine/world/buildWorldMeshes.ts`. Make details visually consistent with the approved source and clearly illustrative where they are inferred. Do not encode survey claims in stylized models.
7. Review `src/i18n/vi.ts` and `src/i18n/en.ts` together. Preserve matching keys and make weather labels distinguish the supported modes. The visible controls are six radios: three time presets and three weather presets.
8. Update tests with synthetic or explicitly approved fixtures. Add checks for the read-only session, no upload/export controls, localization, time progression, stable single-world rendering, Plan/Diorama camera behavior, WebGL recovery, nonblank rendered pixels, and clean resource disposal. Retire tests whose only contract is a removed feature; do not count them as skipped passes.
9. Run the full quality and privacy gates below. Inspect built client assets and generated reports for sensitive material before distribution. Keep browser and hardware claims limited to the environments actually tested.

## Architecture map

- `src/world/homeNeighborhood.ts`: fixed build-time geometry and provenance.
- `src/world/homeWorldSession.ts`: read-only adapter consumed by the renderer.
- `src/config/site.ts`: translated site identity and preset configuration.
- `src/state/appStore.ts`: user-facing controls only. The normal simulation clock runs at `timeSpeed: 1`.
- `src/components/overlay/Dock.tsx`: the six time/weather radio controls.
- `src/components/overlay/TopInfo.tsx`: home label, current period/weather, and build identity.
- `src/components/overlay/TopActions.tsx`: VI/EN selector and About link (`/gioi-thieu`).
- `src/components/overlay/MapControls.tsx`: zoom, home reset, compass, and the two view modes.
- `src/engine/demoScene.ts`: client-only Three.js renderer and deterministic mount/dispose lifecycle.

When starting another neighborhood, copy the application into a separate repository rather than adding a runtime multi-world selector here. Keep the adapter API stable unless a tested engine contract requires a change.

## Validation gates

Run commands from the repository root with the repository's pinned Bun version and frozen lockfile.

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run build
bun run check:bundle
bun run check:secrets
bun run test:e2e --project=chromium
```

The bundle check enforces the shell gzip budget and verifies that the scene engine remains lazy-loaded. The secret scanner depends on Gitleaks; a missing executable is a blocked check, not a pass. Coverage is enforced through `bun run test:coverage`, which runs the coverage suite and ratchet script. Run the pipeline checks only when changing pipeline-owned source or contracts; fixed-home rendering must not broaden the pipeline's data scope.

The default Playwright selection is the fixed-home acceptance suite, not the historical package/editor suite. It covers the fixed shell, accessibility at desktop/portrait/short-landscape sizes, 20 camera-view changes plus one About/home remount, shader-gated startup, WebGL context loss/retry, nonblank scene pixels, immutable fixture geometry and disposal, and Chromium heap retention. Historical package import/export, editor, real-street, festival, audio, memory, tour, and postcard E2E cases are retired with those product flows; they are not acceptance requirements for this fixed-home build. Firefox and WebKit skip only the Chromium-CDP heap-retention test. `REQUIRE_WEBGL2=1` requires a rendered WebGL scene but does not prove a physical GPU or a 60 FPS hardware budget.

E2E runs must report whether WebGL2 was actually available. A DOM fallback is a UI result, not evidence that the Three.js scene rendered or meets a hardware FPS target. When a supported headed GPU runner exists, measure the scene with a documented browser/GPU/driver/viewport/DPR and keep the dataset synthetic or approved for that environment.

## Release review

Before publishing a fork, review the entire diff, repository visibility, deployment target, public assets, source maps, service-worker cache, and CI artifacts. Confirm that the single-world contract still holds in the emitted client bundle, no personal coordinates or local paths appear, and no runtime data import path is reachable. Keep deployment and publication as explicit owner-approved actions; local build success does not authorize either.
