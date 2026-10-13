import { describe, expect, it } from "vitest";
import { createWorldDataProvider } from "@/world/privateWorldSession";
import { SYNTHETIC_NEIGHBORHOOD } from "@/world/fixtures/syntheticNeighborhood";

describe("local private world session", () => {
  it("opens a valid package in memory and reports malformed input without relabeling fixture data as private", () => {
    const provider = createWorldDataProvider(SYNTHETIC_NEIGHBORHOOD);
    const validPackage = JSON.stringify({
      manifest: SYNTHETIC_NEIGHBORHOOD.manifest,
      world: SYNTHETIC_NEIGHBORHOOD,
    });

    provider.openText(validPackage);
    expect(provider.getSnapshot()).toMatchObject({ mode: "private" });

    provider.openText("{ malformed package");
    const failed = provider.getSnapshot();
    expect(failed.mode).toBe("private-error");
    expect("world" in failed).toBe(false);
  });
});
