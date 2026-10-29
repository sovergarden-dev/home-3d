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
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      true,
    );
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
    const peekHeight = await handle.evaluate(
      (element) => element.parentElement!.getBoundingClientRect().height,
    );
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
    expect(
      await handle.evaluate((element) => element.parentElement!.getBoundingClientRect().height),
    ).toBe(peekHeight);
    await handle.press("Enter");
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    await expect(controls).toBeHidden();
    await handle.press("ArrowDown");
    await expect(controls).toBeVisible();
    await expect(handle).toBeFocused();
    await handle.press("Enter");
    await expect(handle).toHaveAttribute("aria-expanded", "true");
    const motion = await handle.evaluate(async (element) => {
      const sheet = element.parentElement!;
      const before = sheet.getBoundingClientRect().height;
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      return { before, after: sheet.getBoundingClientRect().height };
    });
    expect(motion.after).toBe(motion.before);
    for (const snap of ["half", "full"]) {
      if (snap === "full") await handle.press("ArrowUp");
      const height = await handle.evaluate(
        (element) => element.parentElement!.getBoundingClientRect().height,
      );
      const handleBox = (await handle.boundingBox())!;
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
      await page.mouse.down();
      await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + 45, { steps: 3 });
      await handle.dispatchEvent("pointercancel", {
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        bubbles: true,
      });
      await page.mouse.up();
      expect(
        await handle.evaluate((element) => element.parentElement!.getBoundingClientRect().height),
      ).toBe(height);
      await expect(handle).toBeFocused();
    }
    const fullHeight = await handle.evaluate(
      (element) => element.parentElement!.getBoundingClientRect().height,
    );
    await handle.evaluate((element) => {
      element.addEventListener(
        "pointerdown",
        (event) => {
          element.setAttribute("data-captured-pointer", String((event as PointerEvent).pointerId));
        },
        { once: true },
      );
    });
    const captured = (await handle.boundingBox())!;
    await page.mouse.move(captured.x + captured.width / 2, captured.y + 12);
    await page.mouse.down();
    await page.mouse.move(captured.x + captured.width / 2, captured.y + 45);
    await expect(handle).toHaveAttribute("data-captured-pointer", /^\d+$/);
    expect(
      await handle.evaluate((element) =>
        element.hasPointerCapture(Number(element.getAttribute("data-captured-pointer"))),
      ),
    ).toBe(true);
    await handle.evaluate((element) => {
      element.addEventListener(
        "lostpointercapture",
        () => element.setAttribute("data-loss-delivered", "true"),
        { once: true },
      );
      element.releasePointerCapture(Number(element.getAttribute("data-captured-pointer")));
    });
    await page.mouse.move(captured.x + captured.width / 2 + 1, captured.y + 46);
    await expect(handle).toHaveAttribute("data-loss-delivered", "true");
    expect(
      await handle.evaluate((element) => element.parentElement!.getBoundingClientRect().height),
    ).toBe(fullHeight);
    await page.mouse.up();
    expect(
      await handle.evaluate((element) => element.parentElement!.getBoundingClientRect().height),
    ).toBe(fullHeight);
  });
}

test("native WebGL context loss recovers once and preserves the loaded synthetic package", async ({
  page,
}) => {
  const warnings: string[] = [];
  page.on("console", (message) => {
    if (/too many active webgl|shader error/i.test(message.text())) warnings.push(message.text());
  });
  await page.goto("/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 30000,
  });
  const ready = (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(ready).toBe(true);
  test.skip(!ready, "WebGL2 unavailable");
  const canLose = await page
    .locator("#scene-root canvas")
    .evaluate((canvas: HTMLCanvasElement) =>
      Boolean(canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context")),
    );
  test.skip(!canLose, "Native context-loss extension unavailable");
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-context-loss.json",
    mimeType: "application/json",
    buffer: Buffer.from(P8_PACKAGE_TEXT),
  });
  await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
  const revision = await page.getByTestId("demo-scene").getAttribute("data-world-revision");
  await page.locator("#scene-root canvas").evaluate((canvas: HTMLCanvasElement) => {
    canvas.dataset["lostCanvas"] = "first";
    canvas.getContext("webgl2")!.getExtension("WEBGL_lose_context")!.loseContext();
  });
  await expect(page.locator("#scene-root")).toHaveAttribute("data-recovery-attempts", "1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 30000,
  });
  await expect(page.locator("#scene-root canvas")).toHaveCount(1);
  await expect(page.locator("#scene-root canvas")).not.toHaveAttribute("data-lost-canvas", "first");
  await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-world-revision", revision!);
  await page
    .locator("#scene-root canvas")
    .evaluate((canvas: HTMLCanvasElement) =>
      canvas.getContext("webgl2")!.getExtension("WEBGL_lose_context")!.loseContext(),
    );
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "fallback");
  await expect(page.getByTestId("static-scene")).toBeVisible();
  await page.getByRole("button", { name: "Thử lại 3D", exact: true }).click();
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 30000,
  });
  await expect(page.locator("#scene-root canvas")).toHaveCount(1);
  await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-world-revision", revision!);
  expect(warnings).toEqual([]);
});
