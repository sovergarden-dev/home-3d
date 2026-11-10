import { expect, test } from "@playwright/test";

async function openRenderedHome(page: Parameters<Parameters<typeof test>[1]>[0]["page"]) {
  await page.goto("/");
  const root = page.locator("#scene-root");
  await expect(root).toHaveAttribute("data-scene-state", /ready|fallback/, { timeout: 60000 });
  const ready = (await root.getAttribute("data-scene-state")) === "ready";
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(ready).toBe(true);
  test.skip(!ready, "WebGL2 unavailable; rendered-scene recovery NOT_VERIFIED.");
  await expect(root.locator("canvas")).toHaveCount(1);
  return root;
}

async function loseContext(canvas: import("@playwright/test").Locator) {
  return canvas.evaluate((element: HTMLCanvasElement) => {
    const extension = element.getContext("webgl2")?.getExtension("WEBGL_lose_context");
    if (!extension) return false;
    extension.loseContext();
    return true;
  });
}

test("first context loss recovers once; second falls back until manual retry", async ({ page }) => {
  const root = await openRenderedHome(page);
  const firstCanvas = root.locator("canvas");
  await expect(firstCanvas).toHaveCount(1);
  await firstCanvas.evaluate((element: HTMLCanvasElement) => {
    element.setAttribute("data-recovery-test-identity", "before-first-loss");
  });
  const canLose = await firstCanvas.evaluate((element: HTMLCanvasElement) =>
    Boolean(element.getContext("webgl2")?.getExtension("WEBGL_lose_context")),
  );
  test.skip(!canLose, "WEBGL_lose_context unavailable; context lifecycle NOT_VERIFIED.");

  expect(await loseContext(firstCanvas)).toBe(true);
  await expect(root).toHaveAttribute("data-recovery-attempts", "1");
  await expect(root).toHaveAttribute("data-scene-state", "ready", { timeout: 60000 });
  const recoveredCanvas = root.locator("canvas");
  await expect(recoveredCanvas).toHaveCount(1);
  await expect(recoveredCanvas).not.toHaveAttribute(
    "data-recovery-test-identity",
    "before-first-loss",
  );
  await expect(page.getByTestId("static-scene")).toHaveCount(0);

  expect(await loseContext(recoveredCanvas)).toBe(true);
  await expect(root).toHaveAttribute("data-scene-state", "fallback");
  await expect(page.getByTestId("static-scene")).toBeVisible();
  await expect(root.locator("canvas")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Thử lại 3D", exact: true })).toBeEnabled();

  await page.getByRole("button", { name: "Thử lại 3D", exact: true }).click();
  await expect(root).toHaveAttribute("data-scene-state", "ready", { timeout: 60000 });
  await expect(root.locator("canvas")).toHaveCount(1);
  await expect(page.getByTestId("static-scene")).toHaveCount(0);
});
