import { expect, test, type Locator, type Page } from "@playwright/test";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
async function verifyKeyboardFocus(page: Page, control: Locator) {
  await control.focus();
  await page.keyboard.press("Tab");
  await page.keyboard.press("Shift+Tab");
  await expect(control).toBeFocused();
  expect(await page.locator(":focus").evaluate((node) => node.matches(":focus-visible"))).toBe(
    true,
  );
}

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
    if (viewport.width < 768) {
      await expect(page.getByTestId("private-world-panel")).toBeHidden();
      await page
        .getByRole("button", { name: "Kéo để mở rộng bảng điều khiển", exact: true })
        .focus();
      await page.keyboard.press("ArrowDown");
      await expect(page.getByTestId("private-world-panel")).toBeVisible();
    }
    const sound = page.getByRole("button", { name: "Tiếng phố", exact: true });
    if (ready) await verifyKeyboardFocus(page, sound);
    else {
      await expect(sound).toBeDisabled();
      await sound.focus();
      await expect(sound).not.toBeFocused();
    }
    await verifyKeyboardFocus(page, page.getByRole("radio", { name: "vi", exact: true }));
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

test("keyboard remains available when 3D and sound are unavailable", async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 390 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      return type === "webgl2" ? null : Reflect.apply(original, this, [type, ...args]);
    };
  });
  await page.goto("/");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "fallback", {
    timeout: 60000,
  });
  const sound = page.getByRole("button", { name: "Tiếng phố", exact: true });
  await expect(sound).toBeDisabled();
  await sound.focus();
  await expect(sound).not.toBeFocused();
  await verifyKeyboardFocus(page, page.getByRole("radio", { name: "vi", exact: true }));
});
