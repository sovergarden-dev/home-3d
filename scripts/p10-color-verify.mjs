import { launchBenchmark } from "./benchmark-browser.mjs";
import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const out = process.argv[2] ?? "test-results/p10-color-qa";
await mkdir(out, { recursive: true });
const { browser, dpr, environment } = await launchBenchmark();
const page = await browser.newPage({
  viewport: { width: 1884, height: 804 },
  deviceScaleFactor: dpr,
  reducedMotion: "reduce",
  locale: "vi-VN",
});
const errors = [];
page.on("pageerror", (e) => errors.push(e.name));
await page.addInitScript(() => {
  window.__p10Import = (p) => {
    const e = [...performance.getEntriesByType("resource")]
      .reverse()
      .find((e) => new URL(e.name).pathname === p);
    return import(e?.name ?? new URL(p, location.href).href);
  };
});
await page.route("**/*", (r) =>
  new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : r.abort(),
);
try {
  await page.goto(`http://127.0.0.1:${process.env.P10_PORT ?? "4178"}/?local-preview=1`);
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 30000,
  });
  const observed = await environment(page);
  await page.evaluate(async () => {
    (await window.__p10Import("/src/state/appStore.ts")).useAppStore.setState({
      selectedDate: "2026-06-21",
      timeOfDayMinutes: 420,
      timeSpeed: 0,
      lifeEnabled: false,
      heading: 28,
      zoom: 1,
    });
  });
  await page.waitForTimeout(3000);
  const canvas = page.locator("#scene-root canvas").first();
  const box = await canvas.boundingBox();
  expect(box.width).toBe(1884);
  expect(box.height).toBe(804);
  const hidden = await page.addStyleTag({
    content:
      "body * { visibility:hidden!important } #scene-root canvas { visibility:visible!important }",
  });
  const screen = await canvas.screenshot({ path: out + "/scene-screen.png" });
  await hidden.evaluate((el) => el.remove());
  const card = await page.evaluate(async () => {
    const r = await (
      await window.__p10Import("/src/memories/postcard.ts")
    ).createPostcard({ ward: "Ví dụ tổng hợp", date: "2026-06-21", minutes: 420, mobile: true });
    return {
      width: r.width,
      height: r.height,
      degraded: r.degraded,
      base64: await new Promise((resolve) => {
        const f = new FileReader();
        f.onload = () => resolve(f.result.split(",")[1]);
        f.readAsDataURL(r.blob);
      }),
    };
  });
  await writeFile(out + "/postcard-2k.png", Buffer.from(card.base64, "base64"));
  const metrics = await page.evaluate(
    async ({ screen, card }) => {
      const decode = async (base64) =>
        createImageBitmap(await (await fetch("data:image/png;base64," + base64)).blob());
      const a = await decode(screen),
        b = await decode(card);
      const c = document.createElement("canvas");
      c.width = 1884;
      c.height = 804;
      const ctx = c.getContext("2d");
      ctx.drawImage(a, 0, 0);
      const x = ctx.getImageData(0, 0, 1884, 804).data;
      ctx.clearRect(0, 0, 1884, 804);
      ctx.drawImage(b, 82, 82, 1884, 804, 0, 0, 1884, 804);
      const y = ctx.getImageData(0, 0, 1884, 804).data;
      const sums = [0, 0, 0],
        sumc = [0, 0, 0],
        mae = [0, 0, 0];
      for (let i = 0; i < x.length; i += 4)
        for (let j = 0; j < 3; j++) {
          sums[j] += x[i + j];
          sumc[j] += y[i + j];
          mae[j] += Math.abs(x[i + j] - y[i + j]);
        }
      const n = x.length / 4;
      const sm = sums.map((v) => v / n),
        cm = sumc.map((v) => v / n);
      a.close();
      b.close();
      c.width = c.height = 0;
      return {
        screenMeanRGB: sm,
        postcardSceneMeanRGB: cm,
        relativeDeltaPct: sm.map((v, i) => (100 * Math.abs(cm[i] - v)) / Math.max(1, v)),
        meanAbsoluteError: mae.map((v) => v / n),
        screenMeanBrightness: sm.reduce((a, b) => a + b) / 3,
        postcardSceneMeanBrightness: cm.reduce((a, b) => a + b) / 3,
      };
    },
    { screen: screen.toString("base64"), card: card.base64 },
  );
  metrics.brightnessDeltaPct =
    (100 * Math.abs(metrics.postcardSceneMeanBrightness - metrics.screenMeanBrightness)) /
    metrics.screenMeanBrightness;
  expect(metrics.relativeDeltaPct.every((v) => v <= 15)).toBe(true);
  expect(metrics.brightnessDeltaPct).toBeLessThanOrEqual(15);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
  await expect(page.getByTestId("memory-card")).toHaveCount(3);
  await page
    .getByTestId("memory-card")
    .first()
    .evaluate((el) => el.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: out + "/gallery-1440x900.png" });
  await writeFile(
    out + "/brightness-evidence.json",
    JSON.stringify(
      {
        syntheticOnly: true,
        environment: observed,
        renderer: observed.renderer,
        scene: "2026-06-21 07:00 Asia/Ho_Chi_Minh",
        camera: { heading: 28, zoom: 1 },
        viewport: [1884, 804],
        dpr,
        cardSize: [card.width, card.height],
        photoROI: [82, 82, 1884, 804],
        thresholdPct: 15,
        ...metrics,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ metrics, errors }));
  expect(errors).toEqual([]);
} finally {
  await browser.close();
}
