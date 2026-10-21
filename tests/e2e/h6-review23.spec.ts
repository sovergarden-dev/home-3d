import { expect, test } from "@playwright/test";
import {
  checkMalformedManifestRecovery,
  checkRoadGeometryRoundtrip,
  malformedManifestCases,
} from "./helpers/h6-review23";

test.describe("Review 23 synthetic file regressions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await expect(page.getByLabel("Mở gói world")).toBeAttached();
    await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/);
    if (process.env["REQUIRE_WEBGL2"] === "1")
      await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready");
  });
  for (const kind of malformedManifestCases) {
    test(`R23-1 ${kind} coverage is rejected without crash and valid file recovers`, async ({
      page,
    }) => {
      await checkMalformedManifestRecovery(page, kind);
    });
  }
  test("R23-2 road field provenance survives override and export/reopen in VI/EN", async ({
    page,
  }) => {
    await checkRoadGeometryRoundtrip(page);
  });
});
