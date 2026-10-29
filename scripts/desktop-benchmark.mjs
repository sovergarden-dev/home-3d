import { expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { launchBenchmark } from "./benchmark-browser.mjs";
import { P8_PACKAGE_TEXT } from "../tests/e2e/helpers/p8-fixture.ts";
const output = process.argv[2] ?? "test-results/desktop-benchmark",
  port = Number(process.env.DESKTOP_BENCH_PORT ?? 4190);
if (process.env.BENCH_GPU !== "real") throw Error("REAL_GPU_REQUIRED");
await mkdir(output, { recursive: true });
const { browser, dpr, environment } = await launchBenchmark(["--mute-audio"]);
const memoryPath = path.resolve(output, "gpu-memory.json");
const gpuSampler =
  process.platform === "win32"
    ? spawn(
        "powershell.exe",
        [
          "-NoProfile",
          "-File",
          fileURLToPath(new URL("./windows-gpu-memory.ps1", import.meta.url)),
          "-RootProcessId",
          String(process.pid),
          "-OutputFile",
          memoryPath,
        ],
        { windowsHide: true, stdio: "ignore" },
      )
    : null;
let samplerError = false;
gpuSampler?.on("error", () => {
  samplerError = true;
});
const percentile = (values, q) => {
  const s = [...values].sort((a, b) => a - b);
  return s[Math.max(0, Math.ceil(s.length * q) - 1)] ?? null;
};
const rows = [],
  errors = [],
  external = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: dpr,
    reducedMotion: "no-preference",
  });
  page.on("pageerror", () => errors.push("PAGE_ERROR"));
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (
      ["127.0.0.1", "localhost"].includes(url.hostname) ||
      ["data:", "blob:"].includes(url.protocol)
    )
      return route.continue();
    external.push(url.hostname);
    return route.abort();
  });
  await page.addInitScript(() => {
    const raf = window.requestAnimationFrame.bind(window);
    window.__desktopRafClock = 0;
    window.requestAnimationFrame = (callback) =>
      raf((time) => {
        window.__desktopRafClock = time;
        callback(time);
      });
  });
  await page.goto(`http://127.0.0.1:${port}/?local-preview=1`);
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 60000,
  });
  const metadata = await environment(page);
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-desktop-benchmark.json",
    mimeType: "application/json",
    buffer: Buffer.from(P8_PACKAGE_TEXT),
  });
  await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await page.evaluate(async () => {
    const imported = async (path) => {
      const resource = performance
        .getEntriesByType("resource")
        .find((resource) => new URL(resource.name).pathname === path);
      return import(resource?.name ?? new URL(path, location.href).href);
    };
    window.__desktopStore = (await imported("/src/state/appStore.ts")).useAppStore;
    window.__desktopFrames = (
      await imported("/src/engine/quality/frameMetrics.ts")
    ).observeRenderedFrames;
    const provider = (await imported("/src/world/privateWorldSession.ts")).worldDataProvider;
    if (!provider.getSnapshot().world?.manifest.isSynthetic)
      throw Error("SYNTHETIC_WORLD_REQUIRED");
  });
  for (const scenario of [
    {
      name: "sunny-paused",
      weather: "sunny",
      timeOfDayMinutes: 720,
      timeSpeed: 0,
      floodLevel: 0,
      festival: "normal",
    },
    {
      name: "storm-active",
      weather: "storm",
      timeOfDayMinutes: 1260,
      timeSpeed: 1,
      floodLevel: 0.2,
      festival: "tet",
    },
  ].flatMap((scenario) =>
    [false, true].map((illustrativeDetails) => ({
      ...scenario,
      name: `${scenario.name}-${illustrativeDetails ? "details" : "plain"}`,
      illustrativeDetails,
    })),
  )) {
    const { name: scenarioName, ...patch } = scenario;
    console.log(`Measuring ${scenarioName}`);
    await page.evaluate(
      (patch) =>
        window.__desktopStore.setState({
          ...patch,
          selectedDate: "2026-06-21",
          festivalAuto: false,
          realTimeEnabled: false,
          viewMode: "diorama",
          heading: 32,
          zoom: 1,
          lifeEnabled: true,
        }),
      patch,
    );
    await page.waitForTimeout(5000);
    const result = await page.evaluate(async () => {
      const clocks = [],
        firstSubmission = [],
        lastSubmission = [],
        submissionsPerClock = [];
      const data = document.querySelector('[data-testid="demo-scene"]').dataset;
      const peaks = {
        drawCalls: 0,
        triangles: 0,
        textures: 0,
        geometries: 0,
        illustrativeInstances: 0,
      };
      const collectCounters = () => {
        for (const [key, field] of Object.entries({
          drawCalls: "drawCalls",
          triangles: "triangles",
          textures: "memoryTextures",
          geometries: "memoryGeometries",
          illustrativeInstances: "illustrativeInstances",
        }))
          peaks[key] = Math.max(peaks[key], Number(data[field] ?? 0));
      };
      let recording = false;
      const stop = window.__desktopFrames((time) => {
        if (!recording) return;
        collectCounters();
        const clock = window.__desktopRafClock;
        if (clocks.at(-1) !== clock) {
          clocks.push(clock);
          firstSubmission.push(time);
          lastSubmission.push(time);
          submissionsPerClock.push(1);
        } else {
          lastSubmission[lastSubmission.length - 1] = time;
          submissionsPerClock[submissionsPerClock.length - 1]++;
        }
      });
      const state = window.__desktopStore.getState(),
        minutes = state.timeOfDayMinutes;
      try {
        recording = true;
        for (let step = 0; step < 600; step++) {
          await new Promise(requestAnimationFrame);
          recording = true;
          window.__desktopStore.setState({
            heading: (32 + (step + 1) * 0.6) % 360,
            zoom: 1 + 0.16 * Math.sin(((step + 1) * Math.PI) / 150),
            timeOfDayMinutes: minutes,
          });
        }
        await new Promise(requestAnimationFrame);
        recording = false;
      } finally {
        stop();
      }
      collectCounters();
      return {
        peaks,
        effectiveDpr:
          document.querySelector('[data-testid="demo-scene"] canvas').width /
          document.querySelector('[data-testid="demo-scene"] canvas').clientWidth,
        clocks,
        firstSubmission,
        lastSubmission,
        submissionsPerClock,
        counters: {
          drawCalls: Number(data.drawCalls),
          triangles: Number(data.triangles),
          textures: Number(data.memoryTextures),
          geometries: Number(data.memoryGeometries),
          lifeTier: data.lifeTier,
          lifeAgents: Number(data.lifeAgents),
        },
        heap: performance.memory
          ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }
          : null,
      };
    });
    await page.screenshot({
      path: path.join(output, `${scenarioName}.jpg`),
      type: "jpeg",
      quality: 75,
    });
    const intervals = result.lastSubmission
      .slice(1)
      .map((value, index) => value - result.lastSubmission[index]);
    const clockIntervals = result.clocks
      .slice(1)
      .map((value, index) => value - result.clocks[index]);
    const fps = result.clocks
      .slice(60)
      .map((clock, index) => 60000 / (clock - result.clocks[index]));
    const complete =
      result.clocks.length >= 600 && intervals.every((ms) => Number.isFinite(ms) && ms > 0);
    const tier = "mid";
    const limits =
      tier === "low"
        ? { drawCalls: 120, triangles: 400000, fps: 30, gpuBytes: 200000000 }
        : { drawCalls: 200, triangles: 800000, fps: 55, gpuBytes: 350000000 };
    rows.push({
      scenario,
      complete,
      raw: result,
      intervalsMs: intervals,
      browserRafIntervalsMs: clockIntervals,
      frameMs: {
        p50: percentile(intervals, 0.5),
        p95: percentile(intervals, 0.95),
        max: Math.max(...intervals),
      },
      fps: { p05: percentile(fps, 0.05), p50: percentile(fps, 0.5), p95: percentile(fps, 0.95) },
      tier,
      limits,
      geometryBudget:
        result.peaks.drawCalls <= limits.drawCalls && result.peaks.triangles <= limits.triangles,
      frameBudget: complete && Math.max(...intervals) <= 50,
      fpsBudget: complete && percentile(fps, 0.5) >= limits.fps,
      gpuMemoryStatus: "NOT_VERIFIED",
    });
  }
  await writeFile(`${memoryPath}.stop`, "stop");
  if (gpuSampler && gpuSampler.exitCode === null && !samplerError)
    await Promise.race([
      new Promise((resolve) => gpuSampler.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 12000)),
    ]);
  const gpuMemory = await readFile(memoryPath, "utf8")
    .then(JSON.parse)
    .catch(() => ({ status: "NOT_VERIFIED", samples: [] }));
  if (gpuMemory.status === "MEASURED") {
    gpuMemory.peakResidentAllocationBytes = Math.max(
      ...gpuMemory.samples.map((r) => r.residentAllocationBytes),
    );
    gpuMemory.peakCommittedBytes = Math.max(...gpuMemory.samples.map((r) => r.committedBytes));
    for (const row of rows) row.gpuMemoryStatus = "MEASURED_BATCH_UPPER_BOUND";
    gpuMemory.midBudgetStatus =
      gpuMemory.peakResidentAllocationBytes <= 350000000 ? "MET" : "NOT_MET";
  }
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        syntheticOnly: true,
        gpuMemory,
        environment: metadata,
        fixtureSha256: createHash("sha256").update(P8_PACKAGE_TEXT).digest("hex"),
        scriptSha256: createHash("sha256")
          .update(await readFile(new URL(import.meta.url)))
          .digest("hex"),
        cameraPath: {
          steps: 600,
          headingStart: 32,
          degreesPerStep: 0.6,
          zoomBase: 1,
          zoomAmplitude: 0.16,
        },
        method:
          "Actual engine render notifications grouped by browser RAF timestamp, with duplicate submissions retained as counts. Frame times are completed CPU submission cadence; FPS uses rolling 60-frame windows of unique rendered RAF opportunities, not direct display-scanout or GPU-execution measurement. No slow intervals are filtered. The reference budget is fixed to mid before measurement, independently of simulation density auto-adjustment. Heap is a browser estimate; GPU memory needs a separate owned-process Windows counter.",
        rows,
        errors,
        externalHosts: [...new Set(external)],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      channel: metadata.channel,
      rows: rows.map(
        ({ scenario, complete, frameMs, fps, geometryBudget, frameBudget, fpsBudget }) => ({
          scenario,
          complete,
          frameMs,
          fps,
          geometryBudget,
          frameBudget,
          fpsBudget,
        }),
      ),
      errors,
      externalHosts: [...new Set(external)],
    }),
  );
} catch (error) {
  await writeFile(
    path.join(output, "incomplete.json"),
    JSON.stringify(
      {
        syntheticOnly: true,
        complete: false,
        errorType: error.name,
        rows,
        errors,
        externalHosts: [...new Set(external)],
      },
      null,
      2,
    ) + "\n",
  );
  throw error;
} finally {
  await writeFile(`${memoryPath}.stop`, "stop");
  if (gpuSampler?.exitCode === null) gpuSampler.kill();
  await browser.close();
}
