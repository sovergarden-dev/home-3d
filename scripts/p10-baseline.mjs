import { launchBenchmark } from "./benchmark-browser.mjs";
import fs from "node:fs";
const port = process.argv[2] || "4180",
  label = process.argv[3] || "before";
const output = process.argv[4] || "/tmp/p10-evidence";
fs.mkdirSync(output, { recursive: true });
const { browser, dpr, environment } = await launchBenchmark();
let rendererEvidence;
const results = [];
try {
  for (let run = 0; run < 3; run++) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: dpr,
      reducedMotion: "reduce",
    });
    await page.route("**/*", (r) =>
      ["127.0.0.1", "localhost"].includes(new URL(r.request().url()).hostname)
        ? r.continue()
        : r.abort(),
    );
    await page.goto(`http://127.0.0.1:${port}/?local-preview=1`);
    await page.locator("#scene-root[data-scene-state=ready]").waitFor({ timeout: 60000 });
    rendererEvidence = await environment(page);
    await page.evaluate(async () => {
      const url = performance
        .getEntriesByType("resource")
        .find((e) => new URL(e.name).pathname === "/src/state/appStore.ts").name;
      const { useAppStore } = await import(url);
      useAppStore.setState({
        selectedDate: "2026-06-21",
        timeOfDayMinutes: 420,
        timeSpeed: 1,
        festivalAuto: false,
        festival: "normal",
        heading: 28,
        zoom: 1,
      });
    });
    await page.waitForTimeout(5000);
    const raw = await page.evaluate(
      () =>
        new Promise((resolve) => {
          const frames = [];
          let last = performance.now();
          const end = last + 10000;
          function frame(now) {
            frames.push(now - last);
            last = now;
            if (now < end) requestAnimationFrame(frame);
            else resolve(frames);
          }
          requestAnimationFrame(frame);
        }),
    );
    const scene = await page.getByTestId("demo-scene").evaluate((e) => ({ ...e.dataset }));
    if (scene.lifeGraphReady !== "true" || Number(scene.lifeAgents) < 1)
      throw Error("MATCHED_P9_LIFE_FIXTURE_REQUIRED");
    results.push({ run, raw, scene });
    await page.close();
    console.log(`${label} run ${run + 1}/3`);
  }

  fs.writeFileSync(
    `${output}/${label}-raw.json`,
    JSON.stringify(
      {
        label,
        fixture: "synthetic demo",
        camera: { heading: 28, zoom: 1 },
        date: "2026-06-21",
        time: 420,
        viewport: [1440, 900],
        dpr,
        warmupMs: 5000,
        durationMs: 10000,
        renderer: rendererEvidence.renderer,
        environment: rendererEvidence,
        results,
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
