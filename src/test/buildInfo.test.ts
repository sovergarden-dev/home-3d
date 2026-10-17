import { describe, expect, it } from "vitest";
import { normalizeBuildSha, PUBLIC_BUILD_VERSION } from "@/config/buildInfo";

describe("public build identity", () => {
  it("does not invent an unavailable revision", () => {
    for (const value of [undefined, null, "", "HEAD", "07175b3", "private-file.json", "<script>"])
      expect(normalizeBuildSha(value)).toBeNull();
    expect(PUBLIC_BUILD_VERSION).toBe("H6");
  });
  it("accepts only an explicitly provided full SHA", () => {
    expect(normalizeBuildSha("A".repeat(40))).toBe("a".repeat(40));
  });
});
