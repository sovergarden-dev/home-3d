import { cleanup, render, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const runtime = vi.hoisted(() => ({
  created: 0,
  disposed: [] as { connected: boolean; rootIsDocument: boolean }[],
  cleanupListeners: [] as (() => void)[],
}));
vi.mock("@tanstack/react-router", () => ({
  ClientOnly: ({ children }: { children: ReactNode }) => children,
  useBlocker: vi.fn(),
}));
vi.mock("@/components/overlay/PrivateWorldPanel", () => ({ PrivateWorldPanel: () => null }));
vi.mock("@/engine/demoScene", () => ({
  createDemoScene: (host: HTMLElement) => {
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
});
