import { expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { launchBenchmark } from "./benchmark-browser.mjs";
import { text as fixtureText } from "./p8-benchmark-fixture.mjs";

const family = process.env.CONTROL_FAMILY ?? "p8";
const rounds = Number(process.env.CONTROL_ROUNDS ?? 30);
const port = Number(process.env.CONTROL_PORT ?? 4188);
if (!["p8", "p9"].includes(family) || !Number.isInteger(rounds) || rounds < 1)
  throw Error("INVALID_CONTROL_BENCHMARK");
if (process.env.BENCH_GPU !== "real") throw Error("REAL_GPU_REQUIRED_FOR_M2_ACCEPTANCE");
const output = path.resolve(process.argv[2] ?? `test-results/${family}-controls`);
await mkdir(output, { recursive: true });
const scriptSha256 = createHash("sha256")
  .update(await readFile(new URL(import.meta.url)))
  .digest("hex");
const { browser, dpr, environment } = await launchBenchmark(["--mute-audio"]);
const rows = [];
const frameRounds = [];
const errors = [];
let observed;
const stats = (values) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b),
    n = sorted.length;
  return {
    n,
    min: sorted[0],
    p50: n % 2 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2,
    p95: sorted[Math.ceil(n * 0.95) - 1],
    max: sorted[n - 1],
  };
};
async function open() {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: dpr,
    reducedMotion: "reduce",
  });
  page.on("pageerror", () => errors.push("PAGE_ERROR"));
  await page.route("**/*", (route) =>
    ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname) ||
    /^(data|blob):/.test(route.request().url())
      ? route.continue()
      : route.abort(),
  );
  await page.addInitScript(() => {
    let seed = 81273;
    Math.random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    window.__controlImport = (pathname) => {
      const entry = [...performance.getEntriesByType("resource")]
        .reverse()
        .find((item) => new URL(item.name).pathname === pathname);
      return import(entry?.name ?? new URL(pathname, location.href).href);
    };
    let active = null,
      context = null,
      fence = null,
      links = 0;
    let recordingFrames = false,
      frameTimes = [];
    const clear = WebGL2RenderingContext.prototype.clear;
    WebGL2RenderingContext.prototype.clear = function (mask) {
      const main =
        !!(mask & this.COLOR_BUFFER_BIT) && this.getParameter(this.FRAMEBUFFER_BINDING) === null;
      const result = clear.call(this, mask);
      if (main)
        queueMicrotask(() => {
          if (recordingFrames) frameTimes.push(performance.now());
          if (!active?.start || fence) return;
          const host = document.querySelector('[data-testid="demo-scene"]');
          if (
            !Object.entries(active.expected).every(([key, value]) => host?.dataset[key] === value)
          )
            return;
          context = this;
          fence = this.fenceSync(this.SYNC_GPU_COMMANDS_COMPLETE, 0);
          if (!fence) {
            active.error = "GPU_FENCE_UNAVAILABLE";
            return;
          }
          this.flush();
          active.submittedAt = performance.now();
        });
      return result;
    };
    const link = WebGL2RenderingContext.prototype.linkProgram;
    WebGL2RenderingContext.prototype.linkProgram = function (...args) {
      links++;
      return link.apply(this, args);
    };
    for (const type of ["click", "input", "change", "keydown"])
      document.addEventListener(
        type,
        () => {
          if (active && active.start === null) active.start = performance.now();
        },
        true,
      );
    window.__controlProbe = {
      beginFrames() {
        frameTimes = [];
        recordingFrames = true;
      },
      endFrames() {
        recordingFrames = false;
        return frameTimes;
      },
      arm(expected) {
        active = {
          expected,
          start: null,
          submittedAt: null,
          completedAt: null,
          linksAtStart: links,
          error: null,
        };
      },
      poll() {
        if (fence && active.completedAt === null) {
          const status = context.clientWaitSync(fence, 0, 0);
          if (status === context.WAIT_FAILED) active.error = "GPU_FENCE_WAIT_FAILED";
          if (status === context.ALREADY_SIGNALED || status === context.CONDITION_SATISFIED)
            active.completedAt = performance.now();
        }
        return active ? { ...active, newProgramLinks: links - active.linksAtStart } : null;
      },
      end() {
        if (fence) context.deleteSync(fence);
        fence = null;
        active = null;
      },
    };
  });
  await page.goto(`http://127.0.0.1:${port}/?local-preview=1`);
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 60000,
  });
  observed = await environment(page);
  if (family === "p8") {
    await page.getByLabel("Mở gói world").setInputFiles({
      name: "synthetic-p8-controls.json",
      mimeType: "application/json",
      buffer: Buffer.from(fixtureText),
    });
    await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
  }
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await page.evaluate(async () => {
    const { useAppStore } = await window.__controlImport("/src/state/appStore.ts");
    const snapshot = (
      await window.__controlImport("/src/world/privateWorldSession.ts")
    ).worldDataProvider.getSnapshot();
    if (!("world" in snapshot) || !snapshot.world.manifest.isSynthetic)
      throw Error("SYNTHETIC_FIXTURE_REQUIRED");
    useAppStore.setState({
      selectedDate: "2026-06-21",
      timeOfDayMinutes: 720,
      timeSpeed: 0,
      realTimeEnabled: false,
      lifeEnabled: true,
      festivalAuto: false,
      festival: "normal",
      weather: "sunny",
      season: "dry",
      floodLevel: 0,
      heading: 32,
      zoom: 1,
      atmosphereEnabled: true,
    });
  });
  await page.waitForTimeout(5000);
  return page;
}
async function action(page, round, name, expected, perform) {
  await page.evaluate((expected) => window.__controlProbe.arm(expected), expected);
  await perform();
  const measurement = await page.evaluate(async () => {
    const frame = () =>
      new Promise((resolve) => requestAnimationFrame(() => resolve(performance.now())));
    const deadline = performance.now() + 5000;
    let observation;
    let reflectedAt = null;
    while (performance.now() < deadline) {
      await frame();
      observation = window.__controlProbe.poll();
      if (observation?.error) break;
      if (observation?.completedAt !== null && observation?.completedAt !== undefined) {
        reflectedAt = await frame();
        break;
      }
    }
    window.__controlProbe.end();
    return {
      status: reflectedAt !== null ? "REFLECTED" : (observation?.error ?? "TIMED_OUT"),
      latencyMs:
        reflectedAt === null || observation?.start === null
          ? null
          : reflectedAt - observation.start,
      submissionMs:
        observation?.submittedAt && observation?.start
          ? observation.submittedAt - observation.start
          : null,
      gpuCompletionObservedMs:
        observation?.completedAt && observation?.start
          ? observation.completedAt - observation.start
          : null,
      newProgramLinks: observation?.newProgramLinks ?? null,
    };
  });
  rows.push({ round, name, expected, ...measurement });
}
try {
  for (let round = 0; round < rounds; round++) {
    const page = await open();
    try {
      if (family === "p8") {
        for (const [tab, name, expected] of [
          ["Thời tiết", "Nhiều mây", { weather: "cloudy" }],
          ["Thời tiết", "Mưa", { weather: "rain" }],
          ["Thời tiết", "Mưa to", { weather: "storm" }],
          ["Thời tiết", "Nắng nhẹ", { weather: "sunny" }],
          ["Thời tiết", "Mùa mưa", { season: "wet" }],
          ["Thời tiết", "Mùa khô", { season: "dry" }],
          ["Lễ hội", "Tết", { festival: "tet" }],
          ["Lễ hội", "Trung Thu", { festival: "midautumn" }],
          ["Lễ hội", "Thường ngày", { festival: "normal" }],
        ]) {
          await page.getByRole("tab", { name: tab, exact: true }).click();
          await action(page, round, name, expected, () =>
            page.getByRole("radio", { name, exact: true }).click(),
          );
        }
        await page.getByRole("tab", { name: "Thời gian", exact: true }).click();
        await action(page, round, "Khuya", { timeMinutes: "1380" }, () =>
          page.getByRole("button", { name: "23:00 Khuya", exact: true }).click(),
        );
        await action(page, round, "Ngày đang xem", { selectedDate: "2026-12-25" }, () =>
          page.getByLabel("Ngày đang xem", { exact: true }).fill("2026-12-25"),
        );
        await page.getByRole("tab", { name: "Thời tiết", exact: true }).click();
        await action(page, round, "Ngập mô phỏng", { floodLevel: "0.1" }, () =>
          page.getByLabel("Mức ngập mô phỏng", { exact: true }).press("ArrowRight"),
        );
        await action(page, round, "Tắt lớp", { atmosphereEnabled: "false" }, () =>
          page.getByRole("switch", { name: "Lớp không khí", exact: true }).click(),
        );
        await action(page, round, "Bật lớp", { atmosphereEnabled: "true" }, () =>
          page.getByRole("switch", { name: "Lớp không khí", exact: true }).click(),
        );
        await page.evaluate(() => window.__controlProbe.beginFrames());
        await page.mouse.move(600, 360);
        await page.mouse.down();
        for (let step = 0; step < 48; step++) {
          await page.mouse.move(600 + step * 2, 360 + Math.sin(step / 8) * 18);
          await page.waitForTimeout(16);
        }
        await page.mouse.up();
        const timestamps = await page.evaluate(() => window.__controlProbe.endFrames());
        const intervalsMs = timestamps.slice(1).map((at, index) => at - timestamps[index]);
        frameRounds.push({
          round,
          intervalsMs,
          complete: intervalsMs.length >= 30,
          statistics: stats(intervalsMs),
        });
      } else {
        await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-audio-contexts", "0");
        const sound = page.getByRole("button", { name: "Tiếng phố", exact: true });
        await action(
          page,
          round,
          "cold-sound-on",
          { audioState: "running", audioContexts: "1" },
          () => sound.click(),
        );
        await sound.click();
        await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-audio-voices", "0");
        await action(
          page,
          round,
          "warm-sound-on",
          { audioState: "running", audioContexts: "1" },
          () => sound.click(),
        );
        await sound.click();
      }
    } finally {
      await page.close();
    }
    console.log(`${family} controls ${round + 1}/${rounds}`);
    await writeFile(
      path.join(output, "raw.json"),
      JSON.stringify(
        {
          syntheticOnly: true,
          family,
          scriptSha256,
          environment: observed,
          fixtureSha256:
            family === "p8"
              ? createHash("sha256").update(fixtureText).digest("hex")
              : "built-in-synthetic-demo",
          randomSeed: 81273,
          clock: { date: "2026-06-21", startMinutes: 720, speed: 0 },
          rows,
          frameRounds,
          errors,
          complete: round + 1 === rounds,
          mutedAudioOutput: true,
          method:
            "Real input event to matching main-frame submission, observed GPU fence completion and following RAF. Drag intervals are actual main-frame submissions, not GPU execution time. No first-audible-sample claim; no P8 full-lifecycle certification.",
        },
        null,
        2,
      ) + "\n",
    );
  }
  const summary = {};
  for (const name of new Set(rows.map((row) => row.name))) {
    const samples = rows.filter((row) => row.name === name);
    summary[name] = {
      statistics: stats(
        samples.filter((row) => row.latencyMs !== null).map((row) => row.latencyMs),
      ),
      complete: samples.length === rounds && samples.every((row) => row.status === "REFLECTED"),
      allUnder100Ms: samples.every((row) => row.latencyMs !== null && row.latencyMs < 100),
      newProgramLinks: samples.reduce((sum, row) => sum + (row.newProgramLinks ?? 0), 0),
    };
  }
  const frames = {
    targetMaxMs: 50,
    statistics: stats(frameRounds.flatMap((row) => row.intervalsMs)),
    complete:
      family !== "p8" ||
      (frameRounds.length === rounds && frameRounds.every((row) => row.complete)),
    allAtMost50Ms: frameRounds.every((row) => row.intervalsMs.every((value) => value <= 50)),
  };
  await writeFile(
    path.join(output, "summary.json"),
    JSON.stringify(
      {
        syntheticOnly: true,
        family,
        targetMs: 100,
        rounds,
        summary,
        frames,
        status:
          rounds < 30
            ? "DIAGNOSTIC_INSUFFICIENT_SAMPLES"
            : errors.length === 0 &&
                Object.values(summary).every((row) => row.complete && row.allUnder100Ms) &&
                frames.complete &&
                frames.allAtMost50Ms
              ? "MET"
              : "NOT_MET",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
