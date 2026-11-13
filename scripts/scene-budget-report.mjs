// Report-only scene geometry budget for CI. Draw calls and triangles come from the renderer's own
// counters, so they are GPU-independent; frame timings under SwiftShader are NOT a performance
// signal and are deliberately left out. The real-GPU gate stays scripts/desktop-benchmark.mjs.
import { chromium } from "@playwright/test";
import { spawn } from "node:child_process";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const port = Number(process.env.SCENE_BUDGET_PORT ?? 4192);
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("INVALID_SCENE_BUDGET_PORT");
const output = process.argv[2] ?? "test-results/scene-budget";
const enforce = process.env.SCENE_BUDGET_ENFORCE === "1";
const baseURL = `http://127.0.0.1:${port}/`;
const limits = {
  mid: { drawCalls: 200, triangles: 800000 },
  low: { drawCalls: 120, triangles: 400000 },
};
const viewports = [
  { name: "desktop-1440x900", viewport: { width: 1440, height: 900 } },
  { name: "phone-390x844", viewport: { width: 390, height: 844 } },
];

await mkdir(output, { recursive: true });
const server = spawn(
  process.execPath,
  [
    path.resolve("node_modules/vite/bin/vite.js"),
    "--host",
    "127.0.0.1",
    "--port",
    String(port),
    "--strictPort",
  ],
  { stdio: ["ignore", "pipe", "pipe"], windowsHide: true },
);
let serverLog = "";
server.stdout.on("data", (c) => (serverLog = (serverLog + String(c)).slice(-2048)));
server.stderr.on("data", (c) => (serverLog = (serverLog + String(c)).slice(-2048)));

const rows = [];
try {
  const deadline = Date.now() + 90000;
  for (;;) {
    if (server.exitCode !== null) throw Error(`SCENE_BUDGET_SERVER_EXITED\n${serverLog}`);
    const ok = await fetch(baseURL)
      .then((r) => r.ok)
      .catch(() => false);
    if (ok) break;
    if (Date.now() > deadline) throw Error(`SCENE_BUDGET_SERVER_TIMEOUT\n${serverLog}`);
    await new Promise((r) => setTimeout(r, 1000));
  }
  for (const { name, viewport } of viewports) {
    const browser = await chromium.launch({
      headless: true,
      args: ["--enable-unsafe-swiftshader", "--use-gl=angle", "--use-angle=swiftshader"],
    });
    try {
      const page = await browser.newPage({ viewport });
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e).slice(0, 300)));
      await page.goto(baseURL, { waitUntil: "load", timeout: 120000 });
      const scene = page.locator('[data-testid="demo-scene"]');
      await scene.waitFor({ timeout: 120000 });
      await page.waitForFunction(
        () =>
          Number(document.querySelector('[data-testid="demo-scene"]')?.dataset.renderedFrames) >=
          60,
        undefined,
        { timeout: 120000 },
      );
      const ds = await scene.evaluate((el) => ({ ...el.dataset }));
      const drawCalls = Number(ds.drawCalls);
      const triangles = Number(ds.triangles);
      if (!Number.isFinite(drawCalls) || !Number.isFinite(triangles) || drawCalls <= 0)
        throw Error(`SCENE_BUDGET_COUNTERS_MISSING:${name}`);
      rows.push({
        name,
        viewport,
        status: "MEASURED",
        drawCalls,
        triangles,
        worldBuildings: Number(ds.worldBuildings),
        worldRoads: Number(ds.worldRoads),
        lifeAgents: Number(ds.lifeAgents),
        lifeTier: ds.lifeTier ?? null,
        illustrativeInstances: Number(ds.illustrativeInstances),
        memoryGeometries: Number(ds.memoryGeometries),
        withinMid: drawCalls <= limits.mid.drawCalls && triangles <= limits.mid.triangles,
        withinLow: drawCalls <= limits.low.drawCalls && triangles <= limits.low.triangles,
        pageErrors,
      });
    } finally {
      await browser.close();
    }
  }
} finally {
  server.kill();
}

const report = {
  kind: "scene-geometry-budget",
  renderer: "chromium-swiftshader (counts only; frame timings not measured)",
  enforce,
  limits,
  rows,
};
await writeFile(path.join(output, "scene-budget.json"), `${JSON.stringify(report, null, 2)}\n`);
const table = [
  "### Scene geometry budget (report-only)",
  "",
  "| Viewport | Draw calls | Triangles | Life agents | Mid ≤200/800k | Low ≤120/400k |",
  "|---|---:|---:|---:|---|---|",
  ...rows.map(
    (r) =>
      `| ${r.name} | ${r.drawCalls} | ${r.triangles} | ${r.lifeAgents} (${r.lifeTier}) | ${r.withinMid ? "PASS" : "OVER"} | ${r.withinLow ? "PASS" : "OVER"} |`,
  ),
  "",
].join("\n");
console.log(table);
if (process.env.GITHUB_STEP_SUMMARY)
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `${table}\n`);
if (enforce && rows.some((r) => !r.withinMid)) {
  console.error("SCENE_BUDGET_OVER_MID_LIMIT");
  process.exit(1);
}
