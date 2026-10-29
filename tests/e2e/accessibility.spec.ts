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
        targets: v.nodes.map((n) => n.target),
      }));
    });
    expect(violations).toEqual([]);
    await page.getByRole("button", { name: "Tiếng phố", exact: true }).focus();
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
