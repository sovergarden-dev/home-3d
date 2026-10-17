import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrivateWorldPanel } from "@/components/overlay/PrivateWorldPanel";
import { worldDataProvider } from "@/world/privateWorldSession";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";
import type { Building, WorldData, WorldOverrideDocument } from "@/world/schema";

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

function openPackage(world: WorldData, overrides?: WorldOverrideDocument) {
  worldDataProvider.openText(
    JSON.stringify({ manifest: world.manifest, world, ...(overrides ? { overrides } : {}) }),
  );
}

function openAdvanced() {
  fireEvent.click(screen.getByRole("button", { name: "Biên tập nâng cao" }));
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
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Không thể mở gói cục bộ. Giữ gói riêng trên thiết bị và thử lại.",
    );
  });

  it("clears undo history when switching private packages and preserves redo after an invalid edit", () => {
    act(() => openPackage(testWorld("building-shared-id", 6)));
    render(<PrivateWorldPanel enabled />);
    openAdvanced();
    const selectBuilding = screen.getByLabelText("Chọn công trình");
    fireEvent.change(selectBuilding, { target: { value: "building-shared-id" } });
    const height = screen.getByLabelText("Chiều cao (m)");

    fireEvent.change(height, { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sửa" }));
    fireEvent.change(screen.getByLabelText("Chiều cao (m)"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sửa" }));
    expect(screen.getByText("Undo")).toBeVisible();

    act(() => openPackage(testWorld("building-shared-id", 20)));
    openAdvanced();
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
    openAdvanced();
    fireEvent.change(screen.getByLabelText("Chọn công trình"), {
      target: { value: "building-with-part" },
    });
    expect(screen.getByLabelText("Chọn phần công trình")).toBeVisible();
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

  it("syncs the selected part editor fields after undo and redo", () => {
    act(() => openPackage(testWorld("building-with-part", 6, true)));
    render(<PrivateWorldPanel enabled />);
    openAdvanced();
    fireEvent.change(screen.getByLabelText("Chọn công trình"), {
      target: { value: "building-with-part" },
    });
    const partHeight = screen.getByLabelText("Chiều cao phần (m)");
    expect(partHeight).toHaveValue(4);

    fireEvent.change(partHeight, { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu phần" }));
    expect(privateSnapshot().world.buildings[0]?.parts?.[0]?.wallHeight).toBe(8);
    expect(partHeight).toHaveValue(8);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(privateSnapshot().world.buildings[0]?.parts?.[0]?.wallHeight).toBe(4);
    expect(partHeight).toHaveValue(4);

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(privateSnapshot().world.buildings[0]?.parts?.[0]?.wallHeight).toBe(8);
    expect(partHeight).toHaveValue(8);
  });

  it("collapses and reopens the panel through an accessible control", () => {
    render(<PrivateWorldPanel enabled />);

    const collapse = screen.getByRole("button", { name: "Thu gọn bảng riêng" });
    expect(collapse).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(collapse);
    const expand = screen.getByRole("button", { name: "Mở bảng riêng" });
    expect(expand).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByLabelText("Mở gói world")).not.toBeVisible();

    fireEvent.click(expand);
    expect(screen.getByLabelText("Mở gói world")).toBeVisible();
  });

  it("preserves imported building fields and their provenance when editing exposed fields", () => {
    const world = testWorld("building-imported-fields", 6);
    const imported: WorldOverrideDocument = {
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "imported-building-fields",
          revision: 4,
          reason: "Synthetic imported building attributes",
          provenance: { source: "survey", quality: "verified", sourceNamespace: "survey-a" },
          patch: {
            operation: "patch_building",
            featureId: "building-imported-fields",
            patch: { baseElevation: 3, roofHeight: 2, wallHeight: 7, levels: 2, roofType: "flat" },
          },
        },
      ],
    };
    act(() => openPackage(world, imported));
    render(<PrivateWorldPanel enabled />);
    openAdvanced();
    fireEvent.change(screen.getByLabelText("Chọn công trình"), {
      target: { value: "building-imported-fields" },
    });
    fireEvent.change(screen.getByLabelText("Chiều cao (m)"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu sửa" }));

    const snapshot = privateSnapshot();
    const building = snapshot.world.buildings[0]!;
    expect(building).toMatchObject({ baseElevation: 3, roofHeight: 2, wallHeight: 8 });
    expect(building.attributes?.["baseElevation"]).toMatchObject({
      source: "survey",
      quality: "verified",
    });
    expect(building.attributes?.["roofHeight"]).toMatchObject({
      source: "survey",
      quality: "verified",
    });
    expect(building.attributes?.["wallHeight"]).toMatchObject({
      source: "manual_override",
      quality: "inferred",
    });
    expect(snapshot.overrides?.overrides).toHaveLength(2);
  });

  it("preserves imported part fields and provenance when editing a part", () => {
    const world = testWorld("building-imported-part-fields", 6, true);
    const partId = "building-imported-part-fields-part";
    const imported: WorldOverrideDocument = {
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "imported-part-fields",
          revision: 6,
          reason: "Synthetic imported part attributes",
          provenance: { source: "survey", quality: "verified", sourceNamespace: "survey-a" },
          patch: {
            operation: "patch_building_part",
            buildingId: "building-imported-part-fields",
            partId,
            patch: { baseElevation: 3, roofHeight: 2, wallHeight: 4, levels: 1, roofType: "flat" },
          },
        },
      ],
    };
    act(() => openPackage(world, imported));
    render(<PrivateWorldPanel enabled />);
    openAdvanced();
    fireEvent.change(screen.getByLabelText("Chọn công trình"), {
      target: { value: "building-imported-part-fields" },
    });
    fireEvent.change(screen.getByLabelText("Chọn phần công trình"), { target: { value: partId } });
    fireEvent.change(screen.getByLabelText("Chiều cao phần (m)"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu phần" }));

    const part = privateSnapshot().world.buildings[0]?.parts?.[0];
    expect(part).toMatchObject({ baseElevation: 3, roofHeight: 2, wallHeight: 8 });
    expect(part?.attributes?.["baseElevation"]).toMatchObject({
      source: "survey",
      quality: "verified",
    });
    expect(part?.attributes?.["roofHeight"]).toMatchObject({
      source: "survey",
      quality: "verified",
    });
    expect(part?.attributes?.["wallHeight"]).toMatchObject({
      source: "manual_override",
      quality: "inferred",
    });
    expect(privateSnapshot().overrides?.overrides).toHaveLength(2);
  });

  it("preserves imported road direction and elevation when editing only width", () => {
    const world = testWorld("building-road-fields", 6);
    const provenance = {
      source: "survey" as const,
      quality: "verified" as const,
      sourceNamespace: "survey-a",
    };
    world.roads = [
      {
        localId: "road-r",
        polylineENU: [
          [0, 0],
          [10, 0],
        ],
        connectorIds: [],
        roadClass: "residential",
        carriagewayWidth: 5,
        elevationLayer: 0,
        baseElevation: 0,
        direction: "both",
        surface: "asphalt",
        provenance,
        attributes: {
          direction: provenance,
          baseElevation: provenance,
          carriagewayWidth: provenance,
        },
      },
    ];
    const imported: WorldOverrideDocument = {
      schemaVersion: "1.0",
      overrides: [
        {
          localId: "imported-road-fields",
          revision: 8,
          reason: "Synthetic imported road attributes",
          provenance,
          patch: {
            operation: "patch_road",
            featureId: "road-r",
            patch: { direction: "forward", baseElevation: 3, carriagewayWidth: 7 },
          },
        },
      ],
    };
    act(() => openPackage(world, imported));
    render(<PrivateWorldPanel enabled />);
    openAdvanced();
    fireEvent.change(screen.getByLabelText("Chọn tuyến đường"), { target: { value: "road-r" } });
    fireEvent.change(screen.getByLabelText("Bề rộng đường"), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "Lưu đường" }));

    const road = privateSnapshot().world.roads[0]!;
    expect(road).toMatchObject({ direction: "forward", baseElevation: 3, carriagewayWidth: 8 });
    expect(road.attributes?.["direction"]).toMatchObject({ source: "survey", quality: "verified" });
    expect(road.attributes?.["baseElevation"]).toMatchObject({
      source: "survey",
      quality: "verified",
    });
    expect(road.attributes?.["carriagewayWidth"]).toMatchObject({
      source: "manual_override",
      quality: "inferred",
    });
    expect(privateSnapshot().overrides?.overrides).toHaveLength(2);
  });
});
