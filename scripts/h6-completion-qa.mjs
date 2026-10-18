// Synthetic-only QA. No private package is read by this script.
// H6_PHASE=before|final|both; H6_SOAK_MINUTES=20; H6_CYCLES=20.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { assessLifecycleMemory } from "./h6-lifecycle-memory.mjs";

const beforeURL = process.env.H6_BEFORE_URL ?? "http://127.0.0.1:4180";
const finalURL = process.env.H6_FINAL_URL ?? "http://127.0.0.1:4178";
const outDir = resolve(process.env.H6_OUTPUT_DIR ?? "test-results/h6-completion");
const cycles = Number(process.env.H6_CYCLES ?? 20);
const soakMinutes = Number(process.env.H6_SOAK_MINUTES ?? 20);
const phase = process.env.H6_PHASE ?? "both";
if (!["before", "final", "both"].includes(phase)) throw new Error("H6_PHASE_INVALID");
if (!Number.isInteger(cycles) || ![cycles, soakMinutes].every((n) => Number.isFinite(n) && n >= 0))
  throw new Error("H6_CONFIG_INVALID");
if (phase !== "before" && (cycles < 20 || soakMinutes < 20))
  throw new Error("H6_FINAL_REQUIRES_20_CYCLES_AND_20_MINUTES");
const manifest = {
  schemaVersion: "1.0",
  datasetRevision: "synthetic-h6-completion-v4-junction",
  units: "metres",
  frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
  isSynthetic: true,
  chunks: [{ localId: "synthetic-core", bounds: [-270, -270, 270, 270], tier: "core" }],
  assetHashes: {},
  licences: ["CC0-1.0 Synthetic fixture"],
  coverage: { quality: "synthetic", sourceCount: 1 },
};
const provenance = { source: "synthetic", quality: "synthetic" };
const buildings = Array.from({ length: 250 }, (_, i) => {
  const x = ((i % 25) - 12) * 20,
    z = (Math.floor(i / 25) - 4) * 20,
    s = 6;
  return {
    localId: `synthetic-building-${i}`,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x - s, z - s],
          [x + s, z - s],
          [x + s, z + s],
          [x - s, z + s],
          [x - s, z - s],
        ],
      ],
    },
    footprintKind: "footprint",
    wallHeight: 5 + (i % 5),
    levels: 1 + (i % 4),
    roofType: i % 3 === 0 ? "gabled" : "flat",
    provenance,
  };
});
const roads = Array.from({ length: 20 }, (_, i) => ({
  localId: `synthetic-road-${i}`,
  polylineENU:
    i === 19
      ? [
          [10, -260],
          [10, 260],
        ]
      : [
          [-260, (i - 10) * 25],
          [260, (i - 10) * 25],
        ],
  connectorIds: [],
  roadClass: "residential",
  carriagewayWidth: 7,
  sidewalkWidths: [1.5, 1.5],
  elevationLayer: i === 10 ? 1 : 0,
  direction: "both",
  surface: "asphalt",
  provenance,
}));
const fixture = { manifest, world: { manifest, roads, buildings, lots: [] } };
const fixtureText = JSON.stringify(fixture);
const gitEvidence = (cwd) => ({
  head: execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim(),
  dirty: !!execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).trim(),
});
const report = {
  schemaVersion: "2.0",
  syntheticFixture: true,
  startedAt: new Date().toISOString(),
  fixture: {
    sha256: createHash("sha256").update(fixtureText).digest("hex"),
    buildings: 250,
    roads: 20,
    geometryCases: ["same-layer junctions", "different-layer crossing"],
  },
  config: {
    beforeURL,
    finalURL,
    phase,
    cycles,
    soakMinutes,
    viewport: { width: 1280, height: 800 },
    dpr: 1,
  },
  git: { baseline: gitEvidence("/tmp/h6-completion-baseline"), final: gitEvidence(process.cwd()) },
  environment: {},
  latencies: {},
  perf: {},
  screenshots: [],
  lifecycle: {},
  soak: {},
  errors: [],
  method:
    "Only color clears with FRAMEBUFFER_BINDING=null mark main rendered frames; all offscreen/shadow-map clears are excluded and counted separately. Main-frame start intervals collected during explicit held-pointer orbit; no slow-frame cutoff. Not GPU time, RAF cadence, automation latency or device FPS. Same 250-building/20-road package, core camera, viewport/DPR, dry noon and orbit path; one warmup then three rounds. Browser File/DataTransfer input events exercise the actual File.text/parser/UI handler without a driver-retained alias of each detached input; native setInputFiles is separately covered by E2E. File-open wall latency excludes an OS chooser. It, actual File.text read, isolated warm browser parser, CPU mesh construction and render+PNG capture latency are separate single-sample diagnostics, not frame metrics. Baseline uninstrumented phases remain null. Software WebGL is not hardware-tier certification.",
};
await mkdir(outDir, { recursive: true });
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  reducedMotion: "no-preference",
});
context.setDefaultTimeout(30000);
await context.addInitScript(() => {
  // Deterministic synthetic weather particles; unrelated to private geometry.
  let seed = 63721;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  window.__h6RenderProbe = {
    recording: false,
    timestamps: [],
    total: 0,
    excludedOffscreenClears: 0,
    fileReadMs: null,
  };
  const fileText = File.prototype.text;
  File.prototype.text = async function () {
    const start = performance.now();
    try {
      return await fileText.call(this);
    } finally {
      window.__h6RenderProbe.fileReadMs = performance.now() - start;
    }
  };
  const clear = WebGL2RenderingContext.prototype.clear;
  WebGL2RenderingContext.prototype.clear = function (mask) {
    if (mask & this.COLOR_BUFFER_BIT) {
      const p = window.__h6RenderProbe;
      if (this.getParameter(this.FRAMEBUFFER_BINDING) === null) {
        p.total++;
        if (p.recording) p.timestamps.push(performance.now());
      } else if (p.recording) p.excludedOffscreenClears++;
    }
    return clear.call(this, mask);
  };
});
function assert(condition, code) {
  if (!condition) throw new Error(code);
}
async function openFixture(page) {
  const openedAt = performance.now();
  const input = page.getByLabel("Mở gói world");
  assert((await input.count()) === 1, "PACKAGE_INPUT_REQUIRED_NO_BASELINE_FALLBACK");
  // Keep file-input semantics without the driver's retained retargeted-input alias.
  // Native setInputFiles remains covered by the separate integrated E2E suite.
  await input.evaluate((element, text) => {
    const transfer = new DataTransfer();
    transfer.items.add(
      new File([text], "synthetic-h6-completion.json", { type: "application/json" }),
    );
    element.files = transfer.files;
    element.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  }, fixtureText);
  await page.getByText("Đã mở gói cục bộ", { exact: false }).waitFor();
  await page.waitForFunction(
    () =>
      document.querySelector('[data-testid="demo-scene"]')?.getAttribute("data-world-mode") ===
      "private",
  );
  assert((await page.locator("#scene-root canvas").count()) === 1, "ONE_CANVAS_REQUIRED");
  return performance.now() - openedAt;
}
async function goto(page, url, baseline) {
  await page.goto(`${url}/${baseline ? "?local-preview=1" : ""}`);
  await page.waitForFunction(
    () => document.querySelector("#scene-root")?.getAttribute("data-scene-state") === "ready",
    null,
    { timeout: 30000 },
  );
  return openFixture(page);
}
async function reset(page) {
  await page.getByRole("radio", { name: "Diorama", exact: true }).click();
  await page.getByRole("button", { name: "Về nhà mình", exact: true }).click();
  await page.getByRole("tab", { name: "Thời gian", exact: true }).click();
  await page.getByRole("radio", { name: "Dừng", exact: true }).click();
  await page.getByRole("button", { name: /12:00.*Trưa/ }).click();
  await page.waitForTimeout(800);
}
async function drag(page) {
  const b = await page.locator("#scene-root canvas").boundingBox();
  assert(b, "CANVAS_NOT_VISIBLE");
  // Right of left controls, left of the compact package panel; same normalized path.
  await page.mouse.move(b.x + b.width * 0.4, b.y + b.height * 0.42);
  await page.mouse.down();
  for (let i = 0; i < 72; i++) {
    await page.mouse.move(
      b.x + b.width * (0.4 + i * 0.002),
      b.y + b.height * (0.42 + Math.sin(i / 12) * 0.035),
    );
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}
const summary = (a) => {
  const sorted = [...a].sort((x, y) => x - y);
  const pct = (q) => sorted[Math.max(0, Math.ceil(sorted.length * q) - 1)] ?? null;
  return { count: a.length, p50Ms: pct(0.5), p95Ms: pct(0.95), longestMs: sorted.at(-1) ?? null };
};
async function perfRound(page, round) {
  await reset(page);
  await page.evaluate(() => {
    window.__h6RenderProbe.timestamps = [];
    window.__h6RenderProbe.excludedOffscreenClears = 0;
    window.__h6RenderProbe.recording = true;
  });
  await drag(page);
  const raw = await page.evaluate(() => {
    const p = window.__h6RenderProbe;
    p.recording = false;
    const scene = document.querySelector('[data-testid="demo-scene"]');
    return {
      timestamps: p.timestamps,
      excludedOffscreenClears: p.excludedOffscreenClears,
      dataset: scene ? { ...scene.dataset } : {},
    };
  });
  const intervals = raw.timestamps.slice(1).map((t, i) => t - raw.timestamps[i]);
  assert(intervals.length >= 30, "INSUFFICIENT_RENDERED_SAMPLES");
  return {
    round,
    excludedOffscreenClears: raw.excludedOffscreenClears,
    ...summary(intervals),
    intervalsMs: intervals,
    drawCalls: Number(raw.dataset.drawCalls),
    triangles: Number(raw.dataset.triangles),
    runtimeMetrics: raw.dataset,
  };
}
async function runtimeInfo(page) {
  return page.evaluate(() => {
    const gl = document.querySelector("#scene-root canvas")?.getContext("webgl2");
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    return {
      browser: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      gpu: gl
        ? {
            vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : "unknown",
            renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown",
          }
        : null,
    };
  });
}
async function capture(page, name) {
  await page.screenshot({ path: join(outDir, name) });
  report.screenshots.push(name);
}
async function screenshotSet(page, label) {
  await reset(page);
  await capture(page, `${label}-diorama-day.png`);
  await page.getByRole("button", { name: /19:30.*Chợ đêm/ }).click();
  await page.waitForTimeout(100);
  await capture(page, `${label}-diorama-night.png`);
  await reset(page);
  await page.getByRole("tab", { name: "Thời tiết", exact: true }).click();
  await page.getByRole("radio", { name: "Mưa", exact: true }).click();
  await page.waitForTimeout(100);
  await capture(page, `${label}-diorama-rain.png`);
  await page.getByRole("radio", { name: "Nắng nhẹ", exact: true }).click();
  await page.waitForTimeout(100);
  await capture(page, `${label}-diorama-sunny-restored.png`);
  await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
  await capture(page, `${label}-topdown.png`);
  await page.getByRole("radio", { name: "Tầm mắt (demo)", exact: true }).click();
  await capture(page, `${label}-eye-level.png`);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
  await capture(page, `${label}-portrait.png`);
  await page.setViewportSize({ width: 740, height: 390 });
  await capture(page, `${label}-landscape.png`);
  await page.setViewportSize({ width: 1280, height: 800 });
}
let finalPage;
for (const label of phase === "both"
  ? ["baseline", "final"]
  : phase === "before"
    ? ["baseline"]
    : ["final"]) {
  const page = await context.newPage();
  page.on("pageerror", (e) => report.errors.push({ label, error: e.message }));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /THREE\.WebGLProgram: Shader Error|VALIDATE_STATUS/.test(message.text())
    )
      report.errors.push({ label, error: "SHADER_COMPILE_FAILURE" });
  });
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  console.log(`${label}: loading SAME fixture`);
  const fileOpenToFirstSubmittedWorldMs = await goto(
    page,
    label === "baseline" ? beforeURL : finalURL,
    label === "baseline",
  );
  const phases = await page.evaluate(async (text) => {
    const { parseWorldPackage } = await import("/src/world/package.ts");
    const start = performance.now();
    const parsed = parseWorldPackage(text);
    const parserMs = performance.now() - start;
    if (!parsed.ok) throw new Error("ISOLATED_PARSER_REJECTED_FIXTURE");
    const host = document.querySelector('[data-testid="demo-scene"]');
    return {
      fileReadMs: window.__h6RenderProbe.fileReadMs,
      isolatedWarmBrowserParserMs: parserMs,
      cpuMeshConstructionMs:
        host?.dataset.meshBuildLatencyMs === undefined
          ? null
          : Number(host.dataset.meshBuildLatencyMs),
    };
  }, fixtureText);
  report.latencies[label] = { fileOpenToFirstSubmittedWorldMs, ...phases };
  report.environment[label] = await runtimeInfo(page);
  await reset(page);
  await drag(page); // discarded warmup, not evidence samples
  report.perf[label] = [];
  for (let r = 1; r <= 3; r++) {
    const result = await perfRound(page, r);
    report.perf[label].push(result);
    console.log(
      `${label} round${r}: ${result.count} main-frame intervals, ${result.excludedOffscreenClears} offscreen clears excluded, p95=${result.p95Ms.toFixed(2)}ms calls=${result.drawCalls}`,
    );
  }
  const captureClickedAt = performance.now();
  await page.getByRole("button", { name: "Giữ khoảnh khắc", exact: true }).click();
  report.latencies[label].captureButtonWallMs = performance.now() - captureClickedAt;
  report.latencies[label].renderAndPngCaptureMs = await page
    .locator('[data-testid="demo-scene"]')
    .evaluate((host) =>
      host.dataset.captureLatencyMs === undefined ? null : Number(host.dataset.captureLatencyMs),
    );
  await screenshotSet(page, label);
  if (label === "final") finalPage = page;
  else await page.close();
}
if (finalPage) {
  const page = finalPage;
  await reset(page);
  const cdp = await context.newCDPSession(page);
  await cdp.send("Performance.enable");
  async function memory() {
    await cdp.send("HeapProfiler.collectGarbage");
    const data = await cdp.send("Performance.getMetrics");
    const attached = await page.evaluate(() => ({
      attachedCanvases: document.querySelectorAll("#scene-root canvas").length,
      activeWorlds: Number(
        document.querySelector('[data-testid="demo-scene"]')?.getAttribute("data-active-worlds"),
      ),
    }));
    assert(attached.attachedCanvases === 1 && attached.activeWorlds === 1, "MEMORY_SCENE_COUNT");
    return {
      ...Object.fromEntries(
        data.metrics
          .filter((m) =>
            ["JSHeapUsedSize", "Nodes", "Documents", "JSEventListeners"].includes(m.name),
          )
          .map((m) => [m.name, m.value]),
      ),
      ...attached,
    };
  }
  const memorySamples = [{ stage: "before-cycles", ...(await memory()) }];
  report.lifecycle = { requested: cycles, completed: 0 };
  for (let i = 0; i < cycles; i++) {
    for (const name of ["Mặt bằng", "Tầm mắt (demo)", "Diorama"])
      await page.getByRole("radio", { name, exact: true }).click();
    await page.getByRole("button", { name: "Giữ khoảnh khắc", exact: true }).click();
    await page.getByRole("link", { name: "Giới thiệu", exact: true }).click();
    await page.getByRole("link", { name: "Về phố", exact: true }).click();
    await page.waitForFunction(
      () => document.querySelector("#scene-root")?.getAttribute("data-scene-state") === "ready",
    );
    await openFixture(page);
    assert((await page.locator("#scene-root canvas").count()) === 1, "LIFECYCLE_CANVAS_LEAK");
    report.lifecycle.completed++;
    if ((i + 1) % 5 === 0) {
      memorySamples.push({ stage: `cycle-${i + 1}`, ...(await memory()) });
      console.log(`lifecycle ${i + 1}/${cycles}`);
    }
  }
  if (cycles >= 20) {
    report.lifecycle.retainedMemory = assessLifecycleMemory(memorySamples);
    console.log(`retained lifecycle: ${JSON.stringify(report.lifecycle.retainedMemory)}`);
    if (!report.lifecycle.retainedMemory.passed) {
      report.errors.push("LIFECYCLE_RETAINED_GROWTH");
      report.soak = { requestedMinutes: soakMinutes, actualSeconds: 0, memorySamples };
      report.finishedAt = new Date().toISOString();
      await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
      throw new Error("LIFECYCLE_RETAINED_GROWTH");
    }
  }
  const start = Date.now(),
    until = start + soakMinutes * 60000;
  let iteration = 0;
  console.log(`soak: ${soakMinutes} minutes start`);
  while (Date.now() < until) {
    await page.waitForTimeout(5000);
    if (iteration % 6 === 0) {
      await page
        .getByRole("radio", { name: iteration % 12 === 0 ? "Mặt bằng" : "Diorama", exact: true })
        .click();
    }
    assert((await page.locator("#scene-root canvas").count()) === 1, "SOAK_CANVAS_LEAK");
    assert(
      (await page.locator('[data-testid="demo-scene"]').getAttribute("data-active-worlds")) === "1",
      "SOAK_WORLD_COUNT",
    );
    if (iteration % 12 === 0) {
      memorySamples.push({
        stage: `soak-${Math.round((Date.now() - start) / 1000)}s`,
        ...(await memory()),
      });
      console.log(`soak elapsed ${Math.round((Date.now() - start) / 60000)}m/${soakMinutes}m`);
    }
    iteration++;
  }
  memorySamples.push({ stage: "end", ...(await memory()) });
  report.soak = {
    requestedMinutes: soakMinutes,
    actualSeconds: (Date.now() - start) / 1000,
    memorySamples,
    memoryMethod:
      "Chromium CDP Performance JSHeapUsedSize/DOM counts after explicit collectGarbage at each sample; JS retained heap only, not GPU memory. Other test/browser processes may affect environment.",
  };
  if (cycles >= 20) {
    report.soak.retainedMemory = assessLifecycleMemory(memorySamples);
    if (!report.soak.retainedMemory.passed) report.errors.push("SOAK_RETAINED_GROWTH");
  }
}
report.finishedAt = new Date().toISOString();
await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2) + "\n");
await writeFile(join(outDir, "synthetic-fixture.json"), JSON.stringify(fixture, null, 2) + "\n");
await browser.close();
assert(report.errors.length === 0, "QA_ERRORS_PRESENT");
console.log(`QA complete: ${join(outDir, "report.json")}`);
