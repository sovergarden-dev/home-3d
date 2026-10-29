import { expect, test } from "@playwright/test";

test("illustrative details toggle without changing the synthetic world or leaking meshes", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 60000,
  });
  const ready = (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(ready).toBe(true);
  test.skip(!ready, "This browser has no WebGL2; illustrative geometry cannot be rendered.");
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await page.locator("#tab-time").click();
  const scene = page.getByTestId("demo-scene");
  const revision = await scene.getAttribute("data-world-revision");
  const control = page.getByRole("switch", { name: "Chi tiết minh hoạ", exact: true });
  await expect(control).toHaveAttribute("aria-checked", "false");
  const counts: number[] = [];
  for (let cycle = 0; cycle < 3; cycle++) {
    await control.click();
    await expect(control).toHaveAttribute("aria-checked", "true");
    await expect(scene).toHaveAttribute("data-illustrative-details", "true");
    await expect
      .poll(async () => Number(await scene.getAttribute("data-illustrative-instances")))
      .toBeGreaterThan(0);
    expect(Number(await scene.getAttribute("data-illustrative-instances"))).toBeLessThanOrEqual(
      3600,
    );
    counts.push(Number(await scene.getAttribute("data-memory-geometries")));
    await expect(scene).toHaveAttribute("data-world-revision", revision!);
    await expect(page.locator("#scene-root canvas")).toHaveCount(1);
    await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
    await expect(scene).toHaveAttribute("data-illustrative-details", "false");
    await expect(scene).toHaveAttribute("data-illustrative-instances", "0");
    await page.getByRole("radio", { name: "Diorama", exact: true }).click();
    await expect(scene).toHaveAttribute("data-illustrative-details", "true");
    await control.click();
    await expect(scene).toHaveAttribute("data-illustrative-details", "false");
  }
  expect(new Set(counts).size).toBe(1);
  await test.info().attach("detail-resources", {
    contentType: "application/json",
    body: JSON.stringify({ syntheticOnly: true, geometryCounts: counts, cycles: 3 }),
  });
});
