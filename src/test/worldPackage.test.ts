import { describe, expect, it } from "vitest";
import { parseWorldPackage } from "@/world/package";

const manifest = {
  schemaVersion: "1.0",
  datasetRevision: "synthetic-invalid",
  units: "metres",
  frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
  isSynthetic: true,
  coverage: { quality: "synthetic", sourceCount: 1 },
};

describe("world package parser", () => {
  it("rejects a superficially shaped package with no feature collections", () => {
    const result = parseWorldPackage(JSON.stringify({ manifest, world: { manifest } }));
    expect(result).toEqual({ ok: false, errorCode: "WORLD_PACKAGE_SHAPE_INVALID" });
  });
});
