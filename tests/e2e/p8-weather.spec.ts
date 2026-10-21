import { createHash } from "node:crypto";
import { expect, test } from "@playwright/test";
import { P8_FIXTURE } from "./helpers/p8-fixture";

const origin = { latitude: 10.123456, longitude: 106.654321, altitude: 0 };
const packageText = JSON.stringify({
  manifest: P8_FIXTURE.manifest,
  world: P8_FIXTURE.world,
  centerConfirmation: {
    status: "confirmed",
    provenance: { source: "owner", method: "explicit-user-confirmation" },
  },
});
const packageSha256 = createHash("sha256").update(packageText, "utf8").digest("hex");
const georeferenceText = JSON.stringify({ schemaVersion: "1.0", packageSha256, origin });
const currentPayload = {
  timezone: "Asia/Ho_Chi_Minh",
  utc_offset_seconds: 25200,
  current: { time: "2026-06-21T12:00", temperature_2m: 29, weather_code: 1 },
  current_units: { temperature_2m: "°C", weather_code: "wmo code" },
};

test.describe("P8 weather consent and request boundary", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-06-21T05:00:00Z"));
    await page.route("**/*", async (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "api.open-meteo.com")
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify(currentPayload),
        });
      else if (
        ["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
        url.protocol === "data:" ||
        url.protocol === "blob:"
      )
        await route.continue();
      else await route.abort();
    });
  });

  test("demo starts with weather disabled and no external requests", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (url.hostname === "api.open-meteo.com") external.push(request.url());
    });
    await page.goto("/");
    await page.getByRole("tab", { name: "Thời tiết" }).click();
    await expect(page.getByRole("button", { name: "Thời tiết thật" })).toBeDisabled();
    expect(external).toHaveLength(0);
  });

  test("native package/reference import enables consent, one request, success, and off", async ({
    page,
  }) => {
    let requests = 0;
    page.on("request", (request) => {
      if (new URL(request.url()).hostname === "api.open-meteo.com") requests += 1;
    });
    await page.goto("/");
    await page.getByLabel("Mở gói world").setInputFiles({
      name: "p8-weather.json",
      mimeType: "application/json",
      buffer: Buffer.from(packageText),
    });
    await page.getByLabel("Mở tham chiếu địa lý").setInputFiles({
      name: "p8-weather-georeference.json",
      mimeType: "application/json",
      buffer: Buffer.from(georeferenceText),
    });
    await page.getByRole("tab", { name: "Thời tiết" }).click();
    const trigger = page.getByRole("button", { name: "Thời tiết thật" });
    await expect(trigger).toBeEnabled();
    await expect(trigger).toBeEnabled();
    await trigger.click();
    await page.getByRole("button", { name: "Cho phép thời tiết hiện tại" }).click();
    await expect.poll(() => requests).toBe(1);
    await trigger.click();
    await expect(page.getByRole("dialog").getByRole("status")).toContainText("Thời tiết hiện tại");
    await page.getByRole("button", { name: "Dùng thời tiết mô phỏng" }).click();
    await expect.poll(() => requests).toBe(1);
  });
});
