import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import path from "node:path";
import { launchBenchmark } from "./benchmark-browser.mjs";

const output = path.resolve(process.argv[2] ?? "test-results/p10-1-latency");
if (!["real", "software"].includes(process.env.BENCH_GPU ?? ""))
  throw Error("EXPLICIT_RENDERER_MODE_REQUIRED");
const batches = Number(process.env.K1_BATCHES ?? 6);
const pairs = Number(process.env.K1_PAIRS ?? 10);
const phases = [
  {
    name: "before",
    port: Number(process.env.K1_BEFORE_PORT ?? 4184),
    sha: process.env.K1_BEFORE_SHA,
  },
  { name: "after", port: Number(process.env.K1_AFTER_PORT ?? 4186), sha: process.env.K1_AFTER_SHA },
];
if (!phases.every((phase) => /^[a-f0-9]{40}$/.test(phase.sha ?? "")))
  throw Error("EXACT_COMPARISON_SHAS_REQUIRED");
if (![batches, pairs].every((value) => Number.isInteger(value) && value > 0))
  throw Error("INVALID_SAMPLE_DESIGN");
const conditions = [
  { name: "active-300", population: 299, width: 1440, height: 900, life: true },
  { name: "static-300", population: 299, width: 1440, height: 900, life: false },
  { name: "smaller-300", population: 299, width: 960, height: 600, life: true },
  { name: "active-empty", population: 0, width: 1440, height: 900, life: true },
].filter((condition) => !process.env.K1_CONDITION || condition.name === process.env.K1_CONDITION);
if (!conditions.length) throw Error("UNKNOWN_COMPARISON_CONDITION");
await mkdir(output, { recursive: true });
const { browser, dpr, environment } = await launchBenchmark();
const results = [];
const scriptSha256 = createHash("sha256")
  .update(readFileSync(new URL(import.meta.url)))
  .digest("hex");
const environments = new Map();
const stats = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    n: sorted.length,
    min: sorted[0],
    p50: sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2,
    p95: sorted[Math.ceil(sorted.length * 0.95) - 1],
    max: sorted.at(-1),
  };
};

async function setup(page, condition) {
  await page.addInitScript(() => {
    window.__k1Import = (pathname) => {
      const entry = [...performance.getEntriesByType("resource")]
        .reverse()
        .find((item) => new URL(item.name).pathname === pathname);
      return import(entry?.name ?? new URL(pathname, location.href).href);
    };
  });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname) ||
      ["data:", "blob:"].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
  await page.goto(`http://127.0.0.1:${condition.port}/?local-preview=1`);
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 60000,
  });
  // Tier is selected at scene creation. Keep 300-pin tier identical before reducing render area.
  await page.setViewportSize({ width: condition.width, height: condition.height });
  const observed = await environment(page);
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
  await expect(page.getByTestId("memory-card")).toHaveCount(3);
  await page.evaluate(async (condition) => {
    const { useAppStore } = await window.__k1Import("/src/state/appStore.ts");
    const world = (
      await window.__k1Import("/src/world/privateWorldSession.ts")
    ).worldDataProvider.getSnapshot();
    if (world.mode !== "fixture" || !world.world.manifest.isSynthetic)
      throw Error("SYNTHETIC_FIXTURE_REQUIRED");
    useAppStore.setState({
      selectedDate: "2026-06-21",
      timeOfDayMinutes: 420,
      timeSpeed: condition.life ? 1 : 0,
      lifeEnabled: condition.life,
      realTimeEnabled: false,
      festivalAuto: false,
      festival: "normal",
      heading: 28,
      zoom: 1,
    });
    const THREE = await window.__k1Import("/node_modules/.vite/deps/three.js");
    let active = null,
      gl = null,
      fence = null;
    const wrapped = new WeakSet();
    const originalAfter = THREE.Object3D.prototype.onAfterRender;
    THREE.Object3D.prototype.onAfterRender = function (renderer, ...args) {
      if (this.name === "memory-pins-instanced" && renderer.getRenderTarget() === null) {
        if (!wrapped.has(renderer)) {
          wrapped.add(renderer);
          const pins = this;
          gl = renderer.getContext();
          const originalRender = renderer.render;
          renderer.render = function (...renderArgs) {
            const result = originalRender.apply(this, renderArgs);
            if (active?.expected === 0 && pins.count === 0 && pins.parent === null) {
              active.sawExpected = true;
              active.pinEvidence = "detached-empty-layer";
            }
            if (active?.sawExpected && !fence && this.getRenderTarget() === null) {
              fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
              if (!fence) throw Error("GPU_FENCE_UNAVAILABLE");
              gl.flush();
              active.renderEnd = performance.now();
            }
            return result;
          };
        }
        if (active && this.count === active.expected) {
          active.sawExpected = true;
          active.pinEvidence = "actual-pin-draw";
        }
      }
      return originalAfter.call(this, renderer, ...args);
    };
    const observer = new MutationObserver(() => {
      if (
        active &&
        active.dom === null &&
        document.querySelectorAll('[data-testid="memory-card"]').length === active.expected
      )
        active.dom = performance.now();
    });
    observer.observe(document, { childList: true, subtree: true });
    window.__k1Probe = {
      begin(expected, start) {
        if (fence) gl.deleteSync(fence);
        fence = null;
        active = {
          expected,
          start,
          sawExpected: false,
          pinEvidence: null,
          dom: null,
          renderEnd: null,
          gpuReady: null,
        };
      },
      poll() {
        if (fence && active.gpuReady === null) {
          const status = gl.clientWaitSync(fence, 0, 0);
          if (status === gl.WAIT_FAILED) throw Error("GPU_FENCE_WAIT_FAILED");
          if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED)
            active.gpuReady = performance.now();
        }
        return { ...active };
      },
      end() {
        if (fence) gl.deleteSync(fence);
        fence = null;
        active = null;
      },
    };
  }, condition);
  await page.waitForTimeout(5000);
  await page.evaluate(async (population) => {
    const { memorySession: session } = await window.__k1Import("/src/memories/session.ts");
    const { memoryCamera } = await window.__k1Import("/src/memories/bridge.ts");
    if (population < session.getSnapshot().memories.length)
      for (const item of [...session.getSnapshot().memories]) session.deleteMemory(item.id);
    const pose = memoryCamera.getPose();
    for (let i = session.getSnapshot().memories.length; i < population; i++)
      session.saveMemory({
        id: crypto.randomUUID(),
        title: "Ví dụ tổng hợp",
        body: "",
        position: [(i % 18) * 5 - 45, 0, Math.floor(i / 18) * 5 - 40],
        camera: { ...pose, target: [...pose.target] },
        date: "2026-06-21",
        preset: "everyday",
        tags: [],
        photos: [],
        visibility: "public",
      });
  }, condition.population);
  await expect(page.getByTestId("memory-card")).toHaveCount(condition.population);
  await expect(page.getByTestId("demo-scene")).toHaveAttribute(
    "data-memory-pins",
    String(condition.population),
  );
  await page.waitForTimeout(5000);
  return observed;
}

async function measure(page, condition) {
  return page.evaluate(
    async ({ pairs, population }) => {
      const { memorySession: session } = await window.__k1Import("/src/memories/session.ts");
      const { memoryCamera } = await window.__k1Import("/src/memories/bridge.ts");
      const pose = memoryCamera.getPose();
      const frame = () =>
        new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now())));
      const samples = [];
      for (let pair = 0; pair < pairs; pair++) {
        const item = {
          id: crypto.randomUUID(),
          title: "Ví dụ tổng hợp",
          body: "",
          position: [0, 0, 18],
          camera: { ...pose, target: [...pose.target] },
          date: "2026-06-21",
          preset: "everyday",
          tags: [],
          photos: [],
          visibility: "public",
        };
        for (const kind of ["add", "delete"]) {
          const expected = population + (kind === "add" ? 1 : 0);
          const start = performance.now();
          window.__k1Probe.begin(expected, start);
          let cpuMs = null,
            raf1Ms = null,
            raf2Ms = null,
            reflectedMs = null,
            observation = null,
            error = null;
          try {
            if (kind === "add") session.saveMemory(item);
            else session.deleteMemory(item.id);
            cpuMs = performance.now() - start;
            let frames = 0;
            while (performance.now() - start < 5000) {
              const at = await frame();
              frames++;
              if (frames === 1) raf1Ms = at - start;
              if (frames === 2) raf2Ms = at - start;
              observation = window.__k1Probe.poll();
              if (observation.dom !== null && observation.gpuReady !== null) {
                const afterPaintOpportunity = await frame();
                if (raf2Ms === null) raf2Ms = afterPaintOpportunity - start;
                reflectedMs = afterPaintOpportunity - start;
                break;
              }
            }
          } catch (caught) {
            error =
              caught instanceof Error && caught.message.startsWith("GPU_FENCE")
                ? caught.message
                : "MEASUREMENT_FAILED";
          } finally {
            window.__k1Probe.end();
          }
          const elapsedMs = performance.now() - start;
          samples.push({
            pair,
            kind,
            expected,
            count: session.getSnapshot().memories.length,
            pinEvidence: observation?.pinEvidence ?? null,
            cpuMs,
            raf1Ms,
            raf2Ms,
            domCommitMs: observation?.dom === null || !observation ? null : observation.dom - start,
            renderEndMs:
              observation?.renderEnd === null || !observation
                ? null
                : observation.renderEnd - start,
            gpuCompletionObservedMs:
              observation?.gpuReady === null || !observation ? null : observation.gpuReady - start,
            reflectedMs,
            elapsedMs,
            status: error ?? (reflectedMs === null ? "TIMED_OUT" : "REFLECTED"),
          });
          if (error || reflectedMs === null) return samples;
        }
      }
      return samples;
    },
    { pairs, population: condition.population },
  );
}

try {
  for (const condition of conditions) {
    for (let batch = 0; batch < batches; batch++) {
      const order = batch % 2 ? [...phases].reverse() : phases;
      for (const phase of order) {
        process.env.BENCH_SOURCE_SHA = phase.sha;
        const page = await browser.newPage({
          viewport: { width: 1440, height: 900 },
          deviceScaleFactor: dpr,
          reducedMotion: "reduce",
        });
        const pageErrors = [];
        page.on("pageerror", () => pageErrors.push("PAGE_ERROR"));
        try {
          const observed = await setup(page, { ...condition, port: phase.port });
          const comparable = JSON.stringify(
            Object.fromEntries(
              [
                "renderer",
                "vendor",
                "dpr",
                "viewport",
                "browserVersion",
                "driverVersion",
                "rendererClass",
                "headed",
              ].map((key) => [key, observed[key]]),
            ),
          );
          const previousEnvironment = environments.get(condition.name);
          if (previousEnvironment && previousEnvironment !== comparable)
            throw Error("MATCHED_ENVIRONMENT_REQUIRED");
          environments.set(condition.name, comparable);
          const startScene = await page
            .getByTestId("demo-scene")
            .evaluate((element) => ({ ...element.dataset }));
          const samples = await measure(page, condition);
          const endScene = await page
            .getByTestId("demo-scene")
            .evaluate((element) => ({ ...element.dataset }));
          const result = {
            syntheticOnly: true,
            scriptSha256,
            phase: phase.name,
            condition,
            batch,
            environment: observed,
            warmupMs: 5000,
            postPopulationWarmupMs: 5000,
            initialViewport: { width: 1440, height: 900 },
            method:
              "DOM count + expected pin draw (or detached zero-count layer) in an actual main render + completed GPU fence + following RAF; conservative presentation opportunity, not GPU execution time",
            samples,
            startScene,
            endScene,
            pageErrors,
          };
          const file = `${condition.name}-${batch}-${phase.name}.json`;
          await writeFile(path.join(output, file), JSON.stringify(result, null, 2) + "\n");
          results.push({ file, ...result });
          console.log(
            `${condition.name} batch ${batch + 1}/${batches} ${phase.name}: ${samples.length} samples`,
          );
        } finally {
          await page.close();
        }
      }
    }
  }
  const summary = {};
  for (const condition of conditions) {
    summary[condition.name] = {};
    for (const phase of phases) {
      const samples = results
        .filter((r) => r.condition.name === condition.name && r.phase === phase.name)
        .flatMap((r) => r.samples);
      summary[condition.name][phase.name] = {
        complete:
          samples.length === batches * pairs * 2 &&
          results
            .filter((r) => r.condition.name === condition.name && r.phase === phase.name)
            .every((r) => r.pageErrors.length === 0) &&
          samples.every((s) => s.status === "REFLECTED" && s.count === s.expected),
        failures: samples.filter((s) => s.status !== "REFLECTED" || s.count !== s.expected),
        add: stats(
          samples
            .filter((s) => s.kind === "add" && s.reflectedMs !== null)
            .map((s) => s.reflectedMs),
        ),
        delete: stats(
          samples
            .filter((s) => s.kind === "delete" && s.reflectedMs !== null)
            .map((s) => s.reflectedMs),
        ),
      };
    }
  }
  const sufficient =
    batches * pairs >= 60 &&
    ["active-300", "static-300", "smaller-300", "active-empty"].every((name) => summary[name]);
  const completeMatrix = conditions.every((condition) =>
    phases.every((phase) => summary[condition.name][phase.name].complete),
  );
  const met =
    sufficient &&
    completeMatrix &&
    ["active-300", "static-300"].every((name) => {
      const row = summary[name].after;
      return row.complete && row.add.p50 < 100 && row.delete.p50 < 100;
    });
  const real = results.every((r) => r.environment.rendererClass === "REAL_GPU");
  const improved = ["active-300", "static-300"].every(
    (name) =>
      summary[name]?.after.complete &&
      summary[name]?.before.complete &&
      summary[name].after.add.p50 < summary[name].before.add.p50 &&
      summary[name].after.delete.p50 < summary[name].before.delete.p50,
  );
  const label = !sufficient
    ? "DIAGNOSTIC_INSUFFICIENT_SAMPLES"
    : real
      ? met
        ? "H_MET_REAL_GPU"
        : "H_NOT_MET_REAL_GPU"
      : met
        ? "H_MET_SWIFTSHADER"
        : improved
          ? "H_IMPROVED_NOT_MET"
          : "H_BLOCKED";
  await writeFile(
    path.join(output, "summary.json"),
    JSON.stringify(
      {
        syntheticOnly: true,
        scriptSha256,
        label,
        goalMs: 100,
        batches,
        pairs,
        ordering: "AB then BA alternating batches",
        summary,
        files: results.map((r) => r.file),
        limitation:
          "Presentation opportunity is an upper bound. GPU completion is fence-observed; no GPU-memory or physical-GPU-time claim. Failed/censored observations remain in raw and prevent complete=true.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(label);
} finally {
  await browser.close();
}
