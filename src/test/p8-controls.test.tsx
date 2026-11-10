import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Dock } from "@/components/overlay/Dock";
import { TopInfo } from "@/components/overlay/TopInfo";
import { useAppStore } from "@/state/appStore";
import { worldDataProvider } from "@/world/privateWorldSession";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";

const initial = useAppStore.getState();
beforeEach(() => {
  useAppStore.setState(initial, true);
  worldDataProvider.resetFixture();
});

describe("P8 integrated controls (streamlined)", () => {
  it("switches between the 3 time presets and 3 weather modes without mutating package state", () => {
    const text = JSON.stringify({
      manifest: SYNTHETIC_NEIGHBORHOOD.manifest,
      world: SYNTHETIC_NEIGHBORHOOD,
    });
    worldDataProvider.openText(text);
    const before = JSON.stringify(worldDataProvider.exportWorkingPackage());
    const revision = worldDataProvider.getSnapshot().revision;
    render(
      <>
        <TopInfo />
        <Dock />
      </>,
    );
    expect(screen.getAllByRole("radio").map((radio) => radio.textContent?.trim())).toEqual([
      "Sáng",
      "Chiều",
      "Tối",
      "Nắng",
      "Mây",
      "Mưa",
    ]);
    fireEvent.click(screen.getByRole("radio", { name: "Chiều" }));
    expect(useAppStore.getState().timeOfDayMinutes).toBe(930);
    fireEvent.click(screen.getByRole("radio", { name: "Tối" }));
    expect(useAppStore.getState().timeOfDayMinutes).toBe(1170);

    fireEvent.click(screen.getByRole("radio", { name: "Mây" }));
    expect(useAppStore.getState().weather).toBe("cloudy");
    fireEvent.click(screen.getByRole("radio", { name: "Mưa" }));
    expect(useAppStore.getState().weather).toBe("storm");

    expect(screen.getByRole("radio", { name: "Mưa" })).toHaveAttribute("aria-checked", "true");

    expect(JSON.stringify(worldDataProvider.exportWorkingPackage())).toBe(before);
    expect(worldDataProvider.getSnapshot().revision).toBe(revision);
  });

  it("keeps the rain preset selected for both legacy rain and preset storm values", () => {
    render(<Dock />);
    act(() => useAppStore.getState().setWeather("rain"));
    expect(screen.getByRole("radio", { name: "Mưa" })).toHaveAttribute("aria-checked", "true");
    act(() => useAppStore.getState().setWeather("storm"));
    expect(screen.getByRole("radio", { name: "Mưa" })).toHaveAttribute("aria-checked", "true");
  });

  it("supports complete English copy for the 3 time presets and 3 weather modes", () => {
    render(<Dock />);
    act(() => useAppStore.getState().setLanguage("en"));
    for (const name of ["Morning", "Afternoon", "Evening"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
    for (const name of ["Sunny", "Cloudy", "Rain"]) {
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
    }
  });
});
