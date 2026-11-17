import * as THREE from "three";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { LifeControls, PovControls } from "@/components/overlay/LifeControls";
import { MapControls } from "@/components/overlay/MapControls";
import { createLifeRuntime } from "@/engine/life/runtime";
import { useAppStore } from "@/state/appStore";
import { bindLifeCommands, resetLifeSession, type LifeCommand } from "@/engine/life/session";
import { road, world } from "./fixtures/p9-longrun-world";
const initial = useAppStore.getState();
beforeEach(() => {
  useAppStore.setState(initial, true);
  resetLifeSession();
});
describe("P9 presentation controls", () => {
  it("supports one-action off, bounded density and bilingual simulation disclosure", () => {
    render(<LifeControls />);
    fireEvent.click(screen.getByRole("switch", { name: "Lớp sống" }));
    expect(useAppStore.getState().lifeEnabled).toBe(false);
    act(() => {
      useAppStore.getState().setLifeDensity(NaN);
    });
    expect(useAppStore.getState().lifeDensity).toBe(0);
    act(() => {
      useAppStore.getState().setLifeDensity(200);
    });
    expect(useAppStore.getState().lifeDensity).toBe(1);
    act(() => {
      useAppStore.getState().setLanguage("en");
    });
    expect(screen.getByRole("switch", { name: "Life layer" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(screen.getByText(/Synthesized audio/)).toBeInTheDocument();
    expect(
      Object.keys(useAppStore.getState()).some((key) =>
        /world|recording|sensor|audioFile|origin/i.test(key),
      ),
    ).toBe(false);
  });
  it("always offers ride pause and exit, orientation opt-in is a command not a stored sensor", () => {
    const commands: LifeCommand[] = [];
    bindLifeCommands((command) => commands.push(command));
    useAppStore.setState({ viewMode: "ride", ridePaused: false });
    render(<PovControls />);
    fireEvent.click(screen.getByRole("button", { name: "Tạm dừng chuyến" }));
    expect(useAppStore.getState().ridePaused).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Cho phép nghiêng điện thoại" }));
    expect(commands).toEqual([{ kind: "orientation" }]);
    fireEvent.click(screen.getByRole("button", { name: "Thoát POV" }));
    expect(useAppStore.getState().viewMode).toBe("diorama");
    expect(screen.queryByRole("button", { name: "Thoát POV" })).not.toBeInTheDocument();
  });
  it("virtual movement releases on pointer cancel and unmount", () => {
    const commands: LifeCommand[] = [];
    bindLifeCommands((command) => commands.push(command));
    useAppStore.setState({ viewMode: "walk" });
    const view = render(<PovControls />);
    fireEvent.pointerCancel(screen.getByRole("button", { name: "Đi tới" }));
    expect(commands.at(-1)).toEqual({ kind: "move", forward: 0, right: 0 });
    view.unmount();
    expect(commands.at(-1)).toEqual({ kind: "move", forward: 0, right: 0 });
  });

  it("switches detail tiers from LifeControls and MapControls without leaking store secrets", () => {
    useAppStore.setState({ sceneStatus: "ready" });
    render(
      <>
        <LifeControls />
        <MapControls />
      </>,
    );
    fireEvent.click(screen.getByRole("button", { name: "Cao" }));
    expect(useAppStore.getState().detailTier).toBe("high");
    expect(screen.getByTestId("density-tier-cycle")).toHaveAttribute("data-detail-tier", "high");
    fireEvent.click(screen.getByTestId("density-tier-cycle"));
    expect(useAppStore.getState().detailTier).toBe("low");
    fireEvent.click(screen.getByTestId("life-quick-toggle"));
    expect(useAppStore.getState().lifeEnabled).toBe(false);
  });

  it("pauses ambient street motion under prefers-reduced-motion while allowing tier switches and recovery", () => {
    const sampleWorld = world([
      road(
        "street",
        [
          [-120, 0],
          [120, 0],
        ],
        8,
      ),
    ]);
    const runtime = createLifeRuntime({
      world: sampleWorld,
      camera: new THREE.PerspectiveCamera(),
      canvas: document.createElement("canvas"),
      target: new THREE.Vector3(),
      reducedMotion: true,
      tier: "mid",
      profile: { motorbikeToCarRatio: 2.5, pedestriansPer100m: 3 },
      invalidate: vi.fn(),
    });
    runtime.update(1, 60);
    expect(runtime.active()).toBe(false);
    expect(runtime.simulation.clock).toBe(0);
    expect(runtime.simulation.agents.length).toBeGreaterThan(0);

    runtime.setTier("high");
    runtime.update(0.5, 60);
    expect(runtime.simulation.diagnostics.tier).toBe("high");
    expect(runtime.simulation.clock).toBe(0);

    runtime.setReducedMotion(false);
    expect(runtime.active()).toBe(true);
    runtime.update(0.5, 60);
    expect(runtime.simulation.clock).toBeGreaterThan(0);
    runtime.dispose();
  });
});
