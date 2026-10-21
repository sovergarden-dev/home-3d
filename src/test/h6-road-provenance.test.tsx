import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrivateWorldPanel } from "@/components/overlay/PrivateWorldPanel";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import { worldDataProvider } from "@/world/privateWorldSession";
import type { WorldData } from "@/world/schema";

const sourceRoad = {
  ...structuredClone(SYNTHETIC_NEIGHBORHOOD.roads[0]!),
  provenance: { source: "osm" as const, quality: "source_only" as const },
  attributes: {
    carriagewayWidth: { source: "survey" as const, quality: "verified" as const },
    direction: { source: "osm" as const, quality: "source_only" as const },
    sidewalkWidths: { source: "osm" as const, quality: "unknown" as const },
    medianWidth: { source: "survey" as const, quality: "inferred" as const },
  },
};

function packageText(): string {
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD) as WorldData;
  world.roads[0] = structuredClone(sourceRoad);
  return JSON.stringify({ manifest: world.manifest, world });
}
function selectRoad() {
  fireEvent.click(screen.getByRole("button", { name: "Biên tập nâng cao" }));
  fireEvent.change(screen.getByLabelText("Chọn tuyến đường"), {
    target: { value: sourceRoad.localId },
  });
}
afterEach(() => {
  act(() => worldDataProvider.resetFixture());
});

describe("R23-2 road provenance", () => {
  it("round-trips a manual centerline override and preserves other road fields and provenance", () => {
    act(() => worldDataProvider.openText(packageText()));
    render(<PrivateWorldPanel enabled />);
    selectRoad();
    expect(screen.getByText("Hình học tim đường: osm · source_only")).toBeVisible();
    const override = {
      schemaVersion: "1.0" as const,
      overrides: [
        {
          localId: "ov-road-polyline",
          revision: 1,
          reason: "Synthetic centerline correction",
          provenance: { source: "manual_override" as const, quality: "inferred" as const },
          patch: {
            operation: "patch_road" as const,
            featureId: sourceRoad.localId,
            patch: {
              polylineENU: sourceRoad.polylineENU.map(
                ([x, z]) => [x + 0.25, z] as [number, number],
              ),
            },
          },
        },
      ],
    };
    act(() => {
      expect(worldDataProvider.applyOverrides(override)).toBe(true);
    });
    expect(screen.getByText("Hình học tim đường: manual_override · inferred")).toBeVisible();
    const exported = worldDataProvider.exportWorkingPackage();
    expect(exported?.overrides).toEqual(override);
    expect(exported?.world.roads[0]).toEqual(sourceRoad);
    act(() => worldDataProvider.openText(JSON.stringify(exported)));
    selectRoad();
    expect(screen.getByText("Hình học tim đường: manual_override · inferred")).toBeVisible();
    const reopened = worldDataProvider.getSnapshot();
    if (reopened.mode !== "private") throw new Error("PRIVATE_PACKAGE_NOT_REOPENED");
    const reopenedRoad = reopened.world.roads[0]!;
    expect(reopenedRoad.polylineENU).toEqual(override.overrides[0]!.patch.patch.polylineENU);
    for (const field of [
      "carriagewayWidth",
      "direction",
      "sidewalkWidths",
      "medianWidth",
    ] as const) {
      expect(reopenedRoad[field]).toEqual(sourceRoad[field]);
      expect(reopenedRoad.attributes?.[field]).toEqual(sourceRoad.attributes[field]);
    }
    expect(reopenedRoad.provenance).toEqual(sourceRoad.provenance);
    expect(reopenedRoad.attributes?.["polylineENU"]).toEqual({
      source: "manual_override",
      quality: "inferred",
    });
  });
});
