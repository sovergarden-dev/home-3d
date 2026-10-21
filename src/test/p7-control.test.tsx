import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { webcrypto } from "node:crypto";
import { RealStreetControl } from "@/components/overlay/RealStreetControl";
import { worldDataProvider } from "@/world/privateWorldSession";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import { useAppStore } from "@/state/appStore";
import { bindRealStreetView, openRealStreetWindow } from "@/engine/view/externalMapView";
import { sha256Text } from "@/world/packageGeoreference";
import type { CameraView } from "@/geo/realStreet";

const text = JSON.stringify({
  manifest: SYNTHETIC_NEIGHBORHOOD.manifest,
  world: SYNTHETIC_NEIGHBORHOOD,
});
let view: CameraView;
async function prepare() {
  worldDataProvider.openText(text);
  const hash = await sha256Text(text);
  expect(
    await worldDataProvider.openGeoreferenceText(
      JSON.stringify({
        schemaVersion: "1.0",
        packageSha256: hash,
        origin: { latitude: 0.4321987, longitude: 0.6789123 },
      }),
    ),
  ).toBe(true);
}
function popup() {
  const replace = vi.fn();
  const doc = document.implementation.createHTMLDocument("synthetic popup");
  const head = doc.head;
  const createElement = doc.createElement.bind(doc);
  vi.spyOn(doc, "createElement").mockImplementation((name) => {
    const element = createElement(name);
    if (name === "a") {
      const link = element as HTMLAnchorElement;
      link.click = () => {
        expect(link.rel).toBe("noopener noreferrer");
        expect(link.referrerPolicy).toBe("no-referrer");
        expect(link.target).toBe("_self");
        replace(link.href);
      };
    }
    return element;
  });
  const handle = {
    closed: false,
    opener: window as Window | null,
    document: doc,
    location: { replace },
    close: vi.fn(),
  };
  vi.spyOn(window, "open").mockReturnValue(handle as unknown as Window);
  return { handle, replace, head };
}
beforeEach(() => {
  vi.stubGlobal("crypto", webcrypto);
  useAppStore.setState({ language: "vi", sceneStatus: "ready" });
  worldDataProvider.resetFixture();
  view = { target: { x: 0, y: 0, z: 0 }, direction: { x: 0, y: 0, z: -1 }, mode: "diorama" };
  bindRealStreetView(() => view);
});
afterEach(() => {
  cleanup();
  bindRealStreetView(null);
  worldDataProvider.resetFixture();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
describe("P7 explicit external opening", () => {
  it("keeps demo and a package without a matching companion disabled", () => {
    render(<RealStreetControl />);
    expect(screen.getByRole("button", { name: "Phố thật" })).toBeDisabled();
    act(() => worldDataProvider.openText(text));
    expect(screen.getByRole("button", { name: "Phố thật" })).toBeDisabled();
  });
  it("focuses Cancel and sends nothing when the dialog is cancelled", async () => {
    await prepare();
    const { replace } = popup();
    render(<RealStreetControl />);
    fireEvent.click(screen.getByRole("button", { name: "Phố thật" }));
    const cancel = await screen.findByRole("button", { name: "Hủy" });
    expect(cancel).toHaveFocus();
    expect(document.querySelector('a[href*="google.com/maps"]')).toBeNull();
    expect(window.open).not.toHaveBeenCalled();
    fireEvent.click(cancel);
    expect(replace).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Phố thật" })).toHaveFocus());
  });
  it("reads the actual camera again on confirmation and isolates the new tab", async () => {
    await prepare();
    const { replace, head, handle } = popup();
    render(<RealStreetControl />);
    fireEvent.click(screen.getByRole("button", { name: "Phố thật" }));
    view = { ...view, target: { x: 130, y: 0, z: -80 }, direction: { x: 1, y: 0, z: 0 } };
    fireEvent.click(screen.getByRole("button", { name: "Mở Google" }));
    expect(window.open).toHaveBeenCalledExactlyOnceWith("about:blank", "_blank");
    expect(handle.opener).toBeNull();
    expect(head.querySelector('meta[name="referrer"]')?.getAttribute("content")).toBe(
      "no-referrer",
    );
    const url = new URL(replace.mock.calls[0]![0] as string);
    expect(url.searchParams.get("heading")).toBe("90");
    expect(url.searchParams.get("viewpoint")).not.toBe("0.4321987,0.6789123");
    expect([...url.searchParams.keys()].sort()).toEqual([
      "api",
      "heading",
      "map_action",
      "viewpoint",
    ]);
  });
  it("sends only satellite parameters and keeps the world intact if blocked", async () => {
    await prepare();
    vi.spyOn(window, "open").mockReturnValue(null);
    const before = worldDataProvider.exportWorkingPackage();
    render(<RealStreetControl />);
    fireEvent.click(screen.getByRole("button", { name: "Phố thật" }));
    fireEvent.click(screen.getByRole("button", { name: "Vệ tinh" }));
    fireEvent.click(screen.getByRole("button", { name: "Mở Google" }));
    expect(screen.getByRole("alert")).toHaveTextContent("popup");
    expect(worldDataProvider.exportWorkingPackage()).toEqual(before);
    const { replace } = popup();
    fireEvent.click(screen.getByRole("button", { name: "Mở Google" }));
    const url = new URL(replace.mock.calls[0]![0] as string);
    expect(url.searchParams.get("basemap")).toBe("satellite");
    expect([...url.searchParams.keys()].sort()).toEqual([
      "api",
      "basemap",
      "center",
      "map_action",
      "zoom",
    ]);
  });
  it("invalidates an outstanding confirmation on package switch, loading or reset", async () => {
    await prepare();
    popup();
    render(<RealStreetControl />);
    fireEvent.click(screen.getByRole("button", { name: "Phố thật" }));
    act(() => worldDataProvider.openText(text + " "));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.open).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Phố thật" })).toBeDisabled();
    await act(async () => {
      await prepare();
    });
    fireEvent.click(screen.getByRole("button", { name: "Phố thật" }));
    act(() => {
      void worldDataProvider.openFile({
        size: 1,
        text: () => new Promise<string>(() => {}),
      } as File);
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(window.open).not.toHaveBeenCalled();
  });
  it("shows the same explicit English flow without changing camera mode", async () => {
    await prepare();
    useAppStore.setState({ language: "en" });
    render(<RealStreetControl />);
    fireEvent.click(screen.getByRole("button", { name: "Real street" }));
    expect(screen.getByRole("button", { name: "Open Google" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(screen.getByText(/North/)).toBeInTheDocument();
  });
});
it("closes a blank popup if navigation setup fails", () => {
  const handle = {
    closed: false,
    close: vi.fn(),
    get document() {
      throw new Error("synthetic failure");
    },
    opener: window,
  };
  vi.spyOn(window, "open").mockReturnValue(handle as unknown as Window);
  expect(openRealStreetWindow("https://www.google.com/maps/@?api=1")).toBe(false);
  expect(handle.close).toHaveBeenCalledOnce();
});
