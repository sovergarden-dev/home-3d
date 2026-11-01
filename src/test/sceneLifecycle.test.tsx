import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  created: 0,
  disposed: [] as { connected: boolean; rootIsDocument: boolean }[],
  cleanupListeners: [] as (() => void)[],
  losses: [] as (() => void)[],
  ready: null as Promise<"interactive" | "stopped"> | null,
}));
vi.mock("@tanstack/react-router", () => ({
  ClientOnly: ({ children }: { children: ReactNode }) => children,
  useBlocker: vi.fn(),
}));
vi.mock("@/components/overlay/PrivateWorldPanel", () => ({ PrivateWorldPanel: () => null }));
vi.mock("@/engine/demoScene", () => ({
  createDemoScene: (host: HTMLElement, marker: HTMLElement, onLost: () => void) => {
    runtime.losses.push(onLost);
    const canvas = document.createElement("canvas");
    host.appendChild(canvas);
    runtime.created++;
    const root = canvas.getRootNode();
    const listener = () => {};
    root.addEventListener("keydown", listener, true);
    runtime.cleanupListeners.push(() => root.removeEventListener("keydown", listener, true));
    return {
      ready: runtime.ready ?? Promise.resolve("interactive" as const),
      setLabel: () => {},
      dispose: () => {
        // OrbitControls r180 disconnects from getRootNode(), not ownerDocument.
        const cleanupRoot = canvas.getRootNode();
        runtime.disposed.push({
          connected: host.isConnected,
          rootIsDocument: cleanupRoot === document,
        });
        cleanupRoot.removeEventListener("keydown", listener, true);
        canvas.remove();
      },
    };
  },
}));
import { SceneViewport } from "@/components/overlay/SceneViewport";
import { Splash } from "@/components/overlay/Splash";
import { useAppStore } from "@/state/appStore";

describe("scene DOM lifecycle", () => {
  beforeEach(() => {
    runtime.created = 0;
    runtime.disposed = [];
    runtime.losses = [];
    runtime.ready = null;
  });
  afterEach(() => {
    cleanup();
    for (const dispose of runtime.cleanupListeners.splice(0)) dispose();
  });
  it("disposes against the original document before route DOM detaches on every remount", async () => {
    for (let i = 0; i < 3; i++) {
      const mounted = render(<SceneViewport />);
      await waitFor(() => expect(runtime.created).toBe(i + 1));
      mounted.unmount();
    }
    expect(runtime.disposed).toEqual([
      { connected: true, rootIsDocument: true },
      { connected: true, rootIsDocument: true },
      { connected: true, rootIsDocument: true },
    ]);
  });
  it("recovers once automatically, then offers a bounded manual retry without duplicate canvases", async () => {
    const mounted = render(<SceneViewport />);
    await waitFor(() => expect(runtime.created).toBe(1));
    act(() => runtime.losses[0]!());
    await waitFor(() => expect(runtime.created).toBe(2));
    expect(mounted.container.querySelectorAll("canvas")).toHaveLength(1);
    act(() => runtime.losses[1]!());
    expect(screen.getByTestId("static-scene")).toBeTruthy();
    expect(mounted.container.querySelectorAll("canvas")).toHaveLength(0);
    expect(runtime.created).toBe(2);
    fireEvent.click(screen.getByRole("button", { name: "Thử lại 3D" }));
    await waitFor(() => expect(runtime.created).toBe(3));
    expect(mounted.container.querySelectorAll("canvas")).toHaveLength(1);
    mounted.unmount();
    expect(runtime.disposed).toHaveLength(3);
    expect(runtime.disposed.every((row) => row.connected && row.rootIsDocument)).toBe(true);
  });
  it("reports ready only after startup has drawn and warmed every variant", async () => {
    let release = () => {};
    runtime.ready = new Promise((resolve) => (release = () => resolve("interactive")));
    const mounted = render(<SceneViewport />);
    await waitFor(() => expect(runtime.created).toBe(1));
    expect(useAppStore.getState().sceneStatus).toBe("loading");
    expect(useAppStore.getState().loadingProgress).toBeLessThan(1);
    await act(async () => release());
    expect(useAppStore.getState().sceneStatus).toBe("ready");
    expect(useAppStore.getState().loadingProgress).toBe(1);
    mounted.unmount();
  });
  it("does not report ready for a startup that stopped", async () => {
    let stop = () => {};
    runtime.ready = new Promise((resolve) => (stop = () => resolve("stopped")));
    const mounted = render(<SceneViewport />);
    await waitFor(() => expect(runtime.created).toBe(1));
    await act(async () => stop());
    expect(useAppStore.getState().sceneStatus).toBe("loading");
    expect(useAppStore.getState().loadingProgress).toBeLessThan(1);
    mounted.unmount();
  });
  it("removes the splash when the context is lost again before startup finishes", async () => {
    // Startup never finishes here: both scenes lose their context on the loading screen.
    runtime.ready = new Promise(() => {});
    const mounted = render(
      <>
        <Splash />
        <SceneViewport />
      </>,
    );
    await waitFor(() => expect(runtime.created).toBe(1));
    expect(screen.getByRole("progressbar")).toBeTruthy();
    act(() => runtime.losses[0]!());
    expect(useAppStore.getState().loadingProgress).toBe(1);
    await waitFor(() => expect(runtime.created).toBe(2));
    act(() => runtime.losses[1]!());
    expect(useAppStore.getState().sceneStatus).toBe("fallback");
    expect(useAppStore.getState().loadingProgress).toBe(1);
    await waitFor(() => expect(screen.queryByRole("progressbar")).toBeNull());
    const retry = screen.getByRole("button", { name: "Thử lại 3D" }) as HTMLButtonElement;
    expect(retry.disabled).toBe(false);
    mounted.unmount();
  });
  it("falls back and disposes the scene when its first frame fails", async () => {
    const failedFrame = Promise.reject(new Error("first frame failed"));
    // The viewport attaches its handler after the dynamic import; avoid an early unhandled rejection.
    failedFrame.catch(() => {});
    runtime.ready = failedFrame;
    const mounted = render(<SceneViewport />);
    await waitFor(() => expect(useAppStore.getState().sceneStatus).toBe("fallback"));
    expect(runtime.disposed).toHaveLength(1);
    expect(screen.getByTestId("static-scene")).toBeTruthy();
    expect(mounted.container.querySelectorAll("canvas")).toHaveLength(0);
    mounted.unmount();
    expect(runtime.disposed).toHaveLength(1);
  });
  it("cancels a pending recovery when the route unmounts", async () => {
    const mounted = render(<SceneViewport />);
    await waitFor(() => expect(runtime.created).toBe(1));
    act(() => runtime.losses[0]!());
    mounted.unmount();
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(runtime.created).toBe(1);
    expect(runtime.disposed).toHaveLength(1);
  });
});
