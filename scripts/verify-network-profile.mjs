import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const output = process.argv[2] ?? "test-results/network-profile";
const origin = `http://127.0.0.1:${Number(process.env.PRODUCTION_QA_PORT ?? 4193)}`;
const bytes = 512 * 1024;
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4197,
  fetch(request) {
    if (new URL(request.url).pathname === "/index")
      return new Response("<!doctype html><title>Synthetic network probe</title>", {
        headers: { "Content-Type": "text/html" },
      });
    return new Response(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store",
        "Access-Control-Allow-Origin": origin,
      },
    });
  },
});
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send("Network.enable");
  await page.goto("http://127.0.0.1:4197/index");
  const sample = async (label) => ({
    label,
    ...(await page.evaluate(async () => {
      const start = performance.now();
      const response = await fetch(`http://127.0.0.1:4197/probe?nonce=${crypto.randomUUID()}`, {
        cache: "no-store",
      });
      const body = await response.arrayBuffer();
      return {
        bytes: body.byteLength,
        elapsedMs: performance.now() - start,
        serviceWorkerControlled: Boolean(navigator.serviceWorker.controller),
      };
    })),
  });
  const baseline = await sample("unthrottled");
  const conditions = {
    offline: false,
    latency: 150,
    downloadThroughput: 1600000 / 8,
    uploadThroughput: 750000 / 8,
    connectionType: "cellular4g",
  };
  await cdp.send("Network.emulateNetworkConditions", conditions);
  const throttled = await sample("requested4G-before-service-worker");
  await page.goto(`${origin}/gioi-thieu`);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  const controlled = await sample("requested4G-with-service-worker");
  const rows = [baseline, throttled, controlled];
  for (const row of rows) assert.equal(row.bytes, bytes);
  const verified =
    throttled.elapsedMs > 2000 &&
    controlled.elapsedMs > 2000 &&
    baseline.elapsedMs < throttled.elapsedMs;
  await mkdir(output, { recursive: true });
  await writeFile(
    `${output}/report.json`,
    JSON.stringify(
      {
        syntheticOnly: true,
        status: verified ? "TRANSFER_THROTTLING_OBSERVED" : "NOT_VERIFIED",
        browserVersion: browser.version(),
        conditions,
        rows,
        method:
          "Separate local512KiB uncompressed no-store payload, before/after identical CDP conditions and after public Service Worker control. Confirms substantial transfer throttling; does not substitute for real cellular-network testing.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ verified, rows }));
} finally {
  await browser.close();
  await server.stop(true);
}
