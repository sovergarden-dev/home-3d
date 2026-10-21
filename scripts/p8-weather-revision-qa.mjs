// Synthetic, loopback-only regression evidence; no real provider traffic or deployment.
import { chromium, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { P8_FIXTURE } from "../tests/e2e/helpers/p8-fixture.ts";
import { assessLifecycleMemory } from "./h6-lifecycle-memory.mjs";

const base = process.env.BASE_URL ?? "http://127.0.0.1:4178";
const out = resolve(process.env.OUT_DIR ?? "test-results/p8-weather-revision");
const diagnostic = process.argv.includes("--diagnostic");
const cycles = Number(process.env.CYCLES ?? (diagnostic ? 2 : 20));
const minutes = Number(process.env.SOAK_MINUTES ?? (diagnostic ? 0 : 20));
if (
  !Number.isInteger(cycles) ||
  cycles < (diagnostic ? 2 : 20) ||
  !Number.isFinite(minutes) ||
  minutes < (diagnostic ? 0 : 20)
)
  throw Error("INVALID_CONFIG");
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const origin = { latitude: 10.123456, longitude: 106.654321, altitude: 0 };
const text = JSON.stringify({
  manifest: P8_FIXTURE.manifest,
  world: P8_FIXTURE.world,
  centerConfirmation: {
    status: "confirmed",
    provenance: { source: "owner", method: "explicit-user-confirmation" },
  },
});
const companion = JSON.stringify({ schemaVersion: "1.0", packageSha256: sha256(text), origin });
const report = {
  status: "RUNNING",
  mode: diagnostic ? "DIAGNOSTIC" : "FINAL",
  source: {
    head: git("rev-parse", "HEAD"),
    worktree: git("status", "--porcelain"),
    harnessSha256: sha256(await readFile(new URL(import.meta.url))),
    fixtureSha256: sha256(text),
  },
  startedAt: new Date().toISOString(),
  cycles: { requested: cycles, completed: 0 },
  weather: { requests: 0, ready: 0, stale: 0, retry: 0, off: 0, hidden: 0, cancel: 0 },
  samples: [],
  errors: [],
  blockedExternal: [],
};
await mkdir(out, { recursive: true });
const save = () => writeFile(join(out, "report.json"), JSON.stringify(report, null, 2) + "\n");
const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  reducedMotion: "reduce",
  deviceScaleFactor: 1,
});
const page = await context.newPage();
let responseTime = "2026-10-21T12:00";
await context.route("**/*", async (route) => {
  const url = new URL(route.request().url());
  if (url.origin === new URL(base).origin) return route.continue();
  if (url.origin === "https://api.open-meteo.com" && url.pathname === "/v1/forecast") {
    report.weather.requests++;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        timezone: "Asia/Ho_Chi_Minh",
        utc_offset_seconds: 25200,
        current: { time: responseTime, temperature_2m: 29, weather_code: 1 },
        current_units: { temperature_2m: "°C", weather_code: "wmo code" },
      }),
    });
  }
  if (url.hostname === "fonts.googleapis.com")
    return route.fulfill({ contentType: "text/css", body: "" });
  report.blockedExternal.push({ host: url.host, path: url.pathname });
  return route.abort();
});
page.on("pageerror", (error) => report.errors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") report.errors.push(message.text());
});
const cdp = await context.newCDPSession(page);
await cdp.send("Performance.enable");
const trigger = page.getByRole("button", { name: "Thời tiết thật", exact: true });
const dialog = page.getByRole("dialog");
const top = page.locator(".h6-top-info");
const scene = page.getByTestId("demo-scene");
async function openPackage() {
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-weather.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await page.getByLabel("Mở tham chiếu địa lý").setInputFiles({
    name: "synthetic-reference.json",
    mimeType: "application/json",
    buffer: Buffer.from(companion),
  });
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready");
  await page.getByRole("tab", { name: "Thời tiết", exact: true }).click();
  await expect(trigger).toBeEnabled();
}
async function manual() {
  await expect(top).not.toContainText("Thời tiết hiện tại");
  await expect(top).toContainText("Mưa");
  await expect(scene).toHaveAttribute("data-weather", "rain");
}
async function ready() {
  await expect(top).toContainText("Thời tiết hiện tại");
  await expect(scene).toHaveAttribute("data-weather", "sunny");
}
async function setClock(localTime) {
  await page.clock.setSystemTime(new Date(localTime));
  responseTime = new Date(new Date(localTime).getTime() + 7 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 16);
}
async function cycle(index) {
  await setClock("2026-10-21T05:00:00Z");
  await openPackage();
  await page.getByRole("radio", { name: "Mưa", exact: true }).click();
  const before = report.weather.requests;
  await trigger.click();
  await dialog.getByRole("button", { name: "Hủy", exact: true }).click();
  expect(report.weather.requests).toBe(before);
  report.weather.cancel++;
  await trigger.click();
  await dialog.getByRole("button", { name: "Cho phép thời tiết hiện tại", exact: true }).click();
  await ready();
  expect(report.weather.requests).toBe(before + 1);
  report.weather.ready++;
  await page.clock.fastForward(15 * 60 * 1000 + 1);
  await manual();
  expect(report.weather.requests).toBe(before + 1);
  await trigger.click();
  await expect(dialog.getByRole("status")).toContainText("Dữ liệu cũ");
  report.weather.stale++;
  if (index <= 2) await page.screenshot({ path: join(out, `stale-cycle-${index}.png`) });
  responseTime = await page.evaluate(() =>
    new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().slice(0, 16),
  );
  await dialog.getByRole("button", { name: "Thử lại thời tiết hiện tại", exact: true }).click();
  await ready();
  expect(report.weather.requests).toBe(before + 2);
  report.weather.retry++;
  // Synthetic visibility transition while live, not a no-op event on a visible tab.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await manual();
  report.weather.hidden++;
  await page.evaluate(() => {
    delete document.visibilityState;
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await trigger.click();
  await dialog.getByRole("button", { name: "Cho phép thời tiết hiện tại", exact: true }).click();
  await ready();
  await trigger.click();
  await dialog.getByRole("button", { name: "Dùng thời tiết mô phỏng", exact: true }).click();
  await manual();
  report.weather.off++;
  expect(report.weather.requests).toBe(before + 3);
  await page.getByRole("button", { name: "Giữ khoảnh khắc", exact: true }).click();
  await expect(page.getByText("Đã giữ lại khoảnh khắc này", { exact: true }).last()).toBeVisible();
  report.weather.capture = (report.weather.capture ?? 0) + 1;
  await page.getByRole("link", { name: "Giới thiệu", exact: true }).click();
  await page.getByRole("link", { name: "Về phố", exact: true }).click();
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready");
  await page.getByRole("tab", { name: "Thời tiết", exact: true }).click();
  await manual();
}
async function metric(stage) {
  await page.waitForTimeout(300);
  await cdp.send("HeapProfiler.collectGarbage");
  const metrics = Object.fromEntries(
    (await cdp.send("Performance.getMetrics")).metrics.map(({ name, value }) => [name, value]),
  );
  report.samples.push({
    stage,
    Documents: metrics.Documents,
    Nodes: metrics.Nodes,
    JSEventListeners: metrics.JSEventListeners,
    JSHeapUsedSize: metrics.JSHeapUsedSize,
    wallClock: new Date().toISOString(),
  });
}
try {
  await page.goto(`${base}/?local-preview=1`);
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready");
  // Install only after hydration: server and browser must not disagree during initial render.
  await page.clock.install();
  await setClock("2026-10-21T05:00:00Z");
  await page.getByRole("tab", { name: "Thời gian", exact: true }).click();
  await page.getByLabel("Ngày đang xem").fill("2026-10-21");
  for (let i = 1; i <= cycles; i++) {
    await cycle(i);
    report.cycles.completed = i;
    if (i % 5 === 0 || i === cycles) {
      await metric(`cycle-${i}`);
      await save();
      console.log(`P8 weather cycles ${i}/${cycles}`);
    }
  }
  if (!diagnostic) {
    report.lifecycle = assessLifecycleMemory(report.samples);
    expect(report.lifecycle.passed).toBe(true);
    const start = Date.now();
    let iteration = 0;
    while (Date.now() - start < minutes * 60000) {
      await new Promise((resolve) => setTimeout(resolve, 5000));
      await cycle(++iteration + cycles);
      if (iteration % 6 === 0) {
        await metric(`soak-${Math.round((Date.now() - start) / 1000)}s`);
        await save();
        console.log(`P8 weather soak ${Math.round((Date.now() - start) / 1000)}s/${minutes * 60}s`);
      }
    }
    await metric("soak-final");
    report.soak = {
      actualSeconds: (Date.now() - start) / 1000,
      iterations: iteration,
      retainedMemory: assessLifecycleMemory(report.samples),
    };
    expect(report.soak.actualSeconds).toBeGreaterThanOrEqual(minutes * 60);
    expect(report.soak.retainedMemory.passed).toBe(true);
  }
  expect(report.errors).toEqual([]);
  expect(report.blockedExternal).toEqual([]);
  report.source.afterHead = git("rev-parse", "HEAD");
  report.source.afterWorktree = git("status", "--porcelain");
  expect(report.source.afterHead).toBe(report.source.head);
  expect(report.source.afterWorktree).toBe(report.source.worktree);
  report.status = "PASS";
} catch (error) {
  report.status = "FAIL";
  report.failure = String(error.stack ?? error);
  await page.screenshot({ path: join(out, "failure.png") }).catch(() => {});
  console.error(report.failure);
  process.exitCode = 1;
} finally {
  report.finishedAt = new Date().toISOString();
  await save();
  await browser.close();
}
console.log(`P8 weather ${report.mode}: ${report.status}; ${join(out, "report.json")}`);
