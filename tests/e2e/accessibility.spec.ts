import { expect, test } from "@playwright/test";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 740, height: 390 },
]) {
  test(`fixed-home shell accessibility and keyboard focus at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    const externalRequests: string[] = [];
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (
        ["127.0.0.1", "localhost"].includes(url.hostname) ||
        ["blob:", "data:"].includes(url.protocol)
      )
        return route.continue();
      externalRequests.push(url.hostname);
      return route.abort();
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.setViewportSize(viewport);
    await page.goto("/");
    await expect(page.locator("#scene-root")).toHaveAttribute(
      "data-scene-state",
      /ready|fallback/,
      {
        timeout: 60000,
      },
    );
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
        ).violations.map((violation) => ({
          id: violation.id,
          impact: violation.impact,
          nodes: violation.nodes.map((node) => ({
            target: node.target,
            summary: node.failureSummary,
          })),
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
    await page.getByRole("radio", { name: "Tối", exact: true }).click();
    await page.getByRole("radio", { name: "Mưa", exact: true }).click();
    await scan("VI evening rain presets");
    await page.getByRole("radio", { name: "en", exact: true }).click();
    await scan("EN evening rain presets");
    await test.info().attach("fixed-home-accessibility", {
      contentType: "application/json",
      body: JSON.stringify({ viewport, ready, scans }),
    });
    expect(scans.filter((scan) => scan.violations.length)).toEqual([]);
    expect(externalRequests).toEqual([]);

    const languageControl = page.getByRole("radio", { name: "en", exact: true });
    await languageControl.focus();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await expect(languageControl).toBeFocused();
    expect(await page.locator(":focus").evaluate((node) => node.matches(":focus-visible"))).toBe(
      true,
    );
    await expect(page.getByRole("radiogroup", { name: "Time" }).getByRole("radio")).toHaveCount(3);
    await expect(page.getByRole("radiogroup", { name: "Weather" }).getByRole("radio")).toHaveCount(
      3,
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
  });
}

test("keyboard preset selection remains usable when WebGL2 is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      return type === "webgl2" ? null : Reflect.apply(original, this, [type, ...args]);
    };
  });
  await page.setViewportSize({ width: 740, height: 390 });
  await page.goto("/");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "fallback", {
    timeout: 60000,
  });
  const evening = page.getByRole("radio", { name: "Tối", exact: true });
  await evening.focus();
  await expect(evening).toBeFocused();
  await page.keyboard.press("Space");
  await expect(evening).toHaveAttribute("aria-checked", "true");
  await expect(page.getByRole("button", { name: "Thử lại 3D", exact: true })).toBeVisible();
});
