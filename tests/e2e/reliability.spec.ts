import { expect, test } from "@playwright/test";
import { P8_PACKAGE_TEXT } from "./helpers/p8-fixture";

test.beforeEach(async ({ context }) => {
  await context.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
});

test("no WebGL2 keeps a static fictional illustration even after opening a synthetic local package", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      return type === "webgl2" ? null : Reflect.apply(original, this, [type, ...args]);
    };
  });
  await page.goto("/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "fallback", {
    timeout: 30000,
  });
  const image = page.getByTestId("static-scene");
  await expect(image).toBeVisible();
  await expect(image).toHaveAccessibleName(/Minh hoạ phố hư cấu/);
  const before = await image.evaluate((element) => element.outerHTML);
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-recovery.json",
    mimeType: "application/json",
    buffer: Buffer.from(P8_PACKAGE_TEXT),
  });
  await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
  expect(await image.evaluate((element) => element.outerHTML)).toBe(before);
  await page.getByRole("button", { name: "Thử lại 3D", exact: true }).click();
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "fallback");
  await expect(page.locator("#scene-root canvas")).toHaveCount(0);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 740, height: 390 },
]) {
  test(`sheet hides controls during drag, restores on cancel, and supports keyboard at ${viewport.width}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto("/?local-preview=1");
    await expect(page.locator("#scene-root")).toHaveAttribute(
      "data-scene-state",
      /ready|fallback/,
      { timeout: 30000 },
    );
    await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
    const handle = page.getByRole("button", {
      name: "Kéo để mở rộng bảng điều khiển",
      exact: true,
    });
    const controls = page.locator(".h6-map-controls-anchor");
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await expect(controls).toBeVisible();
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y - 70, { steps: 5 });
    await expect(handle).toBeFocused();
    await expect(controls).toBeHidden();
    await handle.dispatchEvent("pointercancel", {
      pointerId: 1,
      pointerType: "mouse",
      isPrimary: true,
      bubbles: true,
    });
    await expect(controls).toBeVisible();
    await page.mouse.up();
    await expect(handle).toHaveAttribute("aria-expanded", "false");
    await handle.press("Enter");
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    await expect(controls).toBeHidden();
    await handle.press("ArrowDown");
    await expect(controls).toBeVisible();
    await expect(handle).toBeFocused();
    expect(
      await handle.evaluate(
        (element) => getComputedStyle(element.parentElement!).transitionDuration,
      ),
    ).toBe("0s");
  });
}
