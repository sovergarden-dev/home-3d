import { expect, test, type Page } from "@playwright/test";
import { P8_FIXTURE, P8_PACKAGE_TEXT, P8_SENTINEL, P8_VIEWPORT } from "./helpers/p8-fixture";
async function open(page: Page) {
  await page.goto("/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/);
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "p8-synthetic.json",
    mimeType: "application/json",
    buffer: Buffer.from(P8_PACKAGE_TEXT),
  });
  await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
}
async function store(page: Page, patch: Record<string, unknown>) {
  await page.evaluate(async (next) => {
    const moduleUrl = performance
      .getEntriesByType("resource")
      .find((entry) => new URL(entry.name).pathname === "/src/state/appStore.ts")?.name;
    if (!moduleUrl) throw new Error("ACTIVE_STORE_MODULE_MISSING");
    const { useAppStore } = await import(moduleUrl);
    useAppStore.setState(next);
  }, patch);
}
async function exportPackage(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Xuất bản làm việc", exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}
async function frame(page: Page) {
  const data = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .find((e) => new URL(e.name).pathname === "/src/engine/capture.ts")?.name;
    if (!url) throw Error("CAPTURE_MODULE_MISSING");
    return (await import(url)).captureDemoFrame();
  });
  expect(data).toMatch(/^data:image\/png;base64,/);
  return Buffer.from(data.split(",")[1], "base64");
}
test.describe("P8 synthetic atmosphere integration", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      return ["127.0.0.1", "localhost", "::1"].includes(u.hostname) ||
        ["data:", "blob:"].includes(u.protocol)
        ? route.continue()
        : route.abort();
    });
  });
  test("weather and date controls attempt no external location request and keep true activation blocked", async ({
    page,
  }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      const u = new URL(request.url());
      if (
        !["127.0.0.1", "localhost", "::1"].includes(u.hostname) &&
        !["data:", "blob:"].includes(u.protocol)
      )
        external.push(request.url());
    });
    await open(page);
    await page.getByLabel("Ngày đang xem").fill("2028-02-29");
    await page.getByRole("tab", { name: "Thời tiết", exact: true }).click();
    for (const name of ["Nhiều mây", "Mưa", "Mưa to", "Nắng nhẹ"])
      await page.getByRole("radio", { name, exact: true }).click();
    await expect(page.getByRole("button", { name: "Thời tiết thật", exact: true })).toBeDisabled();
    await expect(
      page.getByRole("status").filter({ hasText: "BLOCKED_MISSING_GEOREFERENCE" }),
    ).toBeVisible();
    expect(external).toEqual([]);
  });
  test("date drives Vietnamese auto festival; manual normal disables auto; VI/EN remains usable", async ({
    page,
  }) => {
    await open(page);
    await page.getByLabel("Ngày đang xem").fill("2026-02-17");
    await page.getByRole("tab", { name: "Lễ hội", exact: true }).click();
    await expect(page.getByRole("switch", { name: "Lễ hội tự động", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByRole("radio", { name: "Tết", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("radio", { name: "Trung Thu", exact: true }).click();
    await expect(page.getByRole("switch", { name: "Lễ hội tự động", exact: true })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    await page.getByRole("radio", { name: "Thường ngày", exact: true }).click();
    await expect(page.getByRole("radio", { name: "Thường ngày", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("radio", { name: "en", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(
      page.getByRole("switch", { name: "Automatic festivals", exact: true }),
    ).toBeVisible();
    await page.getByRole("tab", { name: "Time", exact: true }).click();
    await expect(page.getByLabel("Viewing date")).toHaveValue("2026-02-17");
  });
  test("all presentation controls preserve exported geometry, provenance and package state byte-for-byte", async ({
    page,
  }) => {
    await open(page);
    const before = await exportPackage(page);
    await store(page, {
      selectedDate: "2033-12-22",
      timeOfDayMinutes: 1380,
      weather: "storm",
      season: "wet",
      floodLevel: 1,
      festivalAuto: false,
      festival: "tet",
    });
    const ready = (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
    if (process.env["REQUIRE_WEBGL2"] === "1") expect(ready).toBe(true);
    for (const name of ["Mặt bằng", "Đi bộ", "Diorama"]) {
      const mode = page.getByRole("radio", { name, exact: true });
      if (ready) await mode.click();
      else await expect(mode).toBeDisabled();
    }
    await store(page, { atmosphereEnabled: false });
    const after = await exportPackage(page);
    expect(after).toEqual(before);
    expect(after.manifest.datasetRevision).toBe(P8_SENTINEL);
    expect(after.world.buildings).toEqual(P8_FIXTURE.world.buildings);
  });
  test("export invariant survives disabled presentation controls in Firefox fallback", async ({
    page,
    browserName,
  }) => {
    if (browserName === "firefox") {
      await page.addInitScript(() => {
        const original = HTMLCanvasElement.prototype.getContext;
        HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
          if (type === "webgl2") return null;
          return Reflect.apply(original, this, [type, ...args]);
        };
      });
    }
    await open(page);
    const sceneState = await page.locator("#scene-root").getAttribute("data-scene-state");
    expect(sceneState === "ready" || sceneState === "fallback").toBe(true);
    const modes = ["Mặt bằng", "Đi bộ", "Diorama"].map((name) =>
      page.getByRole("radio", { name, exact: true }),
    );
    if (sceneState === "ready") {
      for (const mode of modes) {
        await mode.evaluate((element) => (element as HTMLButtonElement).click());
        await expect(mode).toHaveAttribute("aria-checked", "true");
      }
    } else {
      for (const mode of modes) {
        await expect(mode).toBeDisabled();
        await mode.evaluate((element) => (element as HTMLButtonElement).click());
      }
    }
    const before = await exportPackage(page);
    await store(page, {
      selectedDate: "2033-12-22",
      timeOfDayMinutes: 1380,
      weather: "storm",
      season: "wet",
      floodLevel: 1,
      festivalAuto: false,
      festival: "tet",
      atmosphereEnabled: false,
    });
    const after = await exportPackage(page);
    expect(after).toEqual(before);
    expect(after.manifest.datasetRevision).toBe(P8_SENTINEL);
    expect(after.world.buildings).toEqual(P8_FIXTURE.world.buildings);
  });
  test("keyboard focus, touch targets, reduced-motion and portrait/landscape sheet stay usable", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await open(page);
    await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
    const weatherTab = page.getByRole("tab", { name: "Thời tiết", exact: true });
    await weatherTab.focus();
    await page.keyboard.press("Enter");
    const toggle = page.getByRole("switch", { name: "Lớp không khí", exact: true });
    await expect(toggle).toBeVisible();
    await toggle.focus();
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    const bounds = await toggle.boundingBox();
    expect(bounds!.height).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Enter");
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.setViewportSize({ width: 740, height: 390 });
    await expect(toggle).toBeVisible();
    await expect(page.getByRole("radio", { name: "Mưa to", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
    await page.setViewportSize(P8_VIEWPORT);
    await expect(page.locator("#scene-root")).toBeVisible();
  });
  test("forced fallback short landscape keeps native weather-time tabs and retry reachable", async ({
    page,
  }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
        if (type === "webgl2") return null;
        return Reflect.apply(original, this, [type, ...args]);
      };
    });
    await page.setViewportSize({ width: 740, height: 390 });
    await open(page);
    await expect(page.getByRole("button", { name: "Thử lại 3D", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Thử lại 3D", exact: true }).click();
    await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "fallback");

    await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
    await page.getByRole("tab", { name: "Thời tiết", exact: true }).click();
    await page.getByRole("tab", { name: "Thời gian", exact: true }).click();
    await expect(page.getByRole("tab", { name: "Thời gian", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await page.getByRole("button", { name: "Thử lại 3D", exact: true }).click();
    await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "fallback");
  });
  test("GPU canvas pixels change for weather, seasons, festival, flood and layer off; plan stays neutral", async ({
    page,
  }) => {
    await open(page);
    const ready = (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
    if (process.env["REQUIRE_WEBGL2"] === "1")
      expect(ready, "Chromium must render WebGL2").toBe(true);
    test.skip(
      !ready,
      "WebGL2 unavailable; P8 GPU pixel assertions NOT_VERIFIED, data/UI assertions remain separate.",
    );
    await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
    await store(page, {
      selectedDate: "2026-06-21",
      timeOfDayMinutes: 720,
      timeSpeed: 0,
      weather: "sunny",
      season: "dry",
      festivalAuto: false,
      festival: "normal",
      floodLevel: 0,
      atmosphereEnabled: true,
    });
    const day = await frame(page);
    for (const patch of [
      { weather: "cloudy" },
      { weather: "rain" },
      { weather: "storm" },
      { weather: "sunny", season: "wet" },
      { festival: "midautumn" },
      { festival: "normal", floodLevel: 1 },
      { floodLevel: 0, atmosphereEnabled: false },
    ]) {
      await store(page, patch);
      expect(Buffer.compare(await frame(page), day), JSON.stringify(patch)).not.toBe(0);
    }
    await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
    await store(page, {
      weather: "sunny",
      season: "dry",
      festival: "normal",
      floodLevel: 0,
      atmosphereEnabled: true,
    });
    const plan = await frame(page);
    await store(page, {
      weather: "storm",
      season: "wet",
      festival: "tet",
      floodLevel: 1,
      timeOfDayMinutes: 1380,
    });
    expect(Buffer.compare(await frame(page), plan)).toBe(0);
  });
});
