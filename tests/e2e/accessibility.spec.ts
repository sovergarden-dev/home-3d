import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 740, height: 390 },
]) {
  test(`public shell accessibility and keyboard at ${viewport.width}`, async ({ page }) => {
    const external: string[] = [];
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        ["127.0.0.1", "localhost"].includes(url.hostname) ||
        ["blob:", "data:"].includes(url.protocol)
      )
        return route.continue();
      external.push(url.hostname);
      return route.abort();
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator("#scene-root")).toHaveAttribute(
      "data-scene-state",
      /ready|fallback/,
      { timeout: 60000 },
    );
    await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
    await page.addScriptTag({ path: require.resolve("axe-core/axe.min.js") });
    const scans: { scenario: string; violations: unknown[] }[] = [];
    const scan = async (scenario: string) => {
      const violations = await page.evaluate(async () => {
        const axe = (window as unknown as { axe: typeof import("axe-core") }).axe;
        return (
          await axe.run(document, {
            runOnly: {
              type: "tag",
              values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"],
            },
          })
        ).violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.map((n) => ({ target: n.target, summary: n.failureSummary })),
        }));
      });
      scans.push({ scenario, violations });
    };
    await scan("VI initial shell");
    const ready = (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
    if (process.env["REQUIRE_WEBGL2"] === "1") expect(ready).toBe(true);
    if (ready) {
      await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
      await expect(page.getByTestId("plan-scale-ruler")).toBeVisible();
      await scan("VI Plan controls");
      await page.getByRole("radio", { name: "Diorama", exact: true }).click();
    }
    for (const id of ["time", "weather", "festival", "memories"]) {
      await page.locator(`#tab-${id}`).click();
      await scan(`VI ${id} panel`);
    }
    await page.getByRole("radio", { name: "en", exact: true }).click();
    await scan("EN memories panel");
    await page.locator("#tab-time").click();
    await scan("EN time panel");
    await page.getByRole("radio", { name: "vi", exact: true }).click();
    await test.info().attach("accessibility-scans", {
      contentType: "application/json",
      body: JSON.stringify({ viewport, ready, scans }),
    });
    expect(scans.filter((scan) => scan.violations.length)).toEqual([]);
    const sound = page.getByRole("button", { name: "Tiếng phố", exact: true });
    await sound.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(sound).toBeFocused();
    expect(await page.locator(":focus").evaluate((node) => node.matches(":focus-visible"))).toBe(
      true,
    );
    await expect(page.getByRole("button", { name: "Tiếng phố", exact: true })).toHaveAttribute(
      "aria-describedby",
      "sound-demo-description",
    );
    expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(
      true,
    );
    expect(
      await page.evaluate(async () =>
        "serviceWorker" in navigator
          ? (await navigator.serviceWorker.getRegistrations()).length
          : 0,
      ),
    ).toBe(0);
    expect(external).toEqual([]);
  });
}
