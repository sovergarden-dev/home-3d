import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { launchBenchmark } from "./benchmark-browser.mjs";

if (process.env.BENCH_GPU !== "real") throw Error("REAL_GPU_REQUIRED");
const output = process.argv[2] ?? "test-results/load-benchmark";
const origin = `http://127.0.0.1:${Number(process.env.PRODUCTION_QA_PORT ?? 4193)}`;
await mkdir(output, { recursive: true });
const { browser, environment } = await launchBenchmark(["--mute-audio"]);
const rows = [],
  externalHosts = new Set();
const network = {
  offline: false,
  latency: 150,
  downloadThroughput: 1600000 / 8,
  uploadThroughput: 750000 / 8,
  connectionType: "cellular4g",
};
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    for (let run = 0; run < 3; run++) {
      const context = await browser.newContext({
        viewport,
        deviceScaleFactor: 1,
        reducedMotion: "no-preference",
      });
      try {
        const page = await context.newPage();
        page.on("request", (request) => {
          const url = new URL(request.url());
          if (["http:", "https:"].includes(url.protocol) && url.origin !== origin)
            externalHosts.add(url.hostname);
        });
        await page.addInitScript(() => {
          window.__loadReadyMs = null;
          const observer = new MutationObserver(() => {
            if (
              document.querySelector("#scene-root")?.getAttribute("data-scene-state") === "ready"
            ) {
              window.__loadReadyMs = performance.now();
              observer.disconnect();
            }
          });
          observer.observe(document, {
            subtree: true,
            attributes: true,
            childList: true,
            attributeFilter: ["data-scene-state"],
          });
        });
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.emulateNetworkConditions", network);
        for (const cache of ["cold", "warm"]) {
          if (cache === "cold")
            await page.goto(`${origin}/`, { waitUntil: "domcontentloaded", timeout: 60000 });
          else await page.reload({ waitUntil: "domcontentloaded", timeout: 60000 });
          await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
            timeout: 60000,
          });
          const metrics = await page.evaluate(() => ({
            firstContentfulPaintMs:
              performance.getEntriesByName("first-contentful-paint")[0]?.startTime ?? null,
            worldReadyMs: window.__loadReadyMs,
            serviceWorkerControlled: Boolean(navigator.serviceWorker.controller),
            resources: performance.getEntriesByType("resource").map((entry) => ({
              type: entry.initiatorType,
              transferBytes: entry.transferSize,
              encodedBytes: entry.encodedBodySize,
              durationMs: entry.duration,
              fromServiceWorker: entry.workerStart > 0,
            })),
          }));
          const row = {
            viewport,
            run,
            cache,
            environment: await environment(page),
            metrics,
            shellBudget:
              metrics.firstContentfulPaintMs !== null && metrics.firstContentfulPaintMs < 2000,
            worldBudget:
              metrics.worldReadyMs !== null &&
              metrics.worldReadyMs < (cache === "cold" ? 8000 : 2000),
          };
          rows.push(row);
          console.log(
            JSON.stringify({
              viewport,
              run,
              cache,
              shellMs: metrics.firstContentfulPaintMs,
              worldMs: metrics.worldReadyMs,
              controlled: metrics.serviceWorkerControlled,
            }),
          );
          if (cache === "cold") {
            await page.evaluate(async () => {
              await navigator.serviceWorker.ready;
            });
            await expect
              .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)), {
                timeout: 60000,
              })
              .toBe(true);
          }
        }
      } finally {
        await context.close();
      }
    }
  }
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        syntheticOnly: true,
        network,
        method:
          "Production root with public fictional world. Three isolated contexts per viewport for cold HTTP/SW caches, followed by same-context reload after verified Service Worker control. CDP emulates 150ms latency and 1.6Mbps down/0.75Mbps up; no CPU throttling. No Playwright routing (which would disable HTTP cache). FCP is browser Paint Timing; world ready is observed from the actual scene state. No slow samples removed.",
        rows,
        externalHosts: [...externalHosts],
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
