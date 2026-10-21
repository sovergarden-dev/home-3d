import { createHash } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
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
const FIXED_TIME = new Date("2026-06-21T05:00:00.000Z");

type Language = "vi" | "en";
type Viewport = { name: string; width: number; height: number; forceFallback?: boolean };

const viewports: Viewport[] = [
  { name: "phone", width: 390, height: 844 },
  { name: "landscape", width: 740, height: 390 },
  { name: "phone", width: 390, height: 844, forceFallback: true },
  { name: "landscape", width: 740, height: 390, forceFallback: true },
];

function localFixtureTime(date: Date) {
  return new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16);
}

async function installFixtureRoute(
  page: Page,
  malformed: () => boolean,
  requests: { count: number },
) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "api.open-meteo.com") {
      requests.count += 1;
      const now = await page.evaluate(() => new Date().toISOString());
      const current = {
        time: localFixtureTime(new Date(now)),
        temperature_2m: 29,
        weather_code: 1,
      };
      const payload = malformed()
        ? {
            timezone: "Asia/Ho_Chi_Minh",
            utc_offset_seconds: 25200,
            current,
            current_units: { temperature_2m: "F", weather_code: "wmo code" },
          }
        : {
            timezone: "Asia/Ho_Chi_Minh",
            utc_offset_seconds: 25200,
            current,
            current_units: { temperature_2m: "°C", weather_code: "wmo code" },
          };
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    } else if (
      ["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
      url.protocol === "data:" ||
      url.protocol === "blob:"
    ) {
      await route.continue();
    } else {
      await route.abort();
    }
  });
}

async function assertDialogAndActions(
  page: Page,
  viewport: Viewport,
  language: Language,
  expectedActions: number,
) {
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await dialog.scrollIntoViewIfNeeded();
  const dialogBox = await dialog.boundingBox();
  expect(dialogBox).not.toBeNull();
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.y).toBeGreaterThanOrEqual(0);
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(viewport.width + 0.5);
  expect(dialogBox!.y + dialogBox!.height).toBeLessThanOrEqual(viewport.height + 0.5);

  const actions = dialog.getByRole("button");
  await expect(actions).toHaveCount(expectedActions);
  for (const action of await actions.all()) {
    await action.scrollIntoViewIfNeeded();
    const box = await action.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.width).toBeGreaterThanOrEqual(44);
    expect(box!.height).toBeGreaterThanOrEqual(44);
    expect(box!.x).toBeGreaterThanOrEqual(dialogBox!.x);
    expect(box!.x + box!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 0.5);
    expect(box!.y).toBeGreaterThanOrEqual(dialogBox!.y);
    expect(box!.y + box!.height).toBeLessThanOrEqual(dialogBox!.y + dialogBox!.height + 0.5);
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 0.5);
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 0.5);
    expect((await action.innerText()).trim().length).toBeGreaterThan(0);
    await action.focus();
    await expect(action).toBeFocused();
  }
  return { dialog, actions };
}

async function saveStateScreenshot(
  page: Page,
  testInfo: TestInfo,
  language: Language,
  viewport: Viewport,
  state: string,
) {
  const path = testInfo.outputPath(`p8-weather-${language}-${viewport.name}-${state}.png`);
  mkdirSync(dirname(path), { recursive: true });
  await page.screenshot({
    path,
    fullPage: false,
  });
}

async function uploadPrivateFixture(page: Page, language: Language) {
  await page.getByLabel(language === "vi" ? "Mở gói world" : "Open world package").setInputFiles({
    name: "p8-weather.json",
    mimeType: "application/json",
    buffer: Buffer.from(packageText),
  });
  await page
    .getByLabel(language === "vi" ? "Mở tham chiếu địa lý" : "Open georeference")
    .setInputFiles({
      name: "p8-weather-georeference.json",
      mimeType: "application/json",
      buffer: Buffer.from(georeferenceText),
    });
}

async function openWeather(page: Page, language: Language) {
  await page.getByRole("tab", { name: language === "vi" ? "Thời tiết" : "Weather" }).click();
  const trigger = page.getByRole("button", {
    name: language === "vi" ? "Thời tiết thật" : "Real weather",
  });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  return trigger;
}

async function clickNamedAction(dialog: Locator, pattern: RegExp) {
  const action = dialog.getByRole("button", { name: pattern }).first();
  await action.scrollIntoViewIfNeeded();
  await expect(action).toBeVisible();
  await action.click();
}

test.describe("P8 weather consent and responsive lifecycle", () => {
  for (const language of ["vi", "en"] as const) {
    for (const viewport of viewports) {
      const forceFallback = viewport.forceFallback === true;
      test(`${forceFallback ? "forced fallback " : ""}${language} ${viewport.name} covers consent, ready, stale, and error actions`, async ({
        page,
      }, testInfo) => {
        const requests = { count: 0 };
        let malformed = false;
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await installFixtureRoute(page, () => malformed, requests);
        if (forceFallback) {
          await page.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
              if (type === "webgl2") return null;
              return Reflect.apply(original, this, [type, ...args]);
            };
          });
        }
        await page.goto("/");
        await expect(page.locator("#scene-root")).toHaveAttribute(
          "data-scene-state",
          /ready|fallback/,
        );
        await page.clock.install();
        await page.clock.setFixedTime(FIXED_TIME);
        await page.getByRole("tab", { name: "Thời gian", exact: true }).click();
        await page.getByLabel("Ngày đang xem").fill("2026-06-21");
        await page.getByRole("radio", { name: language }).click();
        await uploadPrivateFixture(page, language);
        await page.getByRole("tab", { name: language === "vi" ? "Thời tiết" : "Weather" }).click();
        await page
          .getByRole("radio", { name: language === "vi" ? "Mưa" : "Rain", exact: true })
          .click();
        const trigger = await openWeather(page, language);

        // Before consent: both visible actions fit, and keyboard Cancel makes no request.
        const before = await assertDialogAndActions(page, viewport, language, 2);
        await saveStateScreenshot(page, testInfo, language, viewport, "before-consent");
        const cancel = before.actions.first();
        await cancel.focus();
        await cancel.press("Enter");
        await expect(page.getByRole("dialog")).toBeHidden();
        expect(requests.count).toBe(0);
        await expect(trigger).toBeFocused();

        // Allow by keyboard Enter and verify the first response is ready.
        await trigger.click();
        const consentDialog = page.getByRole("dialog");
        const allow = consentDialog.getByRole("button").last();
        await allow.focus();
        await allow.press("Enter");
        await expect.poll(() => requests.count).toBe(1);
        await expect(page.getByRole("dialog")).toBeHidden();
        const weatherStatus = trigger.locator('xpath=following-sibling::p[@role="status"]');
        await expect(weatherStatus).toContainText(
          language === "vi" ? "Thời tiết hiện tại" : "Current weather",
        );

        // READY has Cancel, retry/confirm, and Off; each button is measured in the viewport.
        await trigger.click();
        const ready = await assertDialogAndActions(page, viewport, language, 3);
        await saveStateScreenshot(page, testInfo, language, viewport, "ready");
        await clickNamedAction(ready.dialog, language === "vi" ? /Hủy/ : /Cancel/);
        await expect(page.getByRole("dialog")).toBeHidden();
        expect(requests.count).toBe(1);

        // The adapter's timer creates STALE without another network request and restores manual rain.
        await page.clock.fastForward(15 * 60 * 1000 + 1);
        await page.clock.setFixedTime(new Date(FIXED_TIME.getTime() + 15 * 60 * 1000 + 1));
        await expect(weatherStatus).toContainText(
          language === "vi" ? "Dữ liệu cũ" : "Cached weather",
        );
        await expect(page.locator(".h6-top-info")).not.toContainText(
          /Thời tiết hiện tại|Live weather/i,
        );
        await expect(page.locator(".h6-top-info")).toContainText(
          language === "vi" ? "Mưa" : "Rain",
        );
        const weatherAttributes = await page
          .locator("#scene-root, [data-testid='demo-scene']")
          .evaluateAll((nodes) =>
            nodes
              .map((node) => node.getAttribute("data-weather"))
              .filter((value): value is string => value !== null),
          );
        const sceneReady =
          (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
        // Normal Chromium cases retain the required-GPU guard. These additional
        // explicit fallback cases exercise DOM controls, never claim GPU coverage.
        if (process.env["REQUIRE_WEBGL2"] === "1" && !forceFallback) expect(sceneReady).toBe(true);
        if (forceFallback) expect(sceneReady).toBe(false);
        if (sceneReady) expect(weatherAttributes).toContain("rain");
        else
          await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "fallback");
        expect(requests.count).toBe(1);

        await trigger.click();
        const stale = await assertDialogAndActions(page, viewport, language, 3);
        await saveStateScreenshot(page, testInfo, language, viewport, "stale");
        await clickNamedAction(stale.dialog, language === "vi" ? /Thử lại/ : /Retry/);
        await expect.poll(() => requests.count).toBe(2);
        await expect(page.getByRole("dialog")).toBeHidden();

        // A malformed fixture is a non-retrying ERROR; exercise Cancel, Off, then Retry by real clicks.
        malformed = true;
        await trigger.click();
        const staleOrReady = page.getByRole("dialog");
        await clickNamedAction(
          staleOrReady,
          language === "vi" ? /Tắt|Dùng thời tiết mô phỏng/ : /Off|Use simulated weather/,
        );
        await expect(page.getByRole("dialog")).toBeHidden();
        await expect.poll(() => requests.count).toBe(2);

        await trigger.click();
        const offDialog = page.getByRole("dialog");
        await clickNamedAction(
          offDialog,
          language === "vi" ? /Cho phép thời tiết hiện tại/ : /Allow current weather/,
        );
        await expect.poll(() => requests.count).toBe(3);
        await expect(page.getByRole("dialog")).toBeHidden();
        await trigger.click();
        const error = await assertDialogAndActions(page, viewport, language, 3);
        await saveStateScreenshot(page, testInfo, language, viewport, "error");
        expect(requests.count).toBe(3);
        await clickNamedAction(error.dialog, language === "vi" ? /Hủy/ : /Cancel/);
        await expect(page.getByRole("dialog")).toBeHidden();
        expect(requests.count).toBe(3);

        await trigger.click();
        const errorAgain = page.getByRole("dialog");
        await clickNamedAction(
          errorAgain,
          language === "vi" ? /Tắt|Dùng thời tiết mô phỏng/ : /Off|Use simulated weather/,
        );
        await expect(page.getByRole("dialog")).toBeHidden();
        await trigger.click();
        await clickNamedAction(
          page.getByRole("dialog"),
          language === "vi" ? /Cho phép thời tiết hiện tại/ : /Allow current weather/,
        );
        await expect.poll(() => requests.count).toBe(4);
        await trigger.click();
        const finalError = await assertDialogAndActions(page, viewport, language, 3);
        await clickNamedAction(finalError.dialog, language === "vi" ? /Thử lại/ : /Retry/);
        await expect.poll(() => requests.count).toBe(5);
        await expect(page.getByRole("dialog")).toBeHidden();
        await trigger.click();
        await expect(page.getByRole("dialog").getByRole("status").last()).toContainText(
          language === "vi" ? /thời tiết/i : /weather/i,
        );
        if (forceFallback) {
          await clickNamedAction(page.getByRole("dialog"), language === "vi" ? /Hủy/ : /Cancel/);
          await page
            .getByRole("button", {
              name: language === "vi" ? "Thử lại 3D" : "Retry 3D",
              exact: true,
            })
            .click();
          await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "fallback");
          expect(requests.count).toBe(5);
        }
      });
    }
  }
});

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
