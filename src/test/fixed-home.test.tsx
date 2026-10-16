import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Dock } from "@/components/overlay/Dock";
import { centerMarkerLabels } from "@/components/overlay/centerMarkerLabels";
import { TopInfo } from "@/components/overlay/TopInfo";
import { en as enDict } from "@/i18n/en";
import { vi as viDict } from "@/i18n/vi";
import { useAppStore } from "@/state/appStore";
import {
  clampPrivatePlanCentre,
  derivePrivateWorldPlanFrame,
} from "@/engine/view/privateWorldPlanFrame";
import type { WorldData } from "@/world/schema";

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
});

// The preview keeps one centre, but a private world must not claim an unidentified lot.
describe("map centre labels", () => {
  it("dock has no place picker and opens on the time tab", () => {
    render(<Dock mobile={false} />);

    const tabs = screen.getAllByRole("tab").map((tab) => tab.textContent);
    expect(tabs).toEqual(["Thời gian", "Thời tiết", "Lễ hội", "Kỷ niệm"]);
    expect(screen.getByRole("tab", { name: "Thời gian" })).toHaveAttribute("aria-selected", "true");
    expect(screen.queryByText("Góc phố")).toBeNull();
  });

  it("top info always names the house, in both languages", () => {
    render(<TopInfo />);
    expect(screen.getByText("Nhà mình")).toBeInTheDocument();

    act(() => useAppStore.getState().setLanguage("en"));
    expect(screen.getByText("Our house")).toBeInTheDocument();
  });

  it("labels a private marker as a confirmed location while keeping its boundary unmeasured", () => {
    expect(centerMarkerLabels("private", viDict)).toEqual({
      title: "Vị trí do Syringa xác nhận",
      description: "Ranh chưa đo",
    });
    expect(centerMarkerLabels("private", enDict)).toEqual({
      title: "Location confirmed by Syringa",
      description: "Boundary not surveyed",
    });
  });

  it("store has no place selection and reset restores the default camera state", () => {
    const state = useAppStore.getState();
    expect(state).not.toHaveProperty("selectedPlaceId");
    expect(state).not.toHaveProperty("selectPlace");

    state.zoomIn();
    state.setHeading(90);
    useAppStore.getState().resetView();
    expect(useAppStore.getState()).toMatchObject({ zoom: 1, heading: 0 });
  });

  it("enters Plan at 1× after a perspective fit without resetting an active Plan zoom", () => {
    useAppStore.setState({ viewMode: "diorama", zoom: 4 });
    useAppStore.getState().setViewMode("topdown");
    expect(useAppStore.getState()).toMatchObject({ viewMode: "topdown", zoom: 1 });

    useAppStore.getState().zoomIn();
    useAppStore.getState().setViewMode("topdown");
    expect(useAppStore.getState()).toMatchObject({ viewMode: "topdown", zoom: 1.25 });
  });
});

describe("private-world default and reset camera frame", () => {
  it("keeps a 300 m core at the supplied origin while allowing pan to a long way", () => {
    const world = {
      roads: [
        {
          polylineENU: [
            [-620, -10],
            [35, -10],
          ],
        },
      ],
      buildings: [
        {
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [-5, -5],
                [5, -5],
                [5, 5],
                [-5, 5],
                [-5, -5],
              ],
            ],
          },
          parts: [
            {
              geometry: {
                type: "Polygon",
                coordinates: [
                  [
                    [880, 0],
                    [885, 0],
                    [885, 5],
                    [880, 5],
                    [880, 0],
                  ],
                ],
              },
            },
          ],
        },
      ],
      lots: [],
    } as unknown as WorldData;
    const frame = derivePrivateWorldPlanFrame(world);

    expect(frame.centre).toEqual({ x: 0, z: 0 });
    expect(frame.verticalSpanMetres).toBe(300);
    expect(clampPrivatePlanCentre({ x: -620, z: -10 }, frame.panBounds)).toEqual({
      x: -620,
      z: -10,
    });
    expect(frame.panBounds.minX).toBeLessThan(-620);
    expect(frame.panBounds.maxX).toBeGreaterThan(885);
  });
});

describe("mobile bottom sheet", () => {
  it("reports when it is expanded so the map controls can step aside", () => {
    const onExpandedChange = vi.fn();
    render(<Dock mobile onExpandedChange={onExpandedChange} />);
    expect(onExpandedChange).toHaveBeenLastCalledWith(false);

    fireEvent.click(screen.getByRole("tab", { name: "Thời tiết" }));
    expect(onExpandedChange).toHaveBeenLastCalledWith(true);
    expect(screen.getByRole("tabpanel")).toBeInTheDocument();
  });
});
