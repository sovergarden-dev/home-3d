import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  created: 0,
  disposed: [] as { connected: boolean; rootIsDocument: boolean }[],
  cleanupListeners: [] as (() => void)[],
  losses: [] as (() => void)[],
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

describe("scene DOM lifecycle", () => {
  beforeEach(() => {
    runtime.created = 0;
    runtime.disposed = [];
    runtime.losses = [];
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
