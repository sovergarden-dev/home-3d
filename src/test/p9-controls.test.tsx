import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { LifeControls, PovControls } from "@/components/overlay/LifeControls";
import { useAppStore } from "@/state/appStore";
import { bindLifeCommands, resetLifeSession, type LifeCommand } from "@/engine/life/session";
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
});
