import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrivateWorldPanel } from "@/components/overlay/PrivateWorldPanel";
import { worldDataProvider } from "@/world/privateWorldSession";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import type { Building, WorldData } from "@/world/schema";

const rectangle = {
  type: "Polygon" as const,
  coordinates: [
    [
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
      [0, 0],
    ] as [number, number][],
  ],
};
const provenance = {
  source: "survey" as const,
  quality: "verified" as const,
  sourceNamespace: "synthetic-test",
};

function testWorld(): WorldData {
  const building: Building = {
    localId: "synthetic-test-building",
    geometry: structuredClone(rectangle),
    footprintKind: "footprint",
    wallHeight: 6,
    levels: 2,
    roofType: "unknown",
    provenance,
    attributes: { wallHeight: provenance, levels: provenance, roofType: provenance },
  };
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD) as WorldData;
  world.manifest.datasetRevision = "SYNTHETIC_NEIGHBORHOOD";
  world.buildings = [building];
  world.roads = [];
  world.lots = structuredClone(SYNTHETIC_NEIGHBORHOOD.lots);
  world.lots[0]!.confirmed = false;
  world.lots[0]!.status = "future";
  world.trees = [];
  world.props = [];
  return world;
}

function openPackage(world = testWorld()) {
  act(() => worldDataProvider.openText(JSON.stringify({ manifest: world.manifest, world })));
}
function openEditor() {
  fireEvent.click(screen.getByRole("button", { name: "Biên tập nâng cao" }));
  fireEvent.change(screen.getByLabelText("Chọn công trình"), {
    target: { value: "synthetic-test-building" },
  });
}
function snapshotPrivate() {
  const snapshot = worldDataProvider.getSnapshot();
  if (snapshot.mode !== "private") throw new Error("PRIVATE_PACKAGE_NOT_OPEN");
  return snapshot;
}

afterEach(() => {
  vi.restoreAllMocks();
  act(() => worldDataProvider.resetFixture());
});

describe("H6 private panel completion regressions", () => {
  it("starts enabled but keeps Apply disabled until a field changes", () => {
    openPackage();
    render(<PrivateWorldPanel enabled />);
    openEditor();
    const save = screen.getByRole("button", { name: "Lưu sửa" });
    expect(screen.getByLabelText("Chiều cao (m)")).toHaveValue(6);
    expect(screen.getByLabelText("Số tầng")).toHaveValue(2);
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Số tầng"), { target: { value: "6" } });
    expect(save).toBeEnabled();
  });

  it("omits blank height from a levels-only patch and preserves roof provenance", () => {
    openPackage();
    render(<PrivateWorldPanel enabled />);
    openEditor();
    fireEvent.change(screen.getByLabelText("Chiều cao (m)"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Số tầng"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sửa" }));
    const override = snapshotPrivate().overrides?.overrides.at(-1);
    expect(override?.patch).toEqual({
      operation: "patch_building",
      featureId: "synthetic-test-building",
      patch: { levels: 6 },
    });
    expect(override?.patch).not.toHaveProperty("patch.wallHeight");
    expect(override?.patch).not.toHaveProperty("patch.roofType");
  });

  it("rejects negative, over-range, and fractional levels", () => {
    openPackage();
    render(<PrivateWorldPanel enabled />);
    openEditor();
    for (const value of ["-1", "2001", "1.5"]) {
      fireEvent.change(screen.getByLabelText("Số tầng"), { target: { value } });
      expect(screen.getByRole("button", { name: "Lưu sửa" })).toBeDisabled();
      expect(snapshotPrivate().overrides?.overrides ?? []).toHaveLength(0);
    }
  });

  it("accepts zero height as a real edit", () => {
    openPackage();
    render(<PrivateWorldPanel enabled />);
    openEditor();
    fireEvent.change(screen.getByLabelText("Chiều cao (m)"), { target: { value: "0" } });
    expect(screen.getByRole("button", { name: "Lưu sửa" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Lưu sửa" }));
    expect(snapshotPrivate().world.buildings[0]?.wallHeight).toBe(0);
  });

  it("resets the draft without mutating the applied world", () => {
    openPackage();
    render(<PrivateWorldPanel enabled />);
    openEditor();
    const height = screen.getByLabelText("Chiều cao (m)");
    fireEvent.change(height, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Đặt lại bản nháp" }));
    expect(height).toHaveValue(6);
    expect(snapshotPrivate().dirty).toBe(false);
    expect(snapshotPrivate().overrides?.overrides ?? []).toHaveLength(0);
  });

  it("guards dirty packages before unload and clears the guard after working export", () => {
    openPackage();
    render(<PrivateWorldPanel enabled />);
    openEditor();
    fireEvent.change(screen.getByLabelText("Số tầng"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sửa" }));
    const event = new Event("beforeunload", { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);

    const created: string[] = [];
    const revoked: string[] = [];
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      const url = `blob:test-${created.length}`;
      created.push(url);
      return url;
    });
    vi.spyOn(URL, "revokeObjectURL").mockImplementation((url) => {
      revoked.push(url);
    });
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Xuất bản làm việc" }));
    expect(click).toHaveBeenCalled();
    expect(created).toHaveLength(1);
    expect(revoked).toHaveLength(0);
    expect(snapshotPrivate().dirty).toBe(false);
  });

  it("exports a sidecar without clearing dirty state", () => {
    openPackage();
    render(<PrivateWorldPanel enabled />);
    openEditor();
    fireEvent.change(screen.getByLabelText("Số tầng"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sửa" }));
    vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:sidecar");
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    fireEvent.click(screen.getByRole("button", { name: "Xuất file overrides (.json)" }));
    expect(snapshotPrivate().dirty).toBe(true);
  });

  it("keeps the last valid lot document after invalid lot geometry", () => {
    openPackage();
    render(<PrivateWorldPanel enabled />);
    openEditor();
    fireEvent.change(screen.getByLabelText("Chọn công trình"), { target: { value: "" } });
    fireEvent.change(screen.getByLabelText("Chọn lô đất"), {
      target: { value: "lot-home-empty" },
    });
    const geometry = screen.getByLabelText("Ranh lô GeoJSON");
    const validGeometry = JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    });
    fireEvent.change(geometry, { target: { value: validGeometry } });
    fireEvent.click(screen.getAllByRole("button", { name: "Lưu hình dạng" }).at(-1)!);
    const afterValid = snapshotPrivate().overrides?.overrides.at(-1)?.patch;
    fireEvent.change(geometry, { target: { value: "{ invalid" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Lưu hình dạng" }).at(-1)!);
    expect(snapshotPrivate().overrides?.overrides.at(-1)?.patch).toEqual(afterValid);
  });

  it("keeps the current dirty package when replacing it is cancelled", async () => {
    openPackage();
    render(<PrivateWorldPanel enabled />);
    openEditor();
    fireEvent.change(screen.getByLabelText("Số tầng"), { target: { value: "6" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sửa" }));
    const before = snapshotPrivate();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const replacement = new File(
      [JSON.stringify({ manifest: testWorld().manifest, world: testWorld() })],
      "replacement.json",
      { type: "application/json" },
    );
    fireEvent.change(screen.getByLabelText("Mở gói world"), { target: { files: [replacement] } });
    await act(async () => Promise.resolve());
    const after = snapshotPrivate();
    expect(after.world.buildings[0]?.levels).toBe(6);
    expect(after.dirty).toBe(true);
    expect(after.packageEpoch).toBe(before.packageEpoch);
  });
});
