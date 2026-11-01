import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { launchBenchmark } from "./benchmark-browser.mjs";
const output = process.argv[2] ?? "test-results/m2-visual";
await mkdir(output, { recursive: true });
const { browser, dpr, environment } = await launchBenchmark(["--mute-audio"]);
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: dpr,
    reducedMotion: "reduce",
  });
  const logs = [];
  page.on("console", (message) => {
    if (["warning", "error"].includes(message.type()) || /context/i.test(message.text()))
      logs.push({
        type: message.type(),
        text: message.text().replace(/https?:\/\/[^\s)]+/g, "[url]"),
      });
  });
  await page.route("**/*", (route) =>
    ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  await page.goto(process.env.VISUAL_URL ?? "http://127.0.0.1:4188/");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 60000,
  });
  const metadata = await environment(page);
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await page.evaluate(async () => {
    const item = performance
      .getEntriesByType("resource")
      .find((item) => new URL(item.name).pathname === "/src/state/appStore.ts");
    const { useAppStore } = await import(
      item?.name ?? new URL("/src/state/appStore.ts", location.href).href
    );
    window.__visualStore = useAppStore;
    useAppStore.setState({
      selectedDate: "2026-06-21",
      timeOfDayMinutes: 720,
      heading: 28,
      zoom: 1,
      timeSpeed: 1,
      lifeEnabled: true,
      weather: "sunny",
      festival: "normal",
      festivalAuto: false,
    });
  });
  await page.waitForTimeout(2000);
  await page.evaluate(() => window.__visualStore.setState({ timeSpeed: 0 }));
  const rows = [];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 740, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const mode of ["diorama", "walk", "ride"]) {
      if (viewport.width === 1440 && mode !== "diorama") continue;
      await page.evaluate((mode) => window.__visualStore.getState().setViewMode(mode), mode);
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${output}/${viewport.width}-${mode}.png` });
      const observed = await page.evaluate(() => ({
        scene: { ...document.querySelector('[data-testid="demo-scene"]').dataset },
        controls: [
          ...document.querySelectorAll(
            ".h6-map-controls-anchor,.p9-pov-controls,.private-world-panel",
          ),
        ].map((element) => {
          const b = element.getBoundingClientRect();
          return {
            class: element.className,
            rect: { x: b.x, y: b.y, width: b.width, height: b.height },
          };
        }),
      }));
      rows.push({ viewport, mode, ...observed });
    }
  }
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ syntheticOnly: true, environment: metadata, rows, logs }, null, 2) + "\n",
  );
} finally {
  await browser.close();
}
