import { webcrypto } from "node:crypto";
import { sha256Text } from "@/world/packageGeoreference";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { Dock } from "@/components/overlay/Dock";
import { TopInfo } from "@/components/overlay/TopInfo";
import { useAppStore } from "@/state/appStore";
import { worldDataProvider } from "@/world/privateWorldSession";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
Object.defineProperty(globalThis, "crypto", { configurable: true, value: webcrypto });
const initial = useAppStore.getState();
beforeEach(() => {
  useAppStore.setState(initial, true);
  worldDataProvider.resetFixture();
});
describe("P8 integrated controls", () => {
  it("uses the selected date for weekday and does not mutate package state", () => {
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
        <Dock mobile={false} />
      </>,
    );
    fireEvent.change(screen.getByLabelText("Ngày đang xem"), { target: { value: "2028-02-29" } });
    expect(screen.getByText(/Thứ Ba · 2028-02-29/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Thời tiết" }));
    fireEvent.click(screen.getByRole("radio", { name: "Mùa mưa" }));
    fireEvent.change(screen.getByLabelText("Mức ngập mô phỏng"), { target: { value: "0.7" } });
    expect(useAppStore.getState()).toMatchObject({
      selectedDate: "2028-02-29",
      season: "wet",
      floodLevel: 0.7,
    });
    expect(JSON.stringify(worldDataProvider.exportWorkingPackage())).toBe(before);
    expect(worldDataProvider.getSnapshot().revision).toBe(revision);
  });
  it("uses a package-bound local reference for sunset and keeps the viewing date", async () => {
    const text = JSON.stringify({
      manifest: SYNTHETIC_NEIGHBORHOOD.manifest,
      world: SYNTHETIC_NEIGHBORHOOD,
    });
    worldDataProvider.openText(text);
    await worldDataProvider.openGeoreferenceText(
      JSON.stringify({
        schemaVersion: "1.0",
        packageSha256: await sha256Text(text),
        origin: { latitude: 21.0285, longitude: 105.8542 },
      }),
    );
    useAppStore.setState({ selectedDate: "2026-06-21" });
    render(<Dock mobile={false} />);
    const sunset = screen.getByRole("button", { name: /18:4[01].*Hoàng hôn/ });
    fireEvent.click(sunset);
    expect(useAppStore.getState().timeOfDayMinutes).toBeGreaterThanOrEqual(1120);
    expect(useAppStore.getState().timeOfDayMinutes).toBeLessThanOrEqual(1121);
    expect(useAppStore.getState().selectedDate).toBe("2026-06-21");
  });
  it("manual Everyday explicitly disables automatic festivals", () => {
    useAppStore.setState({ selectedDate: "2026-02-17", festivalAuto: true });
    render(<Dock mobile={false} />);
    fireEvent.click(screen.getByRole("tab", { name: "Lễ hội" }));
    expect(screen.getByRole("radio", { name: "Tết" })).toHaveAttribute("aria-checked", "true");
    fireEvent.click(screen.getByRole("radio", { name: "Thường ngày" }));
    expect(useAppStore.getState()).toMatchObject({ festivalAuto: false, festival: "normal" });
    expect(screen.getByRole("switch", { name: "Lễ hội tự động" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
  it("has six festival choices and complete English copy", () => {
    render(<Dock mobile={false} />);
    act(() => useAppStore.getState().setLanguage("en"));
    expect(screen.getByLabelText("Viewing date")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Festivals" }));
    for (const name of [
      "Everyday",
      "Lunar New Year",
      "Mid-Autumn",
      "Christmas",
      "April 30",
      "September 2",
    ])
      expect(screen.getByRole("radio", { name })).toBeInTheDocument();
  });
});
