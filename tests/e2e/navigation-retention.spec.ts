import { expect, test, type Page } from "@playwright/test";

/** three.js canvases that left the document but are still reachable after a full GC. */
async function detachedSceneCanvases(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("HeapProfiler.collectGarbage");
    const { result: prototype } = await cdp.send("Runtime.evaluate", {
      expression: "HTMLCanvasElement.prototype",
    });
    const { objects } = await cdp.send("Runtime.queryObjects", {
      prototypeObjectId: prototype.objectId!,
    });
    const { result } = await cdp.send("Runtime.callFunctionOn", {
      objectId: objects.objectId!,
      functionDeclaration:
        "function () { return this.filter((canvas) => canvas.dataset.engine && !canvas.isConnected).length; }",
      returnByValue: true,
    });
    return result.value as number;
  } finally {
    await cdp.detach();
  }
}

test("SPA navigation releases every torn-down 3D scene", async ({ page, browserName }) => {
  test.skip(browserName !== "chromium", "Heap queries need the Chrome DevTools Protocol.");
  const root = page.locator("#scene-root");
  const settled = () =>
    expect(root).toHaveAttribute("data-scene-state", /ready|fallback/, { timeout: 60000 });
  await page.goto("/");
  await settled();
  const ready = (await root.getAttribute("data-scene-state")) === "ready";
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(ready).toBe(true);
  test.skip(!ready, "This browser has no WebGL2; there is no 3D scene to tear down.");
  const navigations = 4;
  for (let index = 0; index < navigations; index++) {
    await page.getByRole("link", { name: "Giới thiệu", exact: true }).click();
    await expect(page).toHaveURL(/\/gioi-thieu$/);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.getByTestId("about-back-home").click();
    await expect(page).toHaveURL(/\/$/);
    await settled();
  }
  // A scene that stays reachable keeps its canvas and WebGL context alive: one per navigation.
  expect(await detachedSceneCanvases(page)).toBe(0);
});
