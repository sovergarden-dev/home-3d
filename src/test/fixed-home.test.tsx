import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));

import { Dock } from "@/components/overlay/Dock";
import { centerMarkerLabels } from "@/components/overlay/centerMarkerLabels";
import { TopActions } from "@/components/overlay/TopActions";
import { TopInfo } from "@/components/overlay/TopInfo";
import { en as enDict } from "@/i18n/en";
import { vi as viDict } from "@/i18n/vi";
import { useAppStore } from "@/state/appStore";
import { useClock } from "@/components/overlay/useClock";
import {
  clampPrivatePlanCentre,
  derivePrivateWorldPlanFrame,
} from "@/engine/view/privateWorldPlanFrame";
import type { WorldData } from "@/world/schema";
import { HOME_NEIGHBORHOOD } from "@/world/homeNeighborhood";
import { homeWorldSession } from "@/world/homeWorldSession";

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
});

function ClockHarness() {
  useClock();
  return null;
}

describe("fixed home experience", () => {
  it("shows exactly six always-visible time and weather presets", () => {
    render(<Dock />);
    expect(
      screen.getAllByRole("radiogroup").map((group) => group.getAttribute("aria-label")),
    ).toEqual(["Thời gian", "Thời tiết"]);
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent?.trim())).toEqual([
      "Sáng",
      "Chiều",
      "Tối",
      "Nắng",
      "Mây",
      "Mưa",
    ]);
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    expect(screen.queryByText("Góc phố")).not.toBeInTheDocument();
  });

  it("applies selected time and weather presets", () => {
    render(<Dock />);
    fireEvent.click(screen.getByRole("radio", { name: "Tối" }));
    fireEvent.click(screen.getByRole("radio", { name: "Mưa" }));
    expect(useAppStore.getState()).toMatchObject({ timeOfDayMinutes: 1170, weather: "storm" });
  });

  it("localizes the fixed home label and all six presets", () => {
    render(
      <>
        <TopInfo />
        <TopActions />
        <Dock />
      </>,
    );
    expect(screen.getByText("Nhà mình")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Giới thiệu" })).toHaveAttribute("href", "/gioi-thieu");
    act(() => useAppStore.getState().setLanguage("en"));
    expect(screen.getByText("Our house")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "About" })).toHaveAttribute("href", "/gioi-thieu");
    for (const label of ["Morning", "Afternoon", "Evening", "Sunny", "Cloudy", "Rain"]) {
      expect(screen.getByRole("radio", { name: label })).toBeInTheDocument();
    }
  });

  it("automatically advances the simulation clock at one real minute per elapsed minute", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-10T00:00:00.000Z"));
    const view = render(<ClockHarness />);
    const initialMinutes = useAppStore.getState().timeOfDayMinutes;
    await act(async () => {
      await vi.advanceTimersByTimeAsync(61_000);
    });
    expect(useAppStore.getState().timeOfDayMinutes).toBe(initialMinutes + 1);
    view.unmount();
    vi.useRealTimers();
  });

  it("mounts a recursively immutable home dataset through a read-only session", () => {
    expect(Object.isFrozen(HOME_NEIGHBORHOOD)).toBe(true);
    expect(Object.isFrozen(HOME_NEIGHBORHOOD.manifest)).toBe(true);
    expect(Object.isFrozen(HOME_NEIGHBORHOOD.roads)).toBe(true);
    expect(Object.isFrozen(HOME_NEIGHBORHOOD.buildings)).toBe(true);
    expect(Object.isFrozen(HOME_NEIGHBORHOOD.lots)).toBe(true);
    expect(homeWorldSession.getSnapshot()).toMatchObject({
      mode: "fixture",
      world: HOME_NEIGHBORHOOD,
    });
    expect(homeWorldSession).not.toHaveProperty("openFile");
    expect(homeWorldSession).not.toHaveProperty("openText");
    expect(homeWorldSession).not.toHaveProperty("exportWorkingPackage");
  });

  it("starts life and illustrative details at full density", () => {
    expect(useAppStore.getState()).toMatchObject({
      lifeEnabled: true,
      lifeDensity: 1,
      illustrativeDetails: true,
    });
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
