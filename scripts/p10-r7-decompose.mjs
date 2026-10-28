import { expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { createHash } from "node:crypto";
import { launchBenchmark } from "./benchmark-browser.mjs";

const phase = process.argv[2] ?? process.env.R7_PHASE ?? "before";
const port = Number(process.argv[3] ?? process.env.R7_PORT ?? (phase === "before" ? 4184 : 4178));
const output = path.resolve(process.argv[4] ?? "/tmp/p10-r7");
const baseURL = `http://127.0.0.1:${port}`;
const startedAt = new Date().toISOString();
const runs = Number(process.env.R7_RUNS ?? 3);
const pairs = Number(process.env.R7_PAIRS ?? 5);
const population = Number(process.env.R7_POPULATION ?? 299);
const lifeEnabled = process.env.R7_LIFE === "1";
const viewport = {
  width: Number(process.env.R7_WIDTH ?? 1440),
  height: Number(process.env.R7_HEIGHT ?? 900),
};
if (![runs, pairs].every((value) => Number.isInteger(value) && value > 0))
  throw Error("INVALID_PROFILE_SAMPLE_COUNT");
if (!Number.isInteger(population) || population < 0 || population >= 300)
  throw Error("INVALID_PROFILE_POPULATION");
await mkdir(output, { recursive: true });

const { browser, dpr, environment } = await launchBenchmark();
let rendererEvidence;
const scriptSha256 = createHash("sha256")
  .update(await readFile(new URL(import.meta.url)))
  .digest("hex");
const raw = [];

function scrub(value) {
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, scrub(item)]));
  if (typeof value !== "string") return value;
  let text = value.replace(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+/g, "[loopback]");
  text = text.replace(
    /(?:file:\/\/\/)?[A-Za-z]:[\\/][^\s"<>]*?(?=[\\/](?:src|node_modules|scripts|tests)[\\/])/g,
    "[source]",
  );
  return text;
}

async function saveTrace(cdp, run) {
  const completed = new Promise((resolve) => cdp.once("Tracing.tracingComplete", resolve));
  await cdp.send("Tracing.end");
  const { stream } = await completed;
  let text = "";
  try {
    for (;;) {
      const chunk = await cdp.send("IO.read", { handle: stream });
      text += chunk.base64Encoded ? Buffer.from(chunk.data, "base64").toString("utf8") : chunk.data;
      if (chunk.eof) break;
    }
  } finally {
    await cdp.send("IO.close", { handle: stream });
  }
  const trace = scrub(JSON.parse(text));
  const parts = [];
  async function writePart(events) {
    const bytes = gzipSync(JSON.stringify({ traceEvents: events }));
    if (bytes.length >= 1000000) {
      if (events.length < 2) throw Error("TRACE_EVENT_TOO_LARGE");
      const middle = Math.floor(events.length / 2);
      await writePart(events.slice(0, middle));
      await writePart(events.slice(middle));
      return;
    }
    const name = `${phase}-trace-${run}-${parts.length}.json.gz`;
    await writeFile(path.join(output, name), bytes);
    parts.push({
      name,
      events: events.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
  }
  await writePart(trace.traceEvents);
  return {
    events: trace.traceEvents.length,
    parts,
    redaction:
      "Loopback origins and workspace prefixes only; timing events retained without filtering.",
  };
}

try {
  for (let run = 0; run < runs; run++) {
    const page = await browser.newPage({
      viewport,
      deviceScaleFactor: dpr,
      reducedMotion: "reduce",
    });
    const otherExternal = [],
      fontAborts = [],
      pageErrors = [];
    page.on("console", (message) => console.error(`[browser:${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
      window.__p10Performance = { supported: PerformanceObserver.supportedEntryTypes, entries: [] };
      for (const type of ["longtask", "long-animation-frame", "event"]) {
        if (!PerformanceObserver.supportedEntryTypes.includes(type)) continue;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries())
            window.__p10Performance.entries.push(entry.toJSON());
        });
        observer.observe({
          type,
          buffered: true,
          ...(type === "event" ? { durationThreshold: 16 } : {}),
        });
      }
      // Resolve imports to the already loaded Vite resource URL. This deliberately
      // avoids loading a second copy of a module (especially Three.js).
      window.__p10Import = async (pathname) => {
        const entries = performance.getEntriesByType("resource");
        const entry = [...entries].reverse().find((e) => {
          try {
            return new URL(e.name).pathname === pathname;
          } catch {
            return false;
          }
        });
        return import(entry?.name ?? new URL(pathname, location.href).href);
      };
      const isMemoryDocument = (value) =>
        Boolean(
          value &&
          typeof value === "object" &&
          value.schemaVersion === 1 &&
          Array.isArray(value.memories) &&
          Array.isArray(value.journal),
        );
      const metrics = {
        active: false,
        cloneMs: 0,
        cloneCount: 0,
        mapSetMs: 0,
        mapSetCount: 0,
        mutationCpuMs: 0,
        pinCpuMs: 0,
        pinCalls: 0,
        domFirstAt: null,
        domLastAt: null,
        domMutationCount: 0,
        cardAdded: 0,
        cardRemoved: 0,
        mutationStart: 0,
      };
      window.__p10R7 = {
        metrics,
        begin(start) {
          performance.mark("r7-mutation-start");
          Object.assign(metrics, {
            active: true,
            cloneMs: 0,
            cloneCount: 0,
            mapSetMs: 0,
            mapSetCount: 0,
            mutationCpuMs: 0,
            pinCpuMs: 0,
            pinCalls: 0,
            domFirstAt: null,
            domLastAt: null,
            domMutationCount: 0,
            cardAdded: 0,
            cardRemoved: 0,
            mutationStart: start,
          });
        },
        end() {
          performance.mark("r7-mutation-end");
          metrics.active = false;
        },
      };
      const originalClone = globalThis.structuredClone;
      globalThis.structuredClone = function (value, options) {
        if (!metrics.active || !isMemoryDocument(value))
          return originalClone.call(this, value, options);
        const t = performance.now();
        const result = originalClone.call(this, value, options);
        metrics.cloneMs += performance.now() - t;
        metrics.cloneCount++;
        return result;
      };
      const originalSet = Map.prototype.set;
      Map.prototype.set = function (key, value) {
        if (!metrics.active || !isMemoryDocument(value)) return originalSet.call(this, key, value);
        const t = performance.now();
        const result = originalSet.call(this, key, value);
        metrics.mapSetMs += performance.now() - t;
        metrics.mapSetCount++;
        return result;
      };
      window.__p10R7PatchThree = async () => {
        const THREE = await window.__p10Import("/node_modules/.vite/deps/three.js");
        const proto = THREE.InstancedMesh.prototype;
        if (proto.__p10R7Wrapped) return;
        const original = proto.setMatrixAt;
        proto.setMatrixAt = function (...args) {
          if (!metrics.active || this.name !== "memory-pins-instanced")
            return original.apply(this, args);
          const t = performance.now();
          const result = original.apply(this, args);
          metrics.pinCpuMs += performance.now() - t;
          metrics.pinCalls++;
          return result;
        };
        proto.__p10R7Wrapped = true;
      };
      const observer = new MutationObserver((records) => {
        if (!metrics.active) return;
        const now = performance.now();
        let cards = 0;
        for (const record of records) {
          for (const node of record.addedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = /** @type {Element} */ (node);
              cards +=
                (element.matches("[data-testid=memory-card]") ? 1 : 0) +
                (element.querySelectorAll?.("[data-testid=memory-card]").length ?? 0);
              metrics.cardAdded +=
                (element.matches("[data-testid=memory-card]") ? 1 : 0) +
                element.querySelectorAll?.("[data-testid=memory-card]").length;
            }
          }
          for (const node of record.removedNodes) {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = /** @type {Element} */ (node);
              metrics.cardRemoved +=
                (element.matches("[data-testid=memory-card]") ? 1 : 0) +
                element.querySelectorAll?.("[data-testid=memory-card]").length;
            }
          }
        }
        if (
          !records.some((record) =>
            [...record.addedNodes, ...record.removedNodes].some(
              (node) =>
                node.nodeType === Node.ELEMENT_NODE &&
                (node.matches?.("[data-testid=memory-card]") ||
                  node.querySelector?.("[data-testid=memory-card]")),
            ),
          )
        )
          return;
        metrics.domFirstAt ??= now;
        metrics.domLastAt = now;
        metrics.domMutationCount += records.length;
      });
      observer.observe(document, { childList: true, subtree: true });
    });
    const cdp =
      process.env.R7_TRACE === "1" && run === 0 ? await page.context().newCDPSession(page) : null;
    if (cdp)
      await cdp.send("Tracing.start", {
        categories:
          "devtools.timeline,blink.user_timing,toplevel,disabled-by-default-devtools.timeline.frame",
        transferMode: "ReturnAsStream",
      });
    await page.route("**/*", (route) => {
      const url = new URL(route.request().url());
      if (url.hostname === "127.0.0.1" || ["blob:", "data:"].includes(url.protocol))
        return route.continue();
      if (["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname))
        fontAborts.push(url.hostname);
      else otherExternal.push(url.origin);
      return route.abort();
    });
    await page.goto(`${baseURL}/?local-preview=1`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
      timeout: 60000,
    });
    rendererEvidence = await environment(page);
    await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
    await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
    await expect(page.getByTestId("memory-card")).toHaveCount(3);
    await page.evaluate(async (lifeEnabled) => {
      (await window.__p10Import("/src/state/appStore.ts")).useAppStore.setState({
        selectedDate: "2026-06-21",
        timeOfDayMinutes: 420,
        timeSpeed: lifeEnabled ? 1 : 0,
        lifeEnabled,
        festivalAuto: false,
        festival: "normal",
        heading: 28,
        zoom: 1,
      });
      await window.__p10R7PatchThree();
      const world = (
        await window.__p10Import("/src/world/privateWorldSession.ts")
      ).worldDataProvider.getSnapshot();
      if (world.mode !== "fixture" || !world.world.manifest.isSynthetic)
        throw Error("SYNTHETIC_FIXTURE_REQUIRED");
    }, lifeEnabled);
    await page.waitForTimeout(5000);
    const samples = await page.evaluate(
      async ({ population, pairs }) => {
        const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
        const { memoryCamera: c } = await window.__p10Import("/src/memories/bridge.ts");
        const camera = c.getPose();
        const item = (i) => ({
          id: crypto.randomUUID(),
          title: "Ví dụ tổng hợp",
          body: "",
          position: [(i % 18) * 5 - 45, 0, Math.floor(i / 18) * 5 - 40],
          camera: { ...camera, target: [...camera.target] },
          date: "2026-06-21",
          preset: "everyday",
          tags: [],
          photos: [],
          visibility: "public",
        });
        if (population < s.getSnapshot().memories.length)
          for (const memory of [...s.getSnapshot().memories]) s.deleteMemory(memory.id);
        for (let i = s.getSnapshot().memories.length; i < population; i++) s.saveMemory(item(i));
        await new Promise((resolve) => setTimeout(resolve, 5000));
        const frame = () =>
          new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const samples = [];
        for (let i = 0; i < pairs; i++) {
          const value = item(296 + i);
          for (const kind of ["add", "delete"]) {
            const t0 = performance.now();
            window.__p10R7.begin(t0);
            if (kind === "add") s.saveMemory(value);
            else s.deleteMemory(value.id);
            const afterCall = performance.now();
            const cpuMutationMs = afterCall - t0;
            await new Promise((resolve) =>
              requestAnimationFrame(() => {
                window.__p10R7.raf1 = performance.now();
                resolve();
              }),
            );
            await new Promise((resolve) =>
              requestAnimationFrame(() => {
                window.__p10R7.raf2 = performance.now();
                resolve();
              }),
            );
            const m = window.__p10R7.metrics;
            window.__p10R7.end();
            samples.push({
              kind,
              index: i,
              count: s.getSnapshot().memories.length,
              totalMutationCpuMs: cpuMutationMs,
              structuredCloneCpuMs: m.cloneMs,
              structuredCloneCount: m.cloneCount,
              memoryDocumentMapSetCpuMs: m.mapSetMs,
              memoryDocumentMapSetCount: m.mapSetCount,
              reactDomMutationMs: m.domFirstAt == null ? null : m.domLastAt - t0,
              domMutationCount: m.domMutationCount,
              cardAdded: m.cardAdded,
              cardRemoved: m.cardRemoved,
              rebuildPinInstanceCpuMs: m.pinCpuMs,
              rebuildPinInstanceCalls: m.pinCalls,
              raf1UpperBoundMs: window.__p10R7.raf1 - t0,
              raf2UpperBoundMs: window.__p10R7.raf2 - t0,
              compositorResidueMs: window.__p10R7.raf2 - window.__p10R7.raf1,
            });
          }
        }
        return samples;
      },
      { population, pairs },
    );
    expect(otherExternal).toEqual([]);
    expect(pageErrors).toEqual([]);
    for (const sample of samples) expect(sample.rebuildPinInstanceCalls).toBe(sample.count);
    let uiDiagnostic = null;
    if (cdp) {
      const title = "Chẩn đoán tổng hợp";
      const start = await page.evaluate(() => performance.now());
      await page.getByRole("button", { name: "Thêm kỷ niệm", exact: true }).click();
      await page.getByRole("textbox", { name: "Tên kỷ niệm", exact: true }).fill(title);
      await page.getByRole("button", { name: "Lưu", exact: true }).click();
      const card = page.getByTestId("memory-card").filter({ hasText: title });
      await expect(card).toHaveCount(1);
      await card.getByRole("button", { name: /^(Xoá|Xóa):/ }).click();
      await expect(card).toHaveCount(0);
      uiDiagnostic = {
        start,
        end: await page.evaluate(() => performance.now()),
        purpose: "Actual input event timing, excluded from API latency samples.",
      };
    }
    expect(otherExternal).toEqual([]);
    expect(pageErrors).toEqual([]);
    const performanceEntries = await page.evaluate(() => window.__p10Performance);
    const trace = cdp ? await saveTrace(cdp, run) : null;
    raw.push({
      run,
      samples,
      otherExternalCount: otherExternal.length,
      fontAborts,
      pageErrors,
      performanceEntries,
      trace,
      uiDiagnostic,
    });
    await page.close();
    console.log(`R7 ${phase} run ${run + 1}/${runs}`);
  }
  const result = {
    syntheticOnly: true,
    phase,
    sourcePort: port,
    environment: rendererEvidence,
    scriptSha256,
    startedAt,
    finishedAt: new Date().toISOString(),
    viewport: [viewport.width, viewport.height],
    dpr,
    lifeEnabled,
    reducedMotion: true,
    date: "2026-06-21",
    timeMinutes: 420,
    heading: 28,
    zoom: 1,
    warmupMs: 5000,
    postPopulationWarmupMs: 5000,
    fixturePopulation: `${population}→${population + 1}→${population}`,
    sampleDesign: `${runs} runs × ${pairs} add/delete pairs (${runs * pairs * 2} samples)`,
    instrumentation:
      "Diagnostic wrappers and PerformanceObservers; traced runs are not acceptance latency samples.",
    measurement:
      "real saveMemory/deleteMemory call; structuredClone/MemoryDocument Map.set wrappers; React MutationObserver card timestamps; InstancedMesh.setMatrixAt wrapper; two RAF upper-bound/compositor residue",
    latencyGoalMs: 100,
    raw,
  };
  await writeFile(
    path.join(output, `${phase}-raw.json`),
    JSON.stringify(scrub(result), null, 2) + "\n",
  );
  console.log(JSON.stringify({ phase, samples: runs * pairs * 2 }, null, 2));
} finally {
  await browser.close();
}
