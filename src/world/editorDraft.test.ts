import { describe, expect, it } from "vitest";
import { buildingPatch, classifyNumericDraft, roadWidthPatch } from "./editorDraft";
import type { Building, RoadSegment } from "./schema";

const provenance = { source: "survey" as const, quality: "verified" as const };
const building = {
  localId: "b",
  geometry: {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  },
  footprintKind: "footprint",
  wallHeight: 6,
  levels: 2,
  roofType: "flat",
  baseElevation: 3,
  roofHeight: 2,
  provenance,
} as Building;

describe("editor draft values", () => {
  it("distinguishes empty, zero, NaN, negative, and out-of-range", () => {
    expect(classifyNumericDraft("")).toBe("empty");
    expect(classifyNumericDraft("0")).toBe("zero");
    expect(classifyNumericDraft("nope")).toBe("nan");
    expect(classifyNumericDraft("-1")).toBe("negative");
    expect(classifyNumericDraft("1001", { max: 1000 })).toBe("out-of-range");
  });
  it("only emits changed fields and keeps imported height context untouched", () => {
    expect(buildingPatch(building, { wallHeight: 8 })).toEqual({ wallHeight: 8 });
  });
  it("patches road width without replacing direction or elevation", () => {
    const road = {
      localId: "r",
      carriagewayWidth: 5,
      direction: "forward",
      baseElevation: 3,
    } as RoadSegment;
    expect(roadWidthPatch(road, 7)).toEqual({ carriagewayWidth: 7 });
  });
});
