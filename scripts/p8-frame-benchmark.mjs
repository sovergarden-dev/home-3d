import { expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { launchBenchmark } from "./benchmark-browser.mjs";
import { text as fixtureText } from "./p8-benchmark-fixture.mjs";
const output = process.argv[2] ?? "test-results/p8-continuous-frames";
await mkdir(output, { recursive: true });
if (process.env.BENCH_GPU !== "real") throw Error("REAL_GPU_REQUIRED");
const { browser, dpr, environment } = await launchBenchmark(["--mute-audio"]);
const rows = [],
  errors = [];
const stats = (values) => {
  const s = [...values].sort((a, b) => a - b);
  return {
    n: s.length,
    p50: s[Math.floor(s.length * 0.5)],
    p95: s[Math.ceil(s.length * 0.95) - 1],
    max: s.at(-1),
  };
};
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: dpr,
    reducedMotion: "reduce",
  });
  page.on("pageerror", () => errors.push("PAGE_ERROR"));
  await page.route("**/*", (route) =>
    ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  await page.addInitScript(() => {
    window.__continuous = { step: -1, active: false, submissions: [], inputs: [] };
    const clear = WebGL2RenderingContext.prototype.clear;
    WebGL2RenderingContext.prototype.clear = function (mask) {
      const main =
        !!(mask & this.COLOR_BUFFER_BIT) && this.getParameter(this.FRAMEBUFFER_BINDING) === null;
      const result = clear.call(this, mask);
      if (main && window.__continuous.active && window.__continuous.step >= 0) {
        const step = window.__continuous.step;
        queueMicrotask(() => {
          if (window.__continuous.submissions[step] === undefined)
            window.__continuous.submissions[step] = performance.now();
        });
      }
      return result;
    };
  });
  await page.goto("http://127.0.0.1:4188/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 60000,
  });
  const metadata = await environment(page);
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-p8-continuous.json",
    mimeType: "application/json",
    buffer: Buffer.from(fixtureText),
  });
  await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await page.evaluate(async () => {
    const entry = performance
      .getEntriesByType("resource")
      .find((entry) => new URL(entry.name).pathname === "/src/state/appStore.ts");
    const { useAppStore } = await import(
      entry?.name ?? new URL("/src/state/appStore.ts", location.href).href
    );
    window.__frameStore = useAppStore;
    useAppStore.setState({
      selectedDate: "2026-06-21",
      timeOfDayMinutes: 720,
      heading: 32,
      zoom: 1,
      timeSpeed: 0,
      realTimeEnabled: false,
      lifeEnabled: true,
      weather: "sunny",
      festival: "normal",
      festivalAuto: false,
    });
  });
  for (const condition of [
    {
      name: "sunny-day",
      weather: "sunny",
      timeOfDayMinutes: 720,
      floodLevel: 0,
      festival: "normal",
    },
    {
      name: "storm-night",
      weather: "storm",
      timeOfDayMinutes: 1380,
      floodLevel: 0,
      festival: "normal",
    },
    {
      name: "flood-festival",
      weather: "rain",
      timeOfDayMinutes: 1170,
      floodLevel: 0.3,
      festival: "tet",
    },
  ]) {
    const { name, ...patch } = condition;
    await page.evaluate(
      (patch) => window.__frameStore.setState({ ...patch, heading: 32, zoom: 1 }),
      patch,
    );
    await page.waitForTimeout(2000);
    await page.mouse.move(600, 350);
    await page.mouse.down();
    const trace = await page.evaluate(async () => {
      const canvas = document.querySelector('[data-testid="demo-scene"] canvas');
      const probe = window.__continuous;
      probe.step = -1;
      probe.submissions = [];
      probe.inputs = [];
      probe.active = true;
      for (let step = 0; step < 240; step++) {
        await new Promise(requestAnimationFrame);
        probe.step = step;
        probe.inputs.push(performance.now());
        canvas.dispatchEvent(
          new PointerEvent("pointermove", {
            pointerId: 1,
            pointerType: "mouse",
            isPrimary: true,
            buttons: 1,
            bubbles: true,
            clientX: 600 + 100 * Math.sin((step + 1) / 30),
            clientY: 350 + 45 * (1 - Math.cos((step + 1) / 30)),
          }),
        );
      }
      await new Promise(requestAnimationFrame);
      probe.active = false;
      return { inputs: probe.inputs, submissions: probe.submissions };
    });
    await page.mouse.up();
    const intervals = [];
    for (let i = 1; i < trace.submissions.length; i++)
      if (Number.isFinite(trace.submissions[i]) && Number.isFinite(trace.submissions[i - 1]))
        intervals.push(trace.submissions[i] - trace.submissions[i - 1]);
    const complete =
      trace.inputs.length === 240 &&
      trace.submissions.length === 240 &&
      Array.from({ length: 240 }, (_, index) => trace.submissions[index]).every(Number.isFinite);
    rows.push({
      condition,
      complete,
      trace,
      intervalsMs: intervals,
      statistics: stats(intervals),
      within50Ms: complete && intervals.every((ms) => ms <= 50),
      scene: await page.getByTestId("demo-scene").evaluate((element) => ({
        drawCalls: element.dataset.drawCalls,
        triangles: element.dataset.triangles,
        lifeTier: element.dataset.lifeTier,
      })),
    });
  }
  const report = {
    syntheticOnly: true,
    status: errors.length === 0 && rows.every((row) => row.within50Ms) ? "MET" : "NOT_MET",
    environment: metadata,
    scriptSha256: createHash("sha256")
      .update(await readFile(new URL(import.meta.url)))
      .digest("hex"),
    fixtureSha256: createHash("sha256").update(fixtureText).digest("hex"),
    method:
      "240 browser-RAF-paced synthetic pointermoves per condition after a native pointerdown; first completed main submission per step. Missing steps are failures. Intervals measure render submission cadence, not GPU execution time or independent presentation timestamps. Driver transport idle gaps are excluded by input construction, not by filtering slow samples.",
    rows,
    errors,
  };
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      status: report.status,
      rows: rows.map(({ condition, complete, statistics, within50Ms }) => ({
        condition,
        complete,
        statistics,
        within50Ms,
      })),
    }),
  );
} finally {
  await browser.close();
}
