// P8 only; all packages and locations below are synthetic. Never load a private file here.
import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { assessLifecycleMemory } from "./h6-lifecycle-memory.mjs";
const phase = process.env.P8_PHASE ?? "final",
  cycles = Number(process.env.P8_CYCLES ?? 20),
  soakMinutes = Number(process.env.P8_SOAK_MINUTES ?? 20);
if (
  !["before", "final"].includes(phase) ||
  !Number.isFinite(cycles) ||
  !Number.isFinite(soakMinutes)
)
  throw Error("INVALID_CONFIG");
if (phase === "final" && (cycles < 20 || soakMinutes < 20))
  throw Error("P8_FINAL_REQUIRES_20_CYCLES_AND_20_MINUTES");
const url =
  phase === "before"
    ? (process.env.P8_BEFORE_URL ?? "http://127.0.0.1:4180")
    : (process.env.P8_FINAL_URL ?? "http://127.0.0.1:4178");
const cwd =
  phase === "before" ? (process.env.P8_BEFORE_CWD ?? "/workspace/home-3d-p7") : process.cwd();
const out = resolve(process.env.P8_OUTPUT_DIR ?? `test-results/p8-${phase}`);
await mkdir(out, { recursive: true });
const provenance = { source: "synthetic", quality: "synthetic" };
const manifest = {
  schemaVersion: "1.0",
  datasetRevision: "synthetic-p8-atmosphere-v2",
  units: "metres",
  frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
  isSynthetic: true,
  chunks: [{ localId: "p8-core", bounds: [-270, -270, 270, 270], tier: "core" }],
  assetHashes: {},
  licences: ["CC0-1.0 Synthetic fixture"],
  coverage: { quality: "synthetic", sourceCount: 1 },
};
const buildings = Array.from({ length: 64 }, (_, i) => {
  const x = ((i % 8) - 3.5) * 26,
    z = (Math.floor(i / 8) - 3.5) * 26,
    s = 7;
  return {
    localId: `p8-synthetic-building-${i}`,
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
const roads = Array.from({ length: 10 }, (_, i) => ({
  localId: `p8-synthetic-road-${i}`,
  polylineENU:
    i === 9
      ? [
          [0, -220],
          [0, 220],
        ]
      : [
          [-220, (i - 5) * 38],
          [220, (i - 5) * 38],
        ],
  connectorIds: [],
  roadClass: "residential",
  carriagewayWidth: 7,
  sidewalkWidths: [1.5, 1.5],
  elevationLayer: i === 5 ? 1 : 0,
  direction: "both",
  surface: "asphalt",
  provenance,
}));
const trees = [
  { localId: "p8-synthetic-tree-a", position: [-30, -10], height: 5, provenance },
  { localId: "p8-synthetic-tree-b", position: [30, -10], height: 5, provenance },
];
const props = [
  { localId: "p8-synthetic-light", position: [26, 0], kind: "street_light", provenance },
];
const fixture = { manifest, world: { manifest, roads, buildings, lots: [], trees, props } },
  text = JSON.stringify(fixture);
const git = () => ({
  head: execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim(),
  status: execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" }).trim(),
});
const assert = (value, reason) => {
  if (!value) throw Error(reason);
};
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
const stats = (values) => {
  const a = [...values].sort((x, y) => x - y);
  return {
    count: a.length,
    p50Ms: a[Math.max(0, Math.ceil(a.length * 0.5) - 1)] ?? null,
    p95Ms: a[Math.max(0, Math.ceil(a.length * 0.95) - 1)] ?? null,
    longestMs: a.at(-1) ?? null,
    over50Ms: a.filter((x) => x > 50).length,
  };
};
const report = {
  phase,
  startedAt: new Date().toISOString(),
  git: git(),
  fixture: {
    sha256: hash(text),
    buildings: 64,
    roads: 10,
    trees: 2,
    props: 1,
    date: "2026-06-21",
    time: "12:00",
    viewport: { width: 1440, height: 900 },
    dpr: 1,
    camera: { mode: "diorama", heading: 32, zoom: 1 },
  },
  environment: {},
  perf: [],
  latencies: {},
  screenshots: [],
  pixelComparisons: [],
  lifecycle: {},
  soak: {},
  errors: [],
  blockedExternalRequests: [],
  method:
    "Default-framebuffer color clears followed by microtask completion mark actual synchronous rendered submissions; shadow/offscreen passes excluded. Held pointer warmup + three rounds; every slow interval retained. Click-to-first subsequent completed main-frame submission with matching changed state; PNG canvas hashes establish pixel changes independently. Parse/build/idle/capture excluded from interaction metrics. CDP JS/DOM after explicit GC is retained-memory estimate, not GPU memory. SwiftShader is not physical GPU certification.",
};
const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
  ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
    ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
    : {}),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: "no-preference",
});
context.setDefaultTimeout(30000);
await context.addInitScript(() => {
  let seed = 81273;
  Math.random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const p = (window.__p8Probe = {
    recording: false,
    timestamps: [],
    offscreen: 0,
    armed: false,
    requestedAt: null,
    expected: null,
    firstFrame: null,
    links: 0,
  });
  const clear = WebGL2RenderingContext.prototype.clear;
  WebGL2RenderingContext.prototype.clear = function (mask) {
    const main =
      !!(mask & this.COLOR_BUFFER_BIT) && this.getParameter(this.FRAMEBUFFER_BINDING) === null;
    if (mask & this.COLOR_BUFFER_BIT) {
      if (!main && p.recording) p.offscreen++;
      if (main)
        queueMicrotask(() => {
          const now = performance.now();
          if (p.recording) p.timestamps.push(now);
          if (p.requestedAt !== null && p.firstFrame === null) {
            const host = document.querySelector('[data-testid="demo-scene"]');
            const matches =
              p.expected === null ||
              Object.entries(p.expected).every(([key, value]) => host?.dataset[key] === value);
            if (matches) p.firstFrame = now;
          }
        });
    }
    return clear.call(this, mask);
  };
  const link = WebGL2RenderingContext.prototype.linkProgram;
  WebGL2RenderingContext.prototype.linkProgram = function (program) {
    p.links++;
    return link.call(this, program);
  };
  document.addEventListener(
    "click",
    () => {
      if (p.armed) {
        p.requestedAt = performance.now();
        p.firstFrame = null;
        p.armed = false;
      }
    },
    true,
  );
});
const page = await context.newPage();
const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");
page.on("pageerror", (e) => report.errors.push(e.message));
page.on("console", (m) => {
  if (/Shader Error|VALIDATE_STATUS|FRAGMENT shader|VERTEX shader/.test(m.text()))
    report.errors.push(m.text());
});
await page.route("**/*", (route) => {
  const u = new URL(route.request().url());
  if (
    ["127.0.0.1", "localhost", "::1"].includes(u.hostname) ||
    ["data:", "blob:"].includes(u.protocol)
  )
    return route.continue();
  report.blockedExternalRequests.push({ host: u.hostname, path: u.pathname });
  return route.abort();
});
const save = async (name = "report.progress.json") =>
  writeFile(join(out, name), JSON.stringify(report, null, 2) + "\n");
async function openFixture() {
  await page.getByLabel("Mở gói world").evaluate((input, content) => {
    const dt = new DataTransfer();
    dt.items.add(new File([content], "p8-synthetic-atmosphere.json", { type: "application/json" }));
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  }, text);
  await page.getByText("Đã mở gói cục bộ", { exact: false }).waitFor();
}
async function patch(value) {
  await page.evaluate(async (next) => {
    const moduleUrl = performance
      .getEntriesByType("resource")
      .find((entry) => new URL(entry.name).pathname === "/src/state/appStore.ts")?.name;
    if (!moduleUrl) throw new Error("ACTIVE_STORE_MODULE_MISSING");
    const { useAppStore } = await import(moduleUrl);
    useAppStore.setState(next);
  }, value);
}
async function collapse() {
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
}
async function reset() {
  await patch({
    selectedDate: "2026-06-21",
    timeOfDayMinutes: 720,
    timeSpeed: 0,
    realTimeEnabled: false,
    weather: "sunny",
    festival: "normal",
    festivalAuto: false,
    season: "dry",
    floodLevel: 0,
    atmosphereEnabled: true,
    viewMode: "diorama",
    heading: 32,
    zoom: 1,
  });
  await page.getByRole("tab", { name: "Thời gian", exact: true }).click();
  await page.waitForTimeout(300);
}
async function drag() {
  const box = await page.locator("#scene-root canvas").boundingBox();
  assert(box, "CANVAS_MISSING");
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.38);
  await page.mouse.down();
  for (let i = 0; i < 72; i++) {
    await page.mouse.move(
      box.x + box.width * (0.4 + i * 0.002),
      box.y + box.height * (0.38 + Math.sin(i / 12) * 0.035),
    );
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}
async function memory(stage) {
  await cdp.send("HeapProfiler.collectGarbage");
  const metrics = await cdp.send("Performance.getMetrics");
  const counts = await page.evaluate(() => ({
    attachedCanvases: document.querySelectorAll("#scene-root canvas").length,
    activeWorlds: Number(
      document.querySelector('[data-testid="demo-scene"]')?.dataset.activeWorlds,
    ),
  }));
  assert(counts.attachedCanvases === 1 && counts.activeWorlds === 1, "MEMORY_SCENE_COUNT");
  return {
    stage,
    ...Object.fromEntries(
      metrics.metrics
        .filter((m) =>
          ["JSHeapUsedSize", "Nodes", "Documents", "JSEventListeners"].includes(m.name),
        )
        .map((m) => [m.name, m.value]),
    ),
    ...counts,
  };
}
async function option(name, tab, expected) {
  await page.getByRole("tab", { name: tab, exact: true }).click();
  const beforeLinks = await page.evaluate(() => window.__p8Probe.links);
  await page.evaluate((e) => {
    const p = window.__p8Probe;
    p.armed = true;
    p.requestedAt = null;
    p.firstFrame = null;
    p.expected = e;
  }, expected);
  await page.getByRole("radio", { name, exact: true }).click();
  await page.waitForFunction(() => Number.isFinite(window.__p8Probe.firstFrame));
  const result = await page.evaluate(() => {
    const p = window.__p8Probe;
    return { latencyMs: p.firstFrame - p.requestedAt, links: p.links, expected: p.expected };
  });
  return { ...result, newProgramLinks: result.links - beforeLinks };
}
async function capturePixels() {
  const data = await page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .find((e) => new URL(e.name).pathname === "/src/engine/capture.ts")?.name;
    if (!url) throw Error("CAPTURE_MODULE_MISSING");
    return (await import(url)).captureDemoFrame();
  });
  assert(typeof data === "string" && data.startsWith("data:image/png;base64,"), "CAPTURE_FAILED");
  return Buffer.from(data.split(",")[1], "base64");
}
async function shot(name, patchValue, tab = "Thời tiết") {
  await patch(patchValue);
  await page.getByRole("tab", { name: tab, exact: true }).click();
  await page.waitForTimeout(100);
  const canvas = await capturePixels();
  const filename = `${phase}-${name}.png`;
  await writeFile(join(out, filename), canvas);
  await page.screenshot({ path: join(out, `${phase}-${name}-ui.png`) });
  report.screenshots.push({ name, file: filename, canvasSha256: hash(canvas), state: patchValue });
  return hash(canvas);
}
try {
  await page.goto(`${url}/?local-preview=1`);
  await page.waitForFunction(
    () => document.querySelector("#scene-root")?.dataset.sceneState === "ready",
  );
  await openFixture();
  await collapse();
  await reset();
  report.environment = await page.evaluate(() => {
    const gl = document.querySelector("#scene-root canvas").getContext("webgl2"),
      ext = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      userAgent: navigator.userAgent,
      viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio },
      renderer: {
        vendor: ext ? gl.getParameter(ext.UNMASKED_VENDOR_WEBGL) : "unknown",
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown",
      },
    };
  });
  await drag();
  for (let round = 1; round <= 3; round++) {
    await reset();
    await page.evaluate(() => {
      const p = window.__p8Probe;
      p.timestamps = [];
      p.offscreen = 0;
      p.recording = true;
    });
    await drag();
    const raw = await page.evaluate(() => {
      const p = window.__p8Probe;
      p.recording = false;
      return {
        timestamps: p.timestamps,
        offscreen: p.offscreen,
        dataset: { ...document.querySelector('[data-testid="demo-scene"]').dataset },
      };
    });
    const intervals = raw.timestamps.slice(1).map((t, i) => t - raw.timestamps[i]);
    assert(intervals.length >= 30, "INSUFFICIENT_RENDERED_SAMPLES");
    report.perf.push({
      round,
      ...stats(intervals),
      intervalsMs: intervals,
      excludedOffscreenClears: raw.offscreen,
      drawCalls: Number(raw.dataset.drawCalls),
      triangles: Number(raw.dataset.triangles),
    });
    console.log(`P8 ${phase} perf ${round}/3 p95=${report.perf.at(-1).p95Ms}`);
  }
  if (phase === "final") {
    await reset();
    for (const [name, tab, expected] of [
      ["Nhiều mây", "Thời tiết", { weather: "cloudy" }],
      ["Mưa", "Thời tiết", { weather: "rain" }],
      ["Mưa to", "Thời tiết", { weather: "storm" }],
      ["Nắng nhẹ", "Thời tiết", { weather: "sunny" }],
      ["Tết", "Lễ hội", { festival: "tet" }],
      ["Trung Thu", "Lễ hội", { festival: "midautumn" }],
      ["Thường ngày", "Lễ hội", { festival: "normal" }],
    ]) {
      report.latencies[name] = await option(name, tab, expected);
    }
    await reset();
    const day = await shot("day", {});
    const sunset = await shot("sunset", { timeOfDayMinutes: 1080 });
    const night = await shot("night", { timeOfDayMinutes: 1380 });
    await reset();
    const cloudy = await shot("cloudy", { weather: "cloudy" });
    const rain = await shot("rain", { weather: "rain" });
    const storm = await shot("storm", { weather: "storm" });
    const dry = await shot("dry-restored", { weather: "sunny" });
    const wetSeason = await shot("wet-season", { season: "wet" });
    const drySeason = await shot("dry-season", { season: "dry" });
    const flood = await shot("flood", { floodLevel: 0.8 });
    await reset();
    const tet = await shot("tet", { festival: "tet", festivalAuto: false }, "Lễ hội");
    const mid = await shot("midautumn", { festival: "midautumn" }, "Lễ hội");
    await shot("christmas", { festival: "christmas" }, "Lễ hội");
    await shot("national", { festival: "national" }, "Lễ hội");
    await shot("reunification", { festival: "reunification" }, "Lễ hội");
    const off = await shot("layer-off", { atmosphereEnabled: false }, "Thời tiết");
    await reset();
    const plan = await shot("topdown", { viewMode: "topdown" });
    const planEffects = await shot("topdown-effects-neutral", {
      weather: "storm",
      season: "wet",
      festival: "tet",
      floodLevel: 1,
      timeOfDayMinutes: 1380,
    });
    assert(plan === planEffects, "PLAN_NOT_NEUTRAL");
    await reset();
    await shot("eye-level", { viewMode: "walk" });
    for (const [name, a, b] of [
      ["day/sunset", day, sunset],
      ["day/night", day, night],
      ["sunny/cloudy", day, cloudy],
      ["rain/storm", rain, storm],
      ["dry/wet-season", drySeason, wetSeason],
      ["flood", drySeason, flood],
      ["tet/midautumn", tet, mid],
      ["layer-off", mid, off],
    ]) {
      assert(a !== b, `PIXELS_UNCHANGED:${name}`);
      report.pixelComparisons.push({ name, changed: true });
    }
    assert(day === dry, "DRY_WET_DRY_NOT_RESTORED");
    report.pixelComparisons.push({ name: "dry-wet-dry", exactRestoration: true });
    await reset();
    for (const [name, width, height] of [
      ["mobile-portrait", 390, 844],
      ["mobile-landscape", 740, 390],
    ]) {
      await page.setViewportSize({ width, height });
      await page.getByRole("tab", { name: "Thời tiết", exact: true }).click();
      await shot(name, { weather: "rain" });
    }
    await page.setViewportSize({ width: 1440, height: 900 });
    await reset();
    const samples = [await memory("before-cycles")];
    report.lifecycle = { requested: cycles, completed: 0 };
    for (let i = 0; i < cycles; i++) {
      await patch({
        weather: i % 2 ? "rain" : "storm",
        season: i % 2 ? "dry" : "wet",
        festivalAuto: false,
        festival: i % 2 ? "tet" : "midautumn",
        floodLevel: (i % 3) / 3,
      });
      for (const mode of ["topdown", "walk", "diorama"]) await patch({ viewMode: mode });
      await page.getByRole("button", { name: "Giữ khoảnh khắc", exact: true }).click();
      await page.getByRole("link", { name: "Giới thiệu", exact: true }).click();
      await page.getByRole("link", { name: "Về phố", exact: true }).click();
      await page.waitForFunction(
        () => document.querySelector("#scene-root")?.dataset.sceneState === "ready",
      );
      await openFixture();
      await collapse();
      await reset();
      report.lifecycle.completed++;
      if ((i + 1) % 5 === 0) {
        samples.push(await memory(`cycle-${i + 1}`));
        console.log(`P8 lifecycle ${i + 1}/${cycles}`);
        await save();
      }
    }
    report.lifecycle.memorySamples = [...samples];
    report.lifecycle.retainedMemory = assessLifecycleMemory(samples);
    assert(report.lifecycle.retainedMemory.passed, "LIFECYCLE_RETAINED_GROWTH_FAILED");
    const start = Date.now(),
      end = start + soakMinutes * 60000;
    let iteration = 0;
    while (Date.now() < end) {
      await page.waitForTimeout(5000);
      await patch({
        weather: iteration % 3 === 0 ? "rain" : "sunny",
        festivalAuto: false,
        festival: iteration % 2 ? "tet" : "normal",
        viewMode: iteration % 4 === 0 ? "topdown" : "diorama",
        floodLevel: (iteration % 3) / 3,
      });
      if (iteration % 6 === 0)
        await page.getByRole("button", { name: "Giữ khoảnh khắc", exact: true }).click();
      if (iteration % 12 === 0) {
        samples.push(await memory(`soak-${Math.round((Date.now() - start) / 1000)}s`));
        report.soak = {
          requestedMinutes: soakMinutes,
          elapsedSeconds: (Date.now() - start) / 1000,
          memorySamples: samples,
        };
        await save();
        console.log(`P8 soak ${Math.round((Date.now() - start) / 1000)}s/${soakMinutes * 60}s`);
      }
      iteration++;
    }
    samples.push(await memory("end"));
    report.soak = {
      requestedMinutes: soakMinutes,
      actualSeconds: (Date.now() - start) / 1000,
      memorySamples: samples,
      retainedMemory: assessLifecycleMemory(samples),
    };
    assert(report.soak.retainedMemory.passed, "SOAK_RETAINED_GROWTH_FAILED");
  } else {
    report.latencies = { status: "NOT_APPLICABLE_P7_BASELINE" };
  }
  report.performanceTargets = {
    interactionFrameMax50Ms: {
      passed: report.perf.every((row) => row.longestMs <= 50),
      targetMs: 50,
    },
    optionUnder100Ms:
      phase === "final"
        ? {
            passed: Object.values(report.latencies).every((row) => row.latencyMs < 100),
            targetMs: 100,
          }
        : { status: "NOT_APPLICABLE_P7_BASELINE" },
    physicalGpu: "NOT_VERIFIED",
  };
  report.finishedAt = new Date().toISOString();
  report.gitAfter = git();
  assert(
    report.git.head === report.gitAfter.head && report.git.status === report.gitAfter.status,
    "SOURCE_CHANGED_DURING_QA",
  );
  assert(report.errors.length === 0, "P8_QA_RUNTIME_ERRORS");
  report.status =
    report.performanceTargets.interactionFrameMax50Ms.passed &&
    (phase === "before" || report.performanceTargets.optionUnder100Ms.passed)
      ? "PASS"
      : "COMPLETED_WITH_PERFORMANCE_LIMITATIONS";
  await writeFile(join(out, "synthetic-fixture.json"), JSON.stringify(fixture, null, 2) + "\n");
  await save("report.json");
  console.log(`P8 ${phase} QA PASS: ${join(out, "report.json")}`);
} catch (error) {
  report.status = "FAIL";
  report.failure = String(error);
  await save("report.failed.json");
  await page.screenshot({ path: join(out, "failure.png") }).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
