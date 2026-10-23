import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const phase = process.argv[2] ?? process.env.R7_PHASE ?? "before";
const port = Number(process.argv[3] ?? process.env.R7_PORT ?? (phase === "before" ? 4184 : 4178));
const output = path.resolve(process.argv[4] ?? "/tmp/p10-r7");
const baseURL = `http://127.0.0.1:${port}`;
const startedAt = new Date().toISOString();
await mkdir(output, { recursive: true });

const browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
const raw = [];
try {
  for (let run = 0; run < 3; run++) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: 1,
      reducedMotion: "reduce",
    });
    const otherExternal = [],
      fontAborts = [],
      pageErrors = [];
    page.on("console", (message) => console.error(`[browser:${message.type()}] ${message.text()}`));
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.addInitScript(() => {
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
        return import(entry?.name ?? pathname);
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
    await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
    await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
    await expect(page.getByTestId("memory-card")).toHaveCount(3);
    await page.evaluate(async () => {
      (await window.__p10Import("/src/state/appStore.ts")).useAppStore.setState({
        selectedDate: "2026-06-21",
        timeOfDayMinutes: 420,
        timeSpeed: 0,
        lifeEnabled: false,
        festivalAuto: false,
        festival: "normal",
        heading: 28,
        zoom: 1,
      });
      await window.__p10R7PatchThree();
    });
    await page.waitForTimeout(5000);
    const samples = await page.evaluate(async () => {
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
      for (let i = s.getSnapshot().memories.length; i < 299; i++) s.saveMemory(item(i));
      await new Promise((resolve) => setTimeout(resolve, 5000));
      const frame = () =>
        new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const samples = [];
      for (let i = 0; i < 5; i++) {
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
    });
    expect(otherExternal).toEqual([]);
    expect(pageErrors).toEqual([]);
    for (const sample of samples) expect(sample.rebuildPinInstanceCalls).toBe(sample.count);
    raw.push({ run, samples, otherExternalCount: otherExternal.length, fontAborts, pageErrors });
    await page.close();
    console.log(`R7 ${phase} run ${run + 1}/3`);
  }
  const result = {
    syntheticOnly: true,
    phase,
    baseURL,
    startedAt,
    finishedAt: new Date().toISOString(),
    viewport: [1440, 900],
    dpr: 1,
    reducedMotion: true,
    date: "2026-06-21",
    timeMinutes: 420,
    heading: 28,
    zoom: 1,
    warmupMs: 5000,
    postPopulationWarmupMs: 5000,
    fixturePopulation: "299→300→299",
    sampleDesign: "3 runs × 5 add/delete pairs (30 samples)",
    measurement:
      "real saveMemory/deleteMemory call; structuredClone/MemoryDocument Map.set wrappers; React MutationObserver card timestamps; InstancedMesh.setMatrixAt wrapper; two RAF upper-bound/compositor residue",
    latencyGoalMs: 100,
    raw,
  };
  await writeFile(path.join(output, `${phase}-raw.json`), JSON.stringify(result, null, 2) + "\n");
  console.log(
    JSON.stringify({ phase, output: path.join(output, `${phase}-raw.json`), samples: 30 }, null, 2),
  );
} finally {
  await browser.close();
}
