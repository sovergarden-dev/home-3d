import { expect } from "@playwright/test";
import { launchBenchmark } from "./benchmark-browser.mjs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const output = path.resolve(process.argv[2] ?? "/tmp/p10-evidence");
await mkdir(output, { recursive: true });
const { browser, dpr, environment } = await launchBenchmark();
let rendererEvidence;
const raw = [];
try {
  for (let run = 0; run < 3; run++) {
    const page = await browser.newPage({
      viewport: { width: 1440, height: 900 },
      deviceScaleFactor: dpr,
      reducedMotion: "reduce",
    });
    await page.addInitScript(() => {
      window.__p10Import = (p) => {
        const e = [...performance.getEntriesByType("resource")]
          .reverse()
          .find((e) => new URL(e.name).pathname === p);
        return import(e?.name ?? p);
      };
    });
    await page.route("**/*", (r) =>
      new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : r.abort(),
    );
    await page.goto(`http://127.0.0.1:${process.env.P10_PORT ?? 4178}/?local-preview=1`);
    await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
      timeout: 60000,
    });
    rendererEvidence = await environment(page);
    await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
    await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
    await expect(page.getByTestId("memory-card")).toHaveCount(3);
    await page.evaluate(async () => {
      (await window.__p10Import("/src/state/appStore.ts")).useAppStore.setState({
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
      for (let i = 0; i < 296; i++) s.saveMemory(item(i));
      await new Promise((r) => setTimeout(r, 5000));
      const samples = [];
      const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      for (let i = 0; i < 5; i++) {
        const value = item(296 + i);
        let t = performance.now();
        s.saveMemory(value);
        const cpuAdd = performance.now() - t;
        await frame();
        samples.push({
          kind: "add",
          ms: performance.now() - t,
          cpuMs: cpuAdd,
          count: s.getSnapshot().memories.length,
        });
        t = performance.now();
        s.deleteMemory(value.id);
        const cpuDelete = performance.now() - t;
        await frame();
        samples.push({
          kind: "delete",
          ms: performance.now() - t,
          cpuMs: cpuDelete,
          count: s.getSnapshot().memories.length,
        });
      }
      return samples;
    });
    raw.push({ run, samples });
    await page.close();
    console.log(`P10 true add/delete latency run ${run + 1}/3`);
  }
  await writeFile(
    path.join(output, "latency-raw.json"),
    JSON.stringify(
      {
        syntheticOnly: true,
        viewport: [1440, 900],
        dpr,
        environment: rendererEvidence,
        date: "2026-06-21",
        time: 420,
        heading: 28,
        zoom: 1,
        warmupMs: 5000,
        postPopulationWarmupMs: 5000,
        ui: "Memories dock mounted; 299→300→299",
        measurement:
          "real saveMemory/deleteMemory call to two subsequent RAF callbacks; upper bound, not physical GPU latency",
        goalMs: 100,
        raw,
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
