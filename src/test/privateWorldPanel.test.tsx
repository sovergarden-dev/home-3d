import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrivateWorldPanel } from "@/components/overlay/PrivateWorldPanel";
import { worldDataProvider } from "@/world/privateWorldSession";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import type { Building, WorldData } from "@/world/schema";

afterEach(() => act(() => worldDataProvider.resetFixture()));

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

function testWorld(localId: string, height: number, includePart = false): WorldData {
  const provenance = {
    source: "survey" as const,
    quality: "verified" as const,
    sourceNamespace: "survey-a",
  };
  const building: Building = {
    localId,
    geometry: structuredClone(rectangle),
    footprintKind: "footprint",
    wallHeight: height,
    levels: 2,
    roofType: "flat",
    provenance,
    attributes: {
      wallHeight: provenance,
      levels: provenance,
    },
    ...(includePart
      ? {
          parts: [
            {
              localId: `${localId}-part`,
              geometry: structuredClone(rectangle),
              wallHeight: 4,
              levels: 1,
              roofType: "flat" as const,
              provenance,
              attributes: { wallHeight: provenance },
            },
          ],
        }
      : {}),
  };
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD) as WorldData;
  world.roads = [];
  world.buildings = [building];
  world.lots = [];
  world.trees = [];
  world.props = [];
  return world;
}

function openPackage(world: WorldData) {
  worldDataProvider.openText(JSON.stringify({ manifest: world.manifest, world }));
}

function privateSnapshot() {
  const snapshot = worldDataProvider.getSnapshot();
  if (snapshot.mode !== "private") throw new Error("PRIVATE_PACKAGE_NOT_OPEN");
  return snapshot;
}

describe("local private preview panel", () => {
  it("renders only when explicitly enabled and keeps a local file input", () => {
    const { rerender } = render(<PrivateWorldPanel enabled={false} />);
    expect(screen.queryByText("Xem trước gói cục bộ")).toBeNull();

    rerender(<PrivateWorldPanel enabled />);
    expect(screen.getByText("Xem trước gói cục bộ")).toBeVisible();
    expect(screen.getByLabelText("Mở gói world")).toHaveAttribute("type", "file");
  });

  it("shows a failure state for an invalid local package instead of returning to demo silently", async () => {
    render(<PrivateWorldPanel enabled />);
    const file = new File(["{ bad"], "invalid-world.json", { type: "application/json" });
    fireEvent.change(screen.getByLabelText("Mở gói world"), { target: { files: [file] } });
    expect(
      await screen.findByText("Không thể mở gói cục bộ. Giữ gói riêng trên thiết bị và thử lại."),
    ).toBeVisible();
  });

  it("clears undo history when switching private packages and preserves redo after an invalid edit", () => {
    act(() => openPackage(testWorld("building-shared-id", 6)));
    render(<PrivateWorldPanel enabled />);
    const selectBuilding = screen.getByLabelText("Chọn công trình");
    fireEvent.change(selectBuilding, { target: { value: "building-shared-id" } });
    const height = screen.getByLabelText("Chiều cao (m)");

    fireEvent.change(height, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sửa" }));
    fireEvent.change(screen.getByLabelText("Chiều cao (m)"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sửa" }));
    expect(screen.getByText("Undo")).toBeVisible();

    act(() => openPackage(testWorld("building-shared-id", 20)));
    expect(privateSnapshot().world.buildings[0]?.wallHeight).toBe(20);
    expect(screen.queryByText("Undo")).toBeNull();

    fireEvent.change(screen.getByLabelText("Chọn công trình"), {
      target: { value: "building-shared-id" },
    });
    fireEvent.change(screen.getByLabelText("Chiều cao (m)"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sửa" }));
    fireEvent.click(screen.getByText("Undo"));
    expect(privateSnapshot().world.buildings[0]?.wallHeight).toBe(20);
    expect(screen.getByText("Redo")).toBeVisible();

    fireEvent.change(screen.getByLabelText("Chiều cao (m)"), { target: { value: "-2" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sửa" }));
    expect(privateSnapshot().world.buildings[0]?.wallHeight).toBe(20);
    expect(screen.getByText("Redo")).toBeVisible();

    fireEvent.click(screen.getByText("Redo"));
    expect(privateSnapshot().world.buildings[0]?.wallHeight).toBe(12);
  });

  it("edits a rendered building part and disables inert parent-height controls", () => {
    act(() => openPackage(testWorld("building-with-part", 6, true)));
    render(<PrivateWorldPanel enabled />);
    fireEvent.change(screen.getByLabelText("Chọn công trình"), {
      target: { value: "building-with-part" },
    });
    expect(screen.getByTestId("building-part-editor")).toBeVisible();
    expect(screen.getByLabelText("Chiều cao (m)")).toBeDisabled();

    fireEvent.change(screen.getByLabelText("Chọn phần công trình"), {
      target: { value: "building-with-part-part" },
    });
    fireEvent.change(screen.getByLabelText("Chiều cao phần (m)"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu phần" }));
    const snapshot = worldDataProvider.getSnapshot();
    expect(snapshot.mode).toBe("private");
    if (snapshot.mode !== "private") throw new Error("PART_EDIT_FAILED");
    expect(snapshot.world.buildings[0]?.wallHeight).toBe(6);
    expect(snapshot.world.buildings[0]?.parts?.[0]?.wallHeight).toBe(8);
  });
});
