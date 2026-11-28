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

test("owner-provided OSM neighborhood stays immutable across views and illustration resources remain stable", async ({
  page,
}) => {
  const { root, scene } = await waitForRenderedHome(page);
  const canvas = root.locator("canvas");
  await expect(canvas).toHaveCount(1);
  await expect(scene).toHaveAttribute("data-world-mode", "home");
  await expect(scene).toHaveAttribute("data-world-buildings", "339");
  await expect(scene).toHaveAttribute("data-world-roads", "138");
  await expect(scene).toHaveAttribute("data-verification-status", "REAL_WORLD_NOT_VERIFIED");
  await expect(scene).toHaveAttribute("data-active-worlds", "1");
  await expect(scene).toHaveAttribute("data-illustrative-details", "true");
  await expect(scene).toHaveAttribute("data-illustrative-instances", /^[1-9]\d*$/);
  await expect(scene).toHaveAttribute("data-labels-visible", "false");
  await expect(scene).toHaveAttribute("data-surroundings-tier", /^(low|mid)$/);
  await expect(scene).toHaveAttribute("data-surroundings-trees", /^[1-9]\d*$/);
  await expect(scene).toHaveAttribute("data-surroundings-props", /^[1-9]\d*$/);
  await expect(scene).toHaveAttribute("data-massing-count", "322");
  await expect(scene).toHaveAttribute("data-massing-origin", "estimated_procedural");
  await expect(scene).toHaveAttribute("data-massing-balconies", "58");
  await expect(scene).toHaveAttribute("data-massing-shops", "15");
  await expect(scene).toHaveAttribute("data-street-style-classes", "5");
  await expect(scene).toHaveAttribute("data-street-trim-meshes", "1");
  await expect(scene).toHaveAttribute("data-shadow-frustum-half-size", /^[2-9]\d\d$/);
  await expect(scene).toHaveAttribute("data-props-visible", "true");
  const initialDrawCalls = Number(await scene.getAttribute("data-draw-calls"));
  expect(Number.isFinite(initialDrawCalls)).toBe(true);
  expect(initialDrawCalls).toBeLessThanOrEqual(200);
  const revision = await scene.getAttribute("data-world-revision");
  const resourceCounts: string[] = [];

  for (let cycle = 0; cycle < 3; cycle++) {
    await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
    await expect(page.locator("main")).toHaveAttribute("data-view-mode", "topdown");
    await expect(scene).toHaveAttribute("data-camera-type", "OrthographicCamera");
    await expect(scene).toHaveAttribute("data-illustrative-details", "false");
    await expect(scene).toHaveAttribute("data-illustrative-instances", "0");
    await expect(scene).toHaveAttribute("data-labels-visible", "true");
    await expect(scene).toHaveAttribute("data-props-visible", "false");
    await expect(scene).toHaveAttribute("data-world-revision", revision!);
    await expect(scene).toHaveAttribute("data-active-worlds", "1");
    await expect(canvas).toHaveCount(1);

    await page.getByRole("radio", { name: "Diorama", exact: true }).click();
    await expect(page.locator("main")).toHaveAttribute("data-view-mode", "diorama");
    await expect(scene).toHaveAttribute("data-camera-type", "PerspectiveCamera");
    await expect(scene).toHaveAttribute("data-illustrative-details", "true");
    await expect(scene).toHaveAttribute("data-illustrative-instances", /^[1-9]\d*$/);
    await expect(scene).toHaveAttribute("data-props-visible", "true");
    await expect(scene).toHaveAttribute("data-world-revision", revision!);
    await expect(scene).toHaveAttribute("data-active-worlds", "1");
    await expect(canvas).toHaveCount(1);
    resourceCounts.push((await scene.getAttribute("data-memory-geometries")) ?? "missing");
  }

  await test.info().attach("fixed-home-resource-counts", {
    contentType: "application/json",
    body: JSON.stringify({
      syntheticOnly: false,
      source: "osm",
      worldRevision: revision,
      resourceCounts,
    }),
  });
  expect(resourceCounts.every((count) => /^\d+$/.test(count))).toBe(true);
  expect(new Set(resourceCounts).size).toBe(1);
});

test("detail tiers, street life toggle, and live reduced-motion stay within budget without geometry leaks", async ({
  page,
}) => {
  const { scene } = await waitForRenderedHome(page);
  const baselineMidGeometries = await scene.getAttribute("data-memory-geometries");
  expect(baselineMidGeometries).toMatch(/^\d+$/);

  const densityToggle = page.getByTestId("density-tier-cycle");
  const lifeToggle = page.getByTestId("life-quick-toggle");

  await densityToggle.click();
  await expect(scene).toHaveAttribute("data-detail-tier", "high");
  await expect(scene).toHaveAttribute("data-surroundings-tier", "high");
  await expect(scene).toHaveAttribute("data-surroundings-trees", "271");
  await expect(scene).toHaveAttribute("data-surroundings-props", "369");
  // Software WebGL (SwiftShader < 24 FPS) legitimately triggers P9's automatic FPS tier step-down.
  await expect(scene).toHaveAttribute("data-life-tier", /^(low|mid|high)$/);
  const highDrawCalls = Number(await scene.getAttribute("data-draw-calls"));
  expect(Number.isFinite(highDrawCalls)).toBe(true);
  expect(highDrawCalls).toBeLessThanOrEqual(200);

  await densityToggle.click();
  await expect(scene).toHaveAttribute("data-detail-tier", "low");
  await expect(scene).toHaveAttribute("data-surroundings-tier", "low");
  await expect(scene).toHaveAttribute("data-surroundings-trees", "150");
  await expect(scene).toHaveAttribute("data-surroundings-props", "80");

  await densityToggle.click();
  await expect(scene).toHaveAttribute("data-detail-tier", "mid");
  await expect(scene).toHaveAttribute("data-surroundings-tier", "mid");
  await expect(scene).toHaveAttribute("data-memory-geometries", baselineMidGeometries!);

  await lifeToggle.click();
  await expect(scene).toHaveAttribute("data-life-visible", "false");
  await lifeToggle.click();
  await expect(scene).toHaveAttribute("data-life-visible", "true");

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(scene).toHaveAttribute("data-reduced-motion", "true");
  const pausedClock = await scene.getAttribute("data-life-clock");
  await page.waitForTimeout(350);
  await expect(scene).toHaveAttribute("data-life-clock", pausedClock!);
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.getByRole("radio", { name: "Chiều", exact: true }).click();
  await expect(scene).toHaveAttribute("data-reduced-motion", "false");
});

test("cold start under prefers-reduced-motion keeps street presence stationary", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const { scene } = await waitForRenderedHome(page);
  await expect(scene).toHaveAttribute("data-reduced-motion", "true");
  await expect(scene).toHaveAttribute("data-life-agents", /^[1-9]\d*$/);
  await expect(scene).toHaveAttribute("data-life-clock", "0");
  await page.waitForTimeout(350);
  await expect(scene).toHaveAttribute("data-life-clock", "0");
});
