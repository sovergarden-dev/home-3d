import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Dock } from "@/components/overlay/Dock";
import { TopInfo } from "@/components/overlay/TopInfo";
import { useAppStore } from "@/state/appStore";

const initialState = useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(initialState, true);
});

// The map has exactly one centre: the house. Guard against a place picker coming back.
describe("map is always centred on the house", () => {
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

  it("store has no place selection and reset returns to the house view", () => {
    const state = useAppStore.getState();
    expect(state).not.toHaveProperty("selectedPlaceId");
    expect(state).not.toHaveProperty("selectPlace");

    state.zoomIn();
    state.setHeading(90);
    useAppStore.getState().resetView();
    expect(useAppStore.getState()).toMatchObject({ zoom: 1, heading: 0 });
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
