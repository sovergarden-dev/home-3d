import { expect, test, type Page } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

async function openHome(page: Page, forceFallback = false) {
  if (forceFallback) {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
        if (type === "webgl2") return null;
        return Reflect.apply(original, this, [type, ...args]);
      } as typeof original;
    });
  }
  await page.goto("/");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 60000,
  });
}

test("fixed-home shell exposes only the supported controls and build identity", async ({
  page,
}) => {
  const externalRequests: string[] = [];
  page.on("request", (request) => {
    if (!new URL(request.url()).hostname.match(/^(127\.0\.0\.1|localhost)$/))
      externalRequests.push(request.url());
  });
  await openHome(page);

  await expect(
    page.locator(".h6-top-info").getByText("Nhà của tôi · đang xây để cho thuê", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("radiogroup", { name: "Thời gian" }).getByRole("radio")).toHaveCount(
    3,
  );
  await expect(page.getByRole("radiogroup", { name: "Thời tiết" }).getByRole("radio")).toHaveCount(
    3,
  );
  for (const label of ["Sáng", "Chiều", "Tối", "Nắng", "Mây", "Mưa"])
    await expect(page.getByRole("radio", { name: label, exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Diorama", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Mặt bằng", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Giới thiệu", exact: true })).toBeVisible();
  await expect(page.getByLabel("Mở gói world")).toHaveCount(0);
  await expect(page.getByRole("tab")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Thời tiết thật" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /kỷ niệm|capture|giữ khoảnh khắc/i })).toHaveCount(
    0,
  );
  expect(externalRequests).toEqual([]);
});

test("time, weather, camera and language controls update the fixed-home view", async ({ page }) => {
  await openHome(page);
  await page.getByRole("radio", { name: "Tối", exact: true }).click();
  await page.getByRole("radio", { name: "Mưa", exact: true }).click();
  await expect(page.locator(".h6-top-info")).toContainText("Tối");
  await expect(page.locator(".h6-top-info")).toContainText("Mưa");

  const state = await page.locator("#scene-root").getAttribute("data-scene-state");
  if (state === "ready") {
    await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
    await expect(page.locator("main")).toHaveAttribute("data-view-mode", "topdown");
    await page.getByRole("radio", { name: "Diorama", exact: true }).click();
    await expect(page.locator("main")).toHaveAttribute("data-view-mode", "diorama");
  } else {
    await expect(page.getByRole("radio", { name: "Mặt bằng", exact: true })).toBeDisabled();
  }

  await page.getByRole("radio", { name: "en", exact: true }).click();
  await expect(
    page
      .locator(".h6-top-info")
      .getByText("My house · under construction for rent", { exact: true }),
  ).toBeVisible();
  await expect(page).toHaveTitle(/My house · under construction for rent/i);
  await expect(page.getByRole("radio", { name: "Evening", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Rain", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await page.getByRole("radio", { name: "vi", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  await expect(page).toHaveTitle(/Nhà của tôi · đang xây để cho thuê/i);
});

test("the legacy preview query cannot enable a package loader", async ({ page }) => {
  await page.goto("/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 60000,
  });
  await expect(page.getByLabel("Mở gói world")).toHaveCount(0);
  await expect(
    page.locator(".h6-top-info").getByText("Nhà của tôi · đang xây để cho thuê", { exact: true }),
  ).toBeVisible();
});

test("WebGL fallback keeps the fixed controls reachable without claiming a rendered scene", async ({
  page,
}) => {
  await openHome(page, true);
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "fallback");
  await expect(page.getByTestId("static-scene")).toBeVisible();
  await expect(page.getByTestId("build-info")).toBeVisible();
  await expect(page.getByRole("button", { name: "Thử lại 3D", exact: true })).toBeVisible();
  await expect(page.getByRole("radio", { name: "Mưa", exact: true })).toBeVisible();
  await expect(page.getByLabel("Mở gói world")).toHaveCount(0);
});

test("portrait and short-landscape layouts keep all overlays in bounds and non-overlapping", async ({
  page,
}) => {
  const overlaps = (
    a: { left: number; top: number; right: number; bottom: number },
    b: { left: number; top: number; right: number; bottom: number },
  ) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 740, height: 390 },
    { width: 568, height: 320 },
  ]) {
    await page.setViewportSize(viewport);
    await openHome(page);
    const state = await page.locator("#scene-root").getAttribute("data-scene-state");
    if (state === "ready") {
      await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
    }
    const result = await page.evaluate(() => {
      const rect = (selector: string) => {
        const node = document.querySelector<HTMLElement>(selector);
        if (!node) return null;
        const box = node.getBoundingClientRect();
        return { left: box.left, top: box.top, right: box.right, bottom: box.bottom };
      };
      return {
        viewport: { width: innerWidth, height: innerHeight },
        info: rect(".h6-top-info")!,
        actions: rect(".h6-top-actions")!,
        mapControls: rect(".h6-map-controls")!,
        viewActions: rect(".h6-view-actions")!,
        dock: rect("[role='region']")!,
        scaleBar: rect("[data-testid='plan-scale-bar']"),
        attribution: rect(".h6-top-info a[href='https://www.openstreetmap.org/copyright']")!,
        attributionClipped: (() => {
          const link = document.querySelector<HTMLElement>(
            ".h6-top-info a[href='https://www.openstreetmap.org/copyright']",
          )!;
          return link.scrollWidth > link.clientWidth;
        })(),
        documentWidth: document.documentElement.scrollWidth,
      };
    });
    expect(result.info.left).toBeGreaterThanOrEqual(0);
    expect(result.actions.right).toBeLessThanOrEqual(result.viewport.width);
    expect(result.info.right).toBeLessThanOrEqual(result.actions.left);
    expect(result.dock.left).toBeGreaterThanOrEqual(0);
    expect(result.dock.right).toBeLessThanOrEqual(result.viewport.width);
    expect(result.dock.bottom).toBeLessThanOrEqual(result.viewport.height);
    expect(result.documentWidth).toBe(result.viewport.width);
    // The OSM attribution must stay fully visible: inside the viewport, inside its card and
    // not clipped by its own box.
    expect(result.attributionClipped).toBe(false);
    expect(result.attribution.left).toBeGreaterThanOrEqual(0);
    expect(result.attribution.top).toBeGreaterThanOrEqual(0);
    expect(result.attribution.right).toBeLessThanOrEqual(result.viewport.width);
    expect(result.attribution.bottom).toBeLessThanOrEqual(result.viewport.height);
    expect(result.attribution.left).toBeGreaterThanOrEqual(result.info.left);
    expect(result.attribution.right).toBeLessThanOrEqual(result.info.right);
    expect(result.attribution.bottom).toBeLessThanOrEqual(result.info.bottom);
    expect(overlaps(result.info, result.dock)).toBe(false);
    expect(overlaps(result.mapControls, result.dock)).toBe(false);
    expect(overlaps(result.mapControls, result.actions)).toBe(false);
    if (viewport.height <= 480) {
      expect(result.viewActions.right - result.viewActions.left).toBeLessThanOrEqual(112);
    }
    if (result.scaleBar) {
      expect(overlaps(result.scaleBar, result.info)).toBe(false);
      expect(overlaps(result.scaleBar, result.dock)).toBe(false);
      expect(overlaps(result.scaleBar, result.mapControls)).toBe(false);
    }
  }
});

test("Plan can pan, then home reset returns to the home-centred Diorama", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openHome(page);
  const state = await page.locator("#scene-root").getAttribute("data-scene-state");
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(state).toBe("ready");
  test.skip(state !== "ready", "WebGL2 unavailable; camera reset rendering NOT_VERIFIED.");

  const scene = page.getByTestId("demo-scene");
  await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
  const canvas = page.locator("#scene-root canvas");
  await canvas.focus();
  await page.keyboard.press("ArrowRight");
  await expect(scene).toHaveAttribute("data-plan-pan-revision", /[1-9]/);
  await page.getByRole("button", { name: "Về nhà mình", exact: true }).click();
  await expect(page.locator("main")).toHaveAttribute("data-view-mode", "diorama");
  await expect(scene).toHaveAttribute("data-camera-type", "PerspectiveCamera");
});

test("owner-provided OSM neighborhood renders and survives a route remount", async ({ page }) => {
  await openHome(page);
  const state = await page.locator("#scene-root").getAttribute("data-scene-state");
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(state).toBe("ready");
  test.skip(state !== "ready", "WebGL2 unavailable; rendered-world lifecycle NOT_VERIFIED.");

  const scene = page.getByTestId("demo-scene");
  await expect(page.locator("#scene-root canvas")).toHaveCount(1);
  await expect(scene).toHaveAttribute("data-world-mode", "home");
  await expect(scene).toHaveAttribute("data-world-buildings", "317");
  await expect(scene).toHaveAttribute("data-world-roads", "138");
  await expect(scene).toHaveAttribute("data-verification-status", "REAL_WORLD_NOT_VERIFIED");
  await expect(scene).toHaveAttribute("data-active-worlds", "1");
  await expect(scene).toHaveAttribute("data-illustrative-details", "true");
  await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
  await expect(scene).toHaveAttribute("data-camera-type", "OrthographicCamera");
  await expect(scene).toHaveAttribute("data-illustrative-details", "false");
  await page.getByRole("radio", { name: "Diorama", exact: true }).click();
  await expect(scene).toHaveAttribute("data-camera-type", "PerspectiveCamera");
  await expect(scene).toHaveAttribute("data-illustrative-details", "true");

  await page.getByRole("link", { name: "Giới thiệu", exact: true }).click();
  await expect(page).toHaveURL(/\/gioi-thieu$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.locator("main")).not.toContainText(/Trung Thu|xe ôm|tiếng rao/i);
  await page.getByRole("link", { name: "Về phố", exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready");
  await expect(page.locator("#scene-root canvas")).toHaveCount(1);

  await page.keyboard.press("2");
  await expect(scene).toHaveAttribute("data-time-minutes", "930");
  await page.keyboard.press("e");
  await expect(scene).toHaveAttribute("data-weather", "storm");
  await page.keyboard.press("m");
  await expect(page.locator("main")).toHaveAttribute("data-view-mode", "topdown");
  await page.keyboard.press("h");
  await expect(page.locator("main")).toHaveAttribute("data-view-mode", "diorama");
});
