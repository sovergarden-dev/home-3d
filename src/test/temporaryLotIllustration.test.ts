import { describe, expect, it } from "vitest";
import { centerMarkerLabels } from "@/components/overlay/centerMarkerLabels";
import { en as enDict } from "@/i18n/en";
import { vi as viDict } from "@/i18n/vi";
import {
  TEMPORARY_LOT_ILLUSTRATION,
  TEMPORARY_LOT_ILLUSTRATION_POSITION,
} from "@/engine/view/temporaryLotIllustration";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import { createWorldDataProvider } from "@/world/privateWorldSession";
import type { WorldData, WorldOverrideDocument } from "@/world/schema";

const expectedText = "Lô trống · minh họa tạm · ranh chưa đo";

function packageText(datasetRevision: string) {
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD) as WorldData;
  world.manifest.datasetRevision = datasetRevision;
  return JSON.stringify({ manifest: world.manifest, world });
}

describe("temporary lot illustration", () => {
  it("is an origin-anchored UI illustration with no boundary geometry", () => {
    expect(TEMPORARY_LOT_ILLUSTRATION).toEqual({
      classification: "illustrative-only",
      anchor: "supplied-enu-origin",
      boundaryGeometry: null,
    });
    expect(TEMPORARY_LOT_ILLUSTRATION_POSITION).toEqual({ x: 0, y: 0.35, z: 0 });
    expect(TEMPORARY_LOT_ILLUSTRATION).not.toHaveProperty("coordinates");
    expect(TEMPORARY_LOT_ILLUSTRATION).not.toHaveProperty("polygon");
  });

  it("shows the exact label only when a private package's illustration is explicitly selected", () => {
    expect(centerMarkerLabels("private", viDict, undefined, true)).toEqual({
      title: "Điểm tham chiếu",
      description: "Ranh chưa đo",
      illustration: expectedText,
    });
    expect(centerMarkerLabels("private", enDict, undefined, true)).toMatchObject({
      illustration: "Empty lot · temporary illustration · boundary not surveyed",
    });
    expect(centerMarkerLabels("private", viDict, undefined, false)).toEqual({
      title: "Điểm tham chiếu",
      description: "Ranh chưa đo",
    });
    expect(centerMarkerLabels("fixture", viDict, undefined, true)).toEqual({
      title: "Nhà mình",
      description: "Lô trống · vị trí giả lập",
    });
  });

  it("isolates selection by package session, preserves it for edits, and clears it on reload/reset/error", () => {
    const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
    const initial = provider.getSnapshot();
    expect(initial).toMatchObject({ mode: "fixture", temporaryLotIllustrationSelected: false });

    provider.openText(packageText("synthetic-package-a"));
    let snapshot = provider.getSnapshot();
    expect(snapshot).toMatchObject({ mode: "private", temporaryLotIllustrationSelected: false });
    expect(centerMarkerLabels(snapshot.mode, viDict, snapshot.centerConfirmation, false)).toEqual({
      title: "Điểm tham chiếu",
      description: "Ranh chưa đo",
    });

    const packageAEpoch = snapshot.packageEpoch;
    provider.toggleTemporaryLotIllustration();
    snapshot = provider.getSnapshot();
    expect(snapshot).toMatchObject({
      mode: "private",
      packageEpoch: packageAEpoch,
      temporaryLotIllustrationSelected: true,
    });
    expect(
      centerMarkerLabels(snapshot.mode, viDict, snapshot.centerConfirmation, true),
    ).toMatchObject({
      illustration: expectedText,
    });

    const packageARevision = snapshot.revision;
    const building = snapshot.mode === "private" ? snapshot.world.buildings[0] : undefined;
    if (!building) throw new Error("SYNTHETIC_BUILDING_MISSING");
    const edit: WorldOverrideDocument = {
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "synthetic-marker-session-edit",
          revision: 1,
          reason: "Synthetic same-package revision regression",
          provenance: { source: "manual_override", quality: "inferred" },
          patch: {
            operation: "patch_building",
            featureId: building.localId,
            patch: { wallHeight: building.wallHeight + 0.5 },
          },
        },
      ],
    };
    expect(provider.applyOverrides(edit)).toBe(true);
    snapshot = provider.getSnapshot();
    expect(snapshot).toMatchObject({
      mode: "private",
      packageEpoch: packageAEpoch,
      temporaryLotIllustrationSelected: true,
    });
    expect(snapshot.revision).toBeGreaterThan(packageARevision);

    provider.toggleTemporaryLotIllustration();
    expect(provider.getSnapshot()).toMatchObject({ temporaryLotIllustrationSelected: false });
    provider.toggleTemporaryLotIllustration();
    expect(provider.getSnapshot()).toMatchObject({ temporaryLotIllustrationSelected: true });

    provider.openText(packageText("synthetic-package-b"));
    snapshot = provider.getSnapshot();
    expect(snapshot).toMatchObject({ mode: "private", temporaryLotIllustrationSelected: false });
    expect(snapshot.packageEpoch).toBeGreaterThan(packageAEpoch);
    expect(centerMarkerLabels(snapshot.mode, viDict, snapshot.centerConfirmation, false)).toEqual({
      title: "Điểm tham chiếu",
      description: "Ranh chưa đo",
    });

    provider.toggleTemporaryLotIllustration();
    expect(provider.getSnapshot()).toMatchObject({ temporaryLotIllustrationSelected: true });
    provider.openText(packageText("synthetic-package-b"));
    expect(provider.getSnapshot()).toMatchObject({
      mode: "private",
      temporaryLotIllustrationSelected: false,
    });

    provider.toggleTemporaryLotIllustration();
    provider.resetFixture();
    expect(provider.getSnapshot()).toMatchObject({
      mode: "fixture",
      temporaryLotIllustrationSelected: false,
    });
    provider.toggleTemporaryLotIllustration();
    expect(provider.getSnapshot()).toMatchObject({
      mode: "fixture",
      temporaryLotIllustrationSelected: false,
    });

    provider.openText(packageText("synthetic-package-error-reset"));
    provider.toggleTemporaryLotIllustration();
    provider.openText("{ malformed package");
    expect(provider.getSnapshot()).toMatchObject({
      mode: "private-error",
      temporaryLotIllustrationSelected: false,
    });
  });
});
