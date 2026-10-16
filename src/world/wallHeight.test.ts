import { describe, expect, it } from "vitest";
import { assessWallHeight } from "./wallHeight";

describe("assessWallHeight", () => {
  it("keeps a no-level inferred class prior flat instead of rendering its placeholder height", () => {
    expect(
      assessWallHeight(
        {
          wallHeight: 6,
          attributes: {
            wallHeight: { source: "osm", quality: "inferred" },
            levels: { source: "osm", quality: "unknown" },
          },
        },
        false,
      ),
    ).toEqual({ status: "unknown", renderedHeight: 0 });
  });

  it("renders a height inferred from source levels and keeps it marked inferred", () => {
    expect(
      assessWallHeight(
        {
          wallHeight: 6.4,
          levels: 2,
          attributes: {
            wallHeight: { source: "osm", quality: "inferred" },
            levels: { source: "osm", quality: "source_only" },
          },
        },
        false,
      ),
    ).toEqual({ status: "inferred", renderedHeight: 6.4 });
  });

  it("renders a source-only height as known", () => {
    expect(
      assessWallHeight(
        {
          wallHeight: 8,
          attributes: { wallHeight: { source: "osm", quality: "source_only" } },
        },
        false,
      ),
    ).toEqual({ status: "known", renderedHeight: 8 });
  });

  it("renders explicit user overrides as inferred", () => {
    expect(
      assessWallHeight(
        {
          wallHeight: 5.5,
          attributes: {
            wallHeight: { source: "manual_override", quality: "inferred" },
          },
        },
        false,
      ),
    ).toEqual({ status: "inferred", renderedHeight: 5.5 });
  });

  it("keeps authored synthetic fixtures renderable", () => {
    expect(assessWallHeight({ wallHeight: 10 }, true)).toEqual({
      status: "synthetic",
      renderedHeight: 10,
    });
  });
});
