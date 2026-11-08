import { mkdir, writeFile } from "node:fs/promises";
import { launchBenchmark } from "./benchmark-browser.mjs";

/**
 * Cold production loads on the real GPU: when the first frame appears, when every startup variant
 * has been submitted for compilation and when the scene opens for input. Run against
 * scripts/production-server.mjs.
 */
if (process.env.BENCH_GPU !== "real") throw Error("REAL_GPU_REQUIRED");
const output = process.argv[2] ?? "test-results/startup-timing";
const runs = Number(process.argv[3] ?? 5);
if (!Number.isInteger(runs) || runs < 1) throw Error("INVALID_RUNS");
const origin = `http://127.0.0.1:${Number(process.env.PRODUCTION_QA_PORT ?? 4193)}`;
await mkdir(output, { recursive: true });
const median = (values) => {
  // Every run carries every mark (checked per run), so nothing is dropped from the median.
  if (!values.length || values.some((value) => typeof value !== "number"))
    throw Error("STARTUP_MARKS_MISSING");
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};
const { browser, environment } = await launchBenchmark(["--mute-audio"]);
const rows = [];
let measured;
try {
  for (let run = 1; run <= runs; run++) {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
      serviceWorkers: "block",
    });
    try {
      await context.addInitScript(() => {
        const marks = (window.__startupMarks = { longTasks: [] });
        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries())
              marks.longTasks.push([Math.round(entry.startTime), Math.round(entry.duration)]);
          }).observe({ type: "longtask", buffered: true });
        } catch {
          // Long Task timing is unavailable; the list stays empty and is reported as such.
          marks.longTasksUnsupported = true;
        }
        new MutationObserver(() => {
          const scene = document.querySelector('[data-testid="demo-scene"]');
          const root = document.getElementById("scene-root");
          const now = Math.round(performance.now());
          if (scene?.dataset.memoryGeometries && marks.firstFrame === undefined)
            marks.firstFrame = now;
          const variants = scene?.dataset.startupVariants;
          if (variants) {
            const [done, total] = variants.split("/").map(Number);
            if (done === total && marks.allVariants === undefined) marks.allVariants = now;
            marks.variants = variants;
          }
          if (root?.dataset.sceneState === "ready" && marks.ready === undefined) marks.ready = now;
        }).observe(document, { subtree: true, attributes: true, childList: true });
      });
      const page = await context.newPage();
      // A same-origin document without scripts first, so the measured load starts in a warm renderer.
      await page.goto(`${origin}/manifest.webmanifest`);
      await page.goto(`${origin}/`);
      await page.waitForSelector('#scene-root[data-scene-state="ready"]', { timeout: 60000 });
      // Long tasks right after ready still belong to startup.
      await page.waitForTimeout(1000);
      measured ??= await environment(page);
      const marks = await page.evaluate(() => {
        const paint = performance
          .getEntriesByType("paint")
          .find((entry) => entry.name === "first-contentful-paint");
        const probe = document.createElement("canvas").getContext("webgl2");
        return {
          ...window.__startupMarks,
          fcp: paint ? Math.round(paint.startTime) : null,
          parallelShaderCompile: Boolean(probe?.getExtension("KHR_parallel_shader_compile")),
        };
      });
      const required = [marks.fcp, marks.firstFrame, marks.allVariants, marks.ready];
      if (required.some((mark) => typeof mark !== "number")) throw Error("STARTUP_MARKS_MISSING");
      const row = {
        run,
        ...marks,
        firstFrameToReadyMs: marks.ready - marks.firstFrame,
        longTasksAfterFirstFrame: marks.longTasks.filter(([start]) => start >= marks.firstFrame)
          .length,
      };
      rows.push(row);
      console.log(JSON.stringify(row));
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
const keys = ["fcp", "firstFrame", "allVariants", "ready", "firstFrameToReadyMs"];
await writeFile(
  `${output}/startup-timing.json`,
  JSON.stringify(
    {
      syntheticOnly: true,
      method:
        "Production build behind scripts/production-server.mjs, headed browser on the real GPU, 1280x720 DPR 1, service worker blocked, a new context per run after a same-origin document without scripts, no network or CPU throttling. Times are performance.now() in the page: firstFrame = data-memory-geometries first appears, allVariants = data-startup-variants first reads n/n, ready = data-scene-state first reads ready. Long tasks come from PerformanceObserver; longTasksAfterFirstFrame counts those starting at or after firstFrame. Median of all runs; no sample removed.",
      environment: measured,
      median: Object.fromEntries(keys.map((key) => [key, median(rows.map((row) => row[key]))])),
      rows,
    },
    null,
    2,
  ) + "\n",
);
