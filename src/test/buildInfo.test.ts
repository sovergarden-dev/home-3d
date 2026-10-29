import { describe, expect, it } from "vitest";
import { normalizeBuildSha, PUBLIC_BUILD_VERSION } from "@/config/buildInfo";
import { version } from "../../package.json";
import { resolveBuildSha } from "../../build/identity";

describe("public build identity", () => {
  it("does not invent an unavailable revision", () => {
    for (const value of [undefined, null, "", "HEAD", "07175b3", "private-file.json", "<script>"])
      expect(normalizeBuildSha(value)).toBeNull();
    expect(PUBLIC_BUILD_VERSION).toBe(`v${version}`);
  });
  it("accepts only an explicitly provided full SHA", () => {
    expect(normalizeBuildSha("A".repeat(40))).toBe("a".repeat(40));
  });
  it("uses a valid explicit revision before Git and otherwise reads the checkout", () => {
    expect(
      resolveBuildSha("a".repeat(40), () => {
        throw Error("not called");
      }),
    ).toBe("a".repeat(40));
    expect(resolveBuildSha(undefined, () => "B".repeat(40) + "\n")).toBe("b".repeat(40));
    expect(resolveBuildSha("invalid", () => "c".repeat(40))).toBe("c".repeat(40));
  });
  it("keeps an unavailable or malformed Git revision unknown", () => {
    expect(
      resolveBuildSha(undefined, () => {
        throw Error("no checkout");
      }),
    ).toBeNull();
    expect(resolveBuildSha(undefined, () => "HEAD")).toBeNull();
  });
});
