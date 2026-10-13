import { test, expect, type Page } from "@playwright/test";
async function openDemo(page: Page) {
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 30000,
  });
  return (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
}
test("demo labels, privacy, noindex and graceful 3D capability branch", async ({ page }) => {
  const privateCalls: string[] = [];
  page.on("request", (request) => {
    if (/maps\.(google|app)|streetview|open-meteo/i.test(request.url()))
      privateCalls.push(request.url());
  });
  const ready = await openDemo(page);
  await expect(page.getByText("DEMO · Phố hư cấu", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeDisabled();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  if (ready) await expect(page.locator("#scene-root canvas")).toBeVisible();
  else await expect(page.getByText("Thiết bị chưa mở được 3D")).toBeVisible();
  expect(privateCalls).toEqual([]);
});
test("time, weather, festivals, camera, capture and clear work in a rendered scene", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ready = await openDemo(page);
  test.skip(!ready, "No WebGL2: fallback branch is covered separately, not a GPU pass.");
  await page.getByRole("button", { name: /12:00.*Trưa/ }).click();
  await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-night", "false");
  const daytime = await page.locator("#scene-root canvas").screenshot();
  await page.getByRole("button", { name: /19:30.*Chợ đêm/ }).click();
  await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-night", "true");
  const nighttime = await page.locator("#scene-root canvas").screenshot();
  expect(Buffer.compare(daytime, nighttime)).not.toBe(0);
  await page.getByRole("tab", { name: "Thời tiết", exact: true }).click();
  await page.getByRole("radio", { name: "Mưa", exact: true }).click();
  await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-weather", "rain");
  await page.getByRole("tab", { name: "Lễ hội", exact: true }).click();
  await page.getByRole("radio", { name: "Trung Thu", exact: true }).click();
  await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-festival", "midautumn");
  await page.getByRole("button", { name: "Phóng to", exact: true }).click();
  await page.getByRole("button", { name: "Về nhà mình", exact: true }).click();
  await page.getByRole("button", { name: "Giữ khoảnh khắc", exact: true }).click();
  await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
  await expect(page.getByRole("img", { name: /Giữ khoảnh khắc/ })).toBeVisible();
  const href = await page.locator("a[download]").getAttribute("href");
  expect(href).toMatch(/^data:image\/png;base64,/);
  await page.getByRole("button", { name: "Xoá ảnh trong phiên" }).click();
  await expect(page.getByText("Chưa có kỷ niệm nào")).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile controls hide immediately during drag and return at peek", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const ready = await openDemo(page);
  test.skip(!ready, "Fallback does not have active map controls.");
  const controls = page.getByRole("button", { name: "Phóng to", exact: true });
  const handle = page.getByRole("button", { name: "Kéo để mở rộng bảng điều khiển" });
  await expect(controls).toBeVisible();
  const bounds = await handle.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 12);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y - 260, { steps: 8 });
  await expect(controls).toBeHidden();
  await page.mouse.up();
  await expect(controls).toBeHidden();
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(controls).toBeVisible();
  await page.getByRole("radio", { name: "en", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Time", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
test("WebGL unavailable cannot trap the user behind loading or claim capture success", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === "webgl2") return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await openDemo(page);
  await expect(page.getByText("Thiết bị chưa mở được 3D")).toBeVisible();
  await expect(page.getByRole("button", { name: "Giữ khoảnh khắc" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Thử lại 3D" })).toBeVisible();
});
test("route roundtrip recreates exactly one canvas and context loss has a recovery UI", async ({
  page,
}) => {
  const ready = await openDemo(page);
  test.skip(!ready, "GPU lifecycle is not tested when WebGL2 is absent.");
  await page.getByRole("link", { name: "Giới thiệu", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Về Phố Nhà Mình" })).toBeVisible();
  await page.getByRole("link", { name: "Về phố", exact: true }).click();
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready");
  await expect(page.locator("#scene-root canvas")).toHaveCount(1);
  await page.locator("#scene-root canvas").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await expect(page.getByText("Thiết bị chưa mở được 3D")).toBeVisible();
  await page.getByRole("button", { name: "Thử lại 3D" }).click();
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready");
  await expect(page.locator("#scene-root canvas")).toHaveCount(1);
});
