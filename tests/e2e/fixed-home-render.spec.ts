import { expect, test } from "@playwright/test";

async function renderedPixelEvidence(page: import("@playwright/test").Page, image: Buffer) {
  return page.evaluate(async (encoded) => {
    const bitmap = new Image();
    bitmap.src = `data:image/png;base64,${encoded}`;
    await bitmap.decode();
    const sample = document.createElement("canvas");
    sample.width = bitmap.naturalWidth;
    sample.height = bitmap.naturalHeight;
    const context = sample.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("PIXEL_SAMPLE_CONTEXT_UNAVAILABLE");
    context.drawImage(bitmap, 0, 0);
    const { data } = context.getImageData(0, 0, sample.width, sample.height);
    const colors = new Set<string>();
    let nonBackground = 0;
    for (let y = 0; y < sample.height; y += 6) {
      for (let x = 0; x < sample.width; x += 6) {
        const offset = (y * sample.width + x) * 4;
        const red = data[offset] ?? 0;
        const green = data[offset + 1] ?? 0;
        const blue = data[offset + 2] ?? 0;
        colors.add(`${red >> 4}:${green >> 4}:${blue >> 4}`);
        if (Math.max(red, green, blue) - Math.min(red, green, blue) > 18) nonBackground++;
      }
    }
    return { width: sample.width, height: sample.height, colorBins: colors.size, nonBackground };
  }, image.toString("base64"));
}

test("fixed synthetic neighborhood produces nonblank rendered scene pixels", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  const root = page.locator("#scene-root");
  await expect(root).toHaveAttribute("data-scene-state", /ready|fallback/, { timeout: 60000 });
  const state = await root.getAttribute("data-scene-state");
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(state).toBe("ready");
  test.skip(state !== "ready", "WebGL2 unavailable; rendered pixels NOT_VERIFIED.");

  const canvas = root.locator("canvas");
  await expect(canvas).toHaveCount(1);
  const evidence = await renderedPixelEvidence(page, await canvas.screenshot());
  console.info("FIXED_HOME_PIXEL_EVIDENCE", JSON.stringify(evidence));
  await test.info().attach("fixed-home-rendered-pixels", {
    contentType: "application/json",
    body: JSON.stringify(evidence),
  });
  expect(evidence.width).toBeGreaterThan(0);
  expect(evidence.height).toBeGreaterThan(0);
  expect(evidence.colorBins).toBeGreaterThan(24);
  expect(evidence.nonBackground).toBeGreaterThan(100);
  await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-world-mode", "fixture");
  await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-active-worlds", "1");
});
