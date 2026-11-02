import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { launchBenchmark } from "./benchmark-browser.mjs";

if (process.env.BENCH_GPU !== "real") throw Error("REAL_GPU_REQUIRED");
const output = process.argv[2] ?? "test-results/load-benchmark";
const origin = `http://127.0.0.1:${Number(process.env.PRODUCTION_QA_PORT ?? 4193)}`;
await mkdir(output, { recursive: true });

const freeLoopbackPort = () =>
  new Promise((resolve, reject) => {
    const server = createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });

/**
 * A page's CDP session does not throttle its service worker, and warm navigations go through the
 * worker (network-first). This second CDP client attaches to every service worker before it runs
 * and applies the same conditions, so warm loads pay the emulated network like cold ones.
 */
async function throttleServiceWorkers(port, conditions) {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const socket = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", () => reject(Error("SERVICE_WORKER_CDP_UNAVAILABLE")), {
      once: true,
    });
  });
  let nextId = 0;
  const pending = new Map();
  const state = { attached: 0, throttled: 0, failures: [] };
  const send = (method, params = {}, sessionId) =>
    new Promise((resolve, reject) => {
      const id = ++nextId;
      pending.set(id, { resolve, reject });
      socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  const attached = async ({ sessionId, targetInfo, waitingForDebugger }) => {
    const worker = targetInfo.type === "service_worker";
    if (worker) state.attached++;
    try {
      if (worker) {
        await send("Network.enable", {}, sessionId);
        await send("Network.emulateNetworkConditions", conditions, sessionId);
        state.throttled++;
      }
    } catch (error) {
      state.failures.push(String(error.message));
    } finally {
      // The target waits for this client too; release it after the conditions apply.
      if (waitingForDebugger)
        await send("Runtime.runIfWaitingForDebugger", {}, sessionId).catch((error) =>
          state.failures.push(String(error.message)),
        );
      if (!worker) await send("Target.detachFromTarget", { sessionId }).catch(() => {});
    }
  };
  socket.addEventListener("message", ({ data }) => {
    const message = JSON.parse(String(data));
    if (message.id !== undefined) {
      const entry = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) entry?.reject(Error(`CDP_ERROR ${message.error.message}`));
      else entry?.resolve(message.result);
    } else if (message.method === "Target.attachedToTarget") void attached(message.params);
  });
  await send("Target.setAutoAttach", {
    autoAttach: true,
    waitForDebuggerOnStart: true,
    flatten: true,
    filter: [{ type: "service_worker", exclude: false }, { exclude: true }],
  });
  return { state, close: () => socket.close() };
}

const debugPort = await freeLoopbackPort();
const { browser, environment } = await launchBenchmark([
  "--mute-audio",
  `--remote-debugging-port=${debugPort}`,
]);
const rows = [],
  externalHosts = new Set();
const network = {
  offline: false,
  latency: 150,
  downloadThroughput: 1600000 / 8,
  uploadThroughput: 750000 / 8,
  connectionType: "cellular4g",
};
let workers;
try {
  workers = await throttleServiceWorkers(debugPort, network);
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
        context.on("request", (request) => {
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
            navigation: (() => {
              const n = performance.getEntriesByType("navigation")[0];
              return n
                ? {
                    fetchStart: n.fetchStart,
                    requestStart: n.requestStart,
                    responseStart: n.responseStart,
                    responseEnd: n.responseEnd,
                    workerStart: n.workerStart,
                    transferBytes: n.transferSize,
                    encodedBytes: n.encodedBodySize,
                  }
                : null;
            })(),
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
          const navigation = metrics.navigation;
          // A navigation answered over the emulated network cannot finish sooner than its latency.
          const navigationFetchMs = navigation
            ? navigation.responseEnd - navigation.fetchStart
            : null;
          const row = {
            viewport,
            run,
            cache,
            environment: await environment(page),
            metrics,
            navigationViaServiceWorker: Boolean(navigation && navigation.workerStart > 0),
            navigationFetchMs,
            navigationThrottleObserved:
              navigationFetchMs !== null && navigationFetchMs >= network.latency,
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
              viaServiceWorker: row.navigationViaServiceWorker,
              navigationFetchMs,
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
  const workerState = workers.state;
  const contexts = new Set(rows.map((row) => `${row.viewport.width}/${row.run}`)).size;
  const status = (cache, budget) => {
    const selected = rows.filter((row) => row.cache === cache);
    // A sample that did not pay the emulated network says nothing about the 4G budget.
    if (selected.some((row) => !row.navigationThrottleObserved)) return "NOT_VERIFIED";
    if (cache === "warm" && workerState.throttled < contexts) return "NOT_VERIFIED";
    return selected.every((row) => row[budget]) ? "MET" : "NOT_MET";
  };
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        syntheticOnly: true,
        transport: process.env.PRODUCTION_QA_COMPRESSION ?? "identity",
        network,
        serviceWorkerThrottle: {
          attached: workerState.attached,
          throttled: workerState.throttled,
          failures: workerState.failures,
        },
        status: {
          coldShell: status("cold", "shellBudget"),
          coldWorld: status("cold", "worldBudget"),
          warmShell: status("warm", "shellBudget"),
          warmWorld: status("warm", "worldBudget"),
        },
        method:
          "Production root with public fictional world. Three isolated contexts per viewport for cold HTTP/SW caches, followed by same-context reload after verified Service Worker control. CDP emulates 150ms latency and 1.6Mbps down/0.75Mbps up on the page and, through a second CDP client that auto-attaches before each service worker runs, on every service worker; no CPU throttling. A sample counts only if its navigation took at least the emulated latency from fetchStart to responseEnd, and warm samples also need every context's service worker throttled. No Playwright routing (which would disable HTTP cache). FCP is browser Paint Timing; world ready is observed from the actual scene state. No slow samples removed.",
        rows,
        externalHosts: [...externalHosts],
      },
      null,
      2,
    ) + "\n",
  );
  if (workerState.failures.length) throw Error("SERVICE_WORKER_THROTTLE_FAILED");
} finally {
  workers?.close();
  await browser.close();
}
