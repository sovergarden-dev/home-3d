import { describe, expect, it } from "vitest";
import { centerMarkerLabels } from "@/components/overlay/centerMarkerLabels";
import { en as enDict } from "@/i18n/en";
import { vi as viDict } from "@/i18n/vi";
import {
  TEMPORARY_LOT_ILLUSTRATION,
  TEMPORARY_LOT_ILLUSTRATION_POSITION,
} from "@/engine/view/temporaryLotIllustration";
import { useAppStore } from "@/state/appStore";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import { createWorldDataProvider } from "@/world/privateWorldSession";

const expectedText = "Lô trống · minh họa tạm · ranh chưa đo";

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

  it("shows the exact Vietnamese label only for a private package while enabled", () => {
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

  it("keeps the toggle outside the source world session", () => {
    const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
    const initialSnapshot = provider.getSnapshot();
    const initialVisibility = useAppStore.getState().showTemporaryLotIllustration;

    try {
      useAppStore.getState().toggleTemporaryLotIllustration();
      expect(useAppStore.getState().showTemporaryLotIllustration).toBe(!initialVisibility);
      expect(provider.getSnapshot()).toBe(initialSnapshot);
      expect(JSON.stringify(SYNTHETIC_NEIGHBORHOOD)).not.toContain(expectedText);
    } finally {
      useAppStore.setState({ showTemporaryLotIllustration: initialVisibility });
    }
  });
});
