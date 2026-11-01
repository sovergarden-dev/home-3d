import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { launchBenchmark } from "./benchmark-browser.mjs";
const output = process.argv[2] ?? "test-results/m2-audio-profile";
await mkdir(output, { recursive: true });
const { browser, dpr, environment } = await launchBenchmark(["--mute-audio"]);
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: dpr,
    reducedMotion: "reduce",
  });
  await page.route("**/*", (route) =>
    ["127.0.0.1", "localhost"].includes(new URL(route.request().url()).hostname)
      ? route.continue()
      : route.abort(),
  );
  await page.addInitScript(() => {
    window.__audioProbe = { events: [], context: null, frames: 0 };
    const Native = window.AudioContext;
    window.AudioContext = new Proxy(Native, {
      construct(target, args) {
        const start = performance.now();
        const context = Reflect.construct(target, args);
        window.__audioProbe.events.push({ kind: "construct", start, end: performance.now() });
        window.__audioProbe.context = context;
        context.addEventListener("statechange", () =>
          window.__audioProbe.events.push({
            kind: "state",
            at: performance.now(),
            state: context.state,
          }),
        );
        return context;
      },
    });
    const original = Native.prototype.createBuffer;
    Native.prototype.createBuffer = function (...args) {
      const start = performance.now();
      const result = original.apply(this, args);
      window.__audioProbe.events.push({
        kind: "buffer",
        start,
        end: performance.now(),
        length: args[1],
        sampleRate: args[2],
      });
      return result;
    };
    const clear = WebGL2RenderingContext.prototype.clear;
    WebGL2RenderingContext.prototype.clear = function (mask) {
      const main =
        !!(mask & this.COLOR_BUFFER_BIT) && this.getParameter(this.FRAMEBUFFER_BINDING) === null;
      const result = clear.call(this, mask);
      if (main) window.__audioProbe.frames++;
      return result;
    };
  });
  await page.goto("http://127.0.0.1:4188/");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 60000,
  });
  const metadata = await environment(page);
  await page.waitForTimeout(5000);
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("Profiler.enable");
  await cdp.send("Profiler.setSamplingInterval", { interval: 200 });
  await cdp.send("Profiler.start");
  const sound = page.getByRole("button", { name: "Tiếng phố", exact: true });
  await sound.click();
  await page.waitForTimeout(500);
  const { profile } = await cdp.send("Profiler.stop");
  const totals = new Map();
  for (let i = 0; i < (profile.samples ?? []).length; i++)
    totals.set(
      profile.samples[i],
      (totals.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0),
    );
  const functions = profile.nodes
    .map((node) => ({
      name: node.callFrame.functionName,
      module: node.callFrame.url.startsWith("http")
        ? new URL(node.callFrame.url).pathname
        : "runtime",
      selfMs: (totals.get(node.id) ?? 0) / 1000,
    }))
    .sort((a, b) => b.selfMs - a.selfMs)
    .slice(0, 20);
  await sound.click();
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.__audioProbe.frames);
  await sound.click();
  await page.waitForTimeout(500);
  const observation = await page.evaluate(() => ({
    events: window.__audioProbe.events,
    audioState: window.__audioProbe.context.state,
    sceneAudioState: document.querySelector('[data-testid="demo-scene"]').dataset.audioState,
    frames: window.__audioProbe.frames,
    pressed: document.querySelector('button[aria-label="Tiếng phố"]').getAttribute("aria-pressed"),
  }));
  await writeFile(
    `${output}/profile.json`,
    JSON.stringify(
      {
        syntheticOnly: true,
        label: "DIAGNOSTIC_WITH_PROFILER_NOT_ACCEPTANCE",
        environment: metadata,
        functions,
        observation,
        warmFrames: observation.frames - before,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    JSON.stringify({
      functions: functions.slice(0, 8),
      audioState: observation.audioState,
      sceneAudioState: observation.sceneAudioState,
      warmFrames: observation.frames - before,
    }),
  );
} finally {
  await browser.close();
}
