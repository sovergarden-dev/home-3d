import { expect, test } from "@playwright/test";

async function waitForRenderedHome(page: import("@playwright/test").Page) {
  await page.goto("/");
  const root = page.locator("#scene-root");
  await expect(root).toHaveAttribute("data-scene-state", /ready|fallback/, { timeout: 60000 });
  const ready = (await root.getAttribute("data-scene-state")) === "ready";
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(ready).toBe(true);
  test.skip(!ready, "WebGL2 unavailable; world geometry lifecycle NOT_VERIFIED.");
  return { root, scene: page.getByTestId("demo-scene") };
}

test("fixed world stays immutable across views and illustration resources remain stable", async ({
  page,
}) => {
  const { root, scene } = await waitForRenderedHome(page);
  const canvas = root.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await expect(scene).toHaveAttribute("data-world-mode", "fixture");
  await expect(scene).toHaveAttribute("data-active-worlds", "1");
  await expect(scene).toHaveAttribute("data-illustrative-details", "true");
  await expect(scene).toHaveAttribute("data-illustrative-instances", /^[1-9]\d*$/);
  const revision = await scene.getAttribute("data-world-revision");
  const resourceCounts: string[] = [];

  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
    await expect(page.locator("main")).toHaveAttribute("data-view-mode", "topdown");
    await expect(scene).toHaveAttribute("data-camera-type", "OrthographicCamera");
    await expect(scene).toHaveAttribute("data-illustrative-details", "false");
    await expect(scene).toHaveAttribute("data-illustrative-instances", "0");
    await expect(scene).toHaveAttribute("data-world-revision", revision!);
    await expect(scene).toHaveAttribute("data-active-worlds", "1");
    await expect(canvas).toHaveCount(1);

    await page.getByRole("radio", { name: "Diorama", exact: true }).click();
    await expect(page.locator("main")).toHaveAttribute("data-view-mode", "diorama");
    await expect(scene).toHaveAttribute("data-camera-type", "PerspectiveCamera");
    await expect(scene).toHaveAttribute("data-illustrative-details", "true");
    await expect(scene).toHaveAttribute("data-illustrative-instances", /^[1-9]\d*$/);
    await expect(scene).toHaveAttribute("data-world-revision", revision!);
    await expect(scene).toHaveAttribute("data-active-worlds", "1");
    await expect(canvas).toHaveCount(1);
    resourceCounts.push((await scene.getAttribute("data-memory-geometries")) ?? "missing");
  }

  await test.info().attach("fixed-home-resource-counts", {
    contentType: "application/json",
    body: JSON.stringify({ syntheticOnly: true, worldRevision: revision, resourceCounts }),
  });
  expect(resourceCounts.every((count) => /^\d+$/.test(count))).toBe(true);
  expect(new Set(resourceCounts).size).toBe(1);
});
