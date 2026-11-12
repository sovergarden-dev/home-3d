import { createHash } from "node:crypto";
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

import * as THREE from "three";
import { Dock } from "@/components/overlay/Dock";
import { useSceneShortcuts } from "@/components/overlay/useSceneShortcuts";
import { createAtmosphereLayer } from "@/engine/atmosphere";
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
import homeGeoreferenceDocument from "@/world/data/homeNeighborhood.georef.json";
import homePackageDocument from "@/world/data/homeNeighborhood.json";
import type { WorldData } from "@/world/schema";
import {
  HOME_CENTER_CONFIRMATION,
  HOME_GEOREFERENCE,
  HOME_NEIGHBORHOOD,
} from "@/world/homeNeighborhood";
import { homeWorldSession } from "@/world/homeWorldSession";

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
});

function ClockHarness() {
  useClock();
  return null;
}

function ShortcutHarness() {
  useSceneShortcuts();
  return null;
}

describe("fixed home experience", () => {
  it("shows exactly six always-visible time and weather presets without live backdrop blur", () => {
    const { container } = render(<Dock />);
    expect(container.querySelector("[role='region']")?.className).not.toMatch(/backdrop-blur/);
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
    expect(screen.getByText("Nhà của tôi · đang xây để cho thuê")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /OpenStreetMap contributors/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /OpenStreetMap contributors/ })).toHaveAttribute(
      "href",
      "https://www.openstreetmap.org/copyright",
    );
    expect(screen.getByRole("link", { name: "Giới thiệu" })).toHaveAttribute("href", "/gioi-thieu");
    act(() => useAppStore.getState().setLanguage("en"));
    expect(screen.getByText("My house · under construction for rent")).toBeInTheDocument();
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

  it("mounts the owner-confirmed, source-backed real neighborhood through the immutable home session", () => {
    expect(centerMarkerLabels("home", viDict, HOME_CENTER_CONFIRMATION)).toEqual({
      title: "Tâm mới được chấp nhận tạm",
      description: "Ranh chưa đo",
    });
    expect(centerMarkerLabels("home", enDict, HOME_CENTER_CONFIRMATION)).toEqual({
      title: "Center provisionally accepted",
      description: "Boundary not surveyed",
    });
    expect(centerMarkerLabels("fixture", viDict, undefined)).toEqual({
      title: "Nhà mình",
      description: "Lô trống · vị trí giả lập",
    });

    const packageText = JSON.stringify(homePackageDocument);
    const packageSha256 = createHash("sha256").update(packageText).digest("hex");
    expect(packageSha256).toBe(HOME_GEOREFERENCE.packageSha256);
    expect(HOME_GEOREFERENCE.schemaVersion).toBe("1.0");
    expect(HOME_GEOREFERENCE.origin).toEqual({ latitude: 10.752187, longitude: 106.659106 });

    expect(Object.isFrozen(HOME_NEIGHBORHOOD)).toBe(true);
    expect(Object.isFrozen(HOME_NEIGHBORHOOD.manifest)).toBe(true);
    expect(Object.isFrozen(HOME_NEIGHBORHOOD.roads)).toBe(true);
    expect(Object.isFrozen(HOME_NEIGHBORHOOD.buildings)).toBe(true);
    expect(Object.isFrozen(HOME_NEIGHBORHOOD.lots)).toBe(true);
    expect(HOME_NEIGHBORHOOD.manifest.verificationStatus).toBe("REAL_WORLD_NOT_VERIFIED");
    expect(HOME_NEIGHBORHOOD.manifest.isSynthetic).toBe(false);
    expect(HOME_NEIGHBORHOOD.manifest.datasetRevision).toBe(
      "h6-osm-center-confirmed-2026-10-16-r2",
    );
    expect(HOME_NEIGHBORHOOD.manifest.sources?.map((source) => source.namespace)).toEqual([
      "osm-300m-primary",
    ]);
    expect(HOME_NEIGHBORHOOD.roads).toHaveLength(138);
    expect(HOME_NEIGHBORHOOD.buildings).toHaveLength(317);
    expect(HOME_NEIGHBORHOOD.lots).toHaveLength(0);
    expect(
      HOME_NEIGHBORHOOD.buildings.every(
        (building) => building.provenance.quality === "source_only",
      ),
    ).toBe(true);
    expect(
      HOME_NEIGHBORHOOD.buildings.every(
        (building) => building.attributes?.["wallHeight"]?.quality === "inferred",
      ),
    ).toBe(true);
    expect(HOME_CENTER_CONFIRMATION.status).toBe("provisionally-accepted");
    expect(homeWorldSession.getSnapshot()).toMatchObject({
      mode: "home",
      world: HOME_NEIGHBORHOOD,
      centerConfirmation: { status: "provisionally-accepted" },
    });
    expect(homeWorldSession.getGeoreference()).toEqual({ origin: HOME_GEOREFERENCE.origin });
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

  it("handles global keyboard shortcuts after startup while ignoring interactive elements and modifiers", () => {
    render(<ShortcutHarness />);
    fireEvent.keyDown(window, { key: "3" });
    expect(useAppStore.getState().timeOfDayMinutes).toBe(420);

    act(() => useAppStore.setState({ loadingProgress: 1, sceneStatus: "ready" }));
    fireEvent.keyDown(window, { key: "3" });
    expect(useAppStore.getState().timeOfDayMinutes).toBe(1170);
    fireEvent.keyDown(window, { key: "e" });
    expect(useAppStore.getState().weather).toBe("storm");
    fireEvent.keyDown(window, { key: "m" });
    expect(useAppStore.getState().viewMode).toBe("topdown");
    fireEvent.keyDown(window, { key: "+" });
    expect(useAppStore.getState().zoom).toBeGreaterThan(1);
    fireEvent.keyDown(window, { key: "h" });
    expect(useAppStore.getState()).toMatchObject({ viewMode: "diorama", zoom: 1 });

    const button = document.createElement("button");
    document.body.appendChild(button);
    fireEvent.keyDown(button, { key: "1" });
    expect(useAppStore.getState().timeOfDayMinutes).toBe(1170);
    fireEvent.keyDown(window, { key: "1", ctrlKey: true });
    expect(useAppStore.getState().timeOfDayMinutes).toBe(1170);
    button.remove();
  });

  it("interpolates sky and sunlight over ~350ms when switching presets unless immediate", () => {
    const scene = new THREE.Scene();
    const sky = new THREE.Color("#000000");
    const hemisphere = new THREE.HemisphereLight("#ffffff", "#555555", 1);
    const sun = new THREE.DirectionalLight("#ffffff", 1);
    const moon = new THREE.DirectionalLight("#ffffff", 0);
    const layer = createAtmosphereLayer({
      scene,
      sky,
      hemisphere,
      sun,
      moon,
      onRoadWet: () => {},
    });

    layer.update(
      {
        timeOfDayMinutes: 420,
        weather: "sunny",
        festival: "normal",
        astronomy: {
          sunAzimuthDeg: 100,
          sunElevationDeg: 45,
          moonAzimuthDeg: 280,
          moonElevationDeg: -45,
        },
      },
      true,
    );
    const morningSunIntensity = sun.intensity;

    layer.update(
      {
        timeOfDayMinutes: 1170,
        weather: "storm",
        festival: "normal",
        astronomy: {
          sunAzimuthDeg: 270,
          sunElevationDeg: -25,
          moonAzimuthDeg: 90,
          moonElevationDeg: 25,
        },
      },
      true,
      undefined,
      350,
    );
    expect(layer.transitionActive).toBe(true);
    expect(sun.intensity).toBeCloseTo(morningSunIntensity, 2);

    layer.tick(0.18);
    expect(layer.transitionActive).toBe(true);
    expect(sun.intensity).toBeLessThan(morningSunIntensity);
    expect(sun.intensity).toBeGreaterThan(0.05);

    layer.tick(0.25);
    expect(layer.transitionActive).toBe(false);
    expect(sun.intensity).toBeCloseTo(0, 3);
    layer.dispose();
  });

  it("keeps bilingual About copy and shortcut legend aligned with the fixed 6-preset scope", () => {
    for (const paragraph of viDict.aboutBody) {
      expect(paragraph).not.toMatch(/Trung Thu|lễ hội|tiếng rao|xe ôm/i);
    }
    for (const paragraph of enDict.aboutBody) {
      expect(paragraph).not.toMatch(/Mid-Autumn|festival|street calls|motorbike taxi/i);
    }
    expect(viDict.aboutShortcuts.length).toBeGreaterThanOrEqual(4);
    expect(enDict.aboutShortcuts.length).toBe(viDict.aboutShortcuts.length);
  });

  it("warms only the compact fixed-home shader variants when configured without festivals or flood", () => {
    const scene = new THREE.Scene();
    const sky = new THREE.Color("#000000");
    const hemisphere = new THREE.HemisphereLight("#ffffff", "#555555", 1);
    const sun = new THREE.DirectionalLight("#ffffff", 1);
    const moon = new THREE.DirectionalLight("#ffffff", 0);
    const layer = createAtmosphereLayer({
      scene,
      sky,
      hemisphere,
      sun,
      moon,
      onRoadWet: () => {},
      festivalsEnabled: false,
      floodEnabled: false,
    });
    const festivalNames = layer.group.children
      .map((child) => child.name)
      .filter((name) => name.startsWith("festival-decoration-"));
    expect(festivalNames).toEqual([]);
    const floodNames = layer.group.children
      .map((child) => child.name)
      .filter((name) => name === "simulation-flood-water");
    expect(floodNames).toEqual([]);
    let compiled = 0;
    const renderer = { compile: () => (compiled += 1) } as unknown as THREE.WebGLRenderer;
    const total = layer.warm(renderer, new THREE.PerspectiveCamera());
    expect(total).toBe(6);
    expect(compiled).toBe(6);
    layer.dispose();
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
