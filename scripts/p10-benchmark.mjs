import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";
import { P8_PACKAGE_TEXT } from "../tests/e2e/helpers/p8-fixture.ts";
const mode = process.argv[2] ?? "perf";
const out = path.resolve(process.argv[3] ?? "test-results/p10-evidence");
const port = Number(process.env.P10_PORT ?? 4178);
fs.mkdirSync(out, { recursive: true });
const write = (name, value) =>
  fs.writeFileSync(path.join(out, name), JSON.stringify(value, null, 2));
const browser = await chromium.launch({
  headless: true,
  args: ["--enable-unsafe-swiftshader", "--js-flags=--expose-gc"],
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 900 },
  deviceScaleFactor: 1,
  reducedMotion: "no-preference",
});
const errors = [];
page.on("console", (m) => {
  if (/^P10_BENCH (pins|images|capture4k|capture2k)$/.test(m.text())) console.log(m.text());
});
page.on("pageerror", (e) => errors.push(e.name));
await page.addInitScript(() => {
  window.__p10Import = (path) => {
    const e = [...performance.getEntriesByType("resource")]
      .reverse()
      .find((e) => new URL(e.name).pathname === path);
    return import(e?.name ?? path);
  };
  const state = {
    urls: 0,
    bitmap: 0,
    idb: 0,
    raf: 0,
    audio: 0,
    createdUrls: 0,
    closedUrls: 0,
    createdBitmap: 0,
    closedBitmap: 0,
  };
  window.__p10ResourceCounts = state;
  const create = URL.createObjectURL.bind(URL),
    revoke = URL.revokeObjectURL.bind(URL),
    urls = new Set();
  URL.createObjectURL = (blob) => {
    const url = create(blob);
    urls.add(url);
    state.urls = urls.size;
    state.createdUrls++;
    return url;
  };
  URL.revokeObjectURL = (url) => {
    if (urls.delete(url)) state.closedUrls++;
    state.urls = urls.size;
    return revoke(url);
  };
  if (window.createImageBitmap) {
    const make = window.createImageBitmap.bind(window);
    window.createImageBitmap = async (...args) => {
      const bitmap = await make(...args);
      state.bitmap++;
      state.createdBitmap++;
      let closed = false;
      const close = bitmap.close.bind(bitmap);
      bitmap.close = () => {
        if (!closed) {
          closed = true;
          state.bitmap--;
          state.closedBitmap++;
        }
        close();
      };
      return bitmap;
    };
  }
  const request = window.requestAnimationFrame.bind(window),
    cancel = window.cancelAnimationFrame.bind(window),
    frames = new Set();
  window.requestAnimationFrame = (fn) => {
    let id = request((t) => {
      frames.delete(id);
      state.raf = frames.size;
      fn(t);
    });
    frames.add(id);
    state.raf = frames.size;
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    frames.delete(id);
    state.raf = frames.size;
    cancel(id);
  };
  const open = IDBFactory.prototype.open;
  IDBFactory.prototype.open = function (...args) {
    const req = open.apply(this, args);
    req.addEventListener("success", () => {
      const db = req.result;
      state.idb++;
      let closed = false;
      const close = db.close.bind(db);
      db.close = () => {
        if (!closed) {
          closed = true;
          state.idb--;
        }
        return close();
      };
    });
    return req;
  };
  if (window.AudioContext) {
    const Original = window.AudioContext;
    window.AudioContext = new Proxy(Original, {
      construct(Target, args) {
        const ctx = new Target(...args);
        state.audio++;
        const close = ctx.close.bind(ctx);
        ctx.close = async () => {
          const r = await close();
          state.audio--;
          return r;
        };
        return ctx;
      },
    });
  }
});
async function open() {
  await page.goto(`http://127.0.0.1:${port}/?local-preview=1`);
  await page.waitForFunction(
    () => document.querySelector("#scene-root")?.dataset.sceneState === "ready",
    {},
    { timeout: 30000 },
  );
  await page.evaluate(async () => {
    const { useAppStore: s } = await window.__p10Import("/src/state/appStore.ts");
    s.setState({
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
}
async function samples(ms = 10000) {
  return page.evaluate(
    (ms) =>
      new Promise((resolve) => {
        const values = [];
        let last = performance.now();
        const end = last + ms;
        function frame(now) {
          values.push(now - last);
          last = now;
          if (now < end) requestAnimationFrame(frame);
          else resolve(values);
        }
        requestAnimationFrame(frame);
      }),
    ms,
  );
}
async function resources() {
  return page.evaluate(async () => ({
    elapsed: performance.now(),
    counts: { ...window.__p10ResourceCounts },
    canvas: document.querySelectorAll('[data-testid="demo-scene"] canvas').length,
    scene: { ...document.querySelector('[data-testid="demo-scene"]')?.dataset },
    media: (
      await window.__p10Import("/src/memories/imagePipeline.ts")
    ).getImagePipelineDiagnostics(),
    audio: (await window.__p10Import("/src/memories/audio.ts")).getAudioDiagnostics(),
    persistence: (await window.__p10Import("/src/memories/session.ts")).memorySession.diagnostics(),
    heap: performance.memory
      ? { used: performance.memory.usedJSHeapSize, total: performance.memory.totalJSHeapSize }
      : null,
  }));
}
try {
  if (mode === "soak") {
    await open();
    await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
    await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
    const cdp = await page.context().newCDPSession(page);
    const raw = [];
    const start = Date.now();
    const duration = Number(process.env.P10_SOAK_MS ?? 1200000);
    let cycle = 0;
    while (Date.now() - start < duration || cycle < Number(process.env.P10_MIN_CYCLES ?? 20)) {
      cycle++;
      const began = Date.now();
      await page.evaluate(
        async ({ cycle, text }) => {
          const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
          const { memoryCamera: c } = await window.__p10Import("/src/memories/bridge.ts");
          const { worldDataProvider: w } = await window.__p10Import(
            "/src/world/privateWorldSession.ts",
          );
          const { processPhoto } = await window.__p10Import("/src/memories/imagePipeline.ts");
          const { createPostcard: p } = await window.__p10Import("/src/memories/postcard.ts");
          const canvas = document.createElement("canvas");
          canvas.width = 800;
          canvas.height = 600;
          canvas.getContext("2d").fillRect(0, 0, 800, 600);
          const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
          canvas.width = canvas.height = 0;
          const photo = await processPhoto(blob);
          const pose = c.getPose();
          const m = {
            id: crypto.randomUUID(),
            title: "Ví dụ tổng hợp",
            body: "",
            position: [0, 0, 0],
            camera: { ...pose, target: [...pose.target] },
            date: "2026-06-21",
            preset: "everyday",
            tags: [],
            photos: [photo],
            visibility: "private",
          };
          s.saveMemory(m);
          c.startTour(s.getSnapshot().memories);
          await new Promise((r) => setTimeout(r, 1400));
          c.pause();
          c.next();
          c.exit();
          await p({ ward: "", date: "2026-06-21", minutes: 420, mobile: true });
          s.deleteMemory(m.id);
          s.undoDelete();
          s.deleteMemory(m.id);
          s.setGuest(true);
          s.setGuest(false);
          await s.setPersistent(true);
          await s.setPersistent(false);
          w.openText(text.replaceAll("P8_SYNTHETIC_ATMOSPHERE_ONLY", `P10_SOAK_${cycle % 3}`));
          for (let i = 0; i < 100 && !s.getSnapshot().ready; i++)
            await new Promise((r) => setTimeout(r, 10));
          w.resetFixture();
          for (let i = 0; i < 100 && !s.getSnapshot().ready; i++)
            await new Promise((r) => setTimeout(r, 10));
        },
        { cycle, text: P8_PACKAGE_TEXT },
      );
      await page.getByRole("button", { name: "Thêm kỷ niệm", exact: true }).click();
      await page.keyboard.press("Escape");
      if (cycle % 5 === 0) {
        await page
          .getByRole("link", { name: "Phố Nhà Mình", exact: true })
          .count()
          .then(async (n) => {
            if (n)
              await page.getByRole("link", { name: "Phố Nhà Mình", exact: true }).first().click();
          });
        await page.goto(`http://127.0.0.1:${port}/about`);
        await open();
        await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
        await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
      }
      await page.evaluate(() => window.gc?.());
      await page.waitForTimeout(500);
      raw.push({
        cycle,
        wallMs: Date.now() - start,
        cycleMs: Date.now() - began,
        ...(await resources()),
        dom: await cdp.send("Memory.getDOMCounters"),
      });
      write("soak-raw.json", {
        durationTarget: duration,
        elapsedMs: Date.now() - start,
        cycles: cycle,
        raw,
        errors,
      });
      console.log(
        `soak ${cycle} cycles; ${(Date.now() - start) / 1000}s; openURLs=${raw.at(-1).counts.urls}; bitmaps=${raw.at(-1).counts.bitmap}`,
      );
      const next = Math.min(start + duration, start + cycle * 58000);
      if (Date.now() < next) await page.waitForTimeout(next - Date.now());
    }
    write("soak-raw.json", {
      complete: true,
      durationTarget: duration,
      elapsedMs: Date.now() - start,
      cycles: cycle,
      raw,
      errors,
    });
  } else {
    const raw = [];
    for (let run = 0; run < 3; run++) {
      await open();
      const baseline = await samples();
      const before = await resources();
      const work = await page.evaluate(async () => {
        const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
        const { memoryCamera: c } = await window.__p10Import("/src/memories/bridge.ts");
        const { processPhoto } = await window.__p10Import("/src/memories/imagePipeline.ts");
        const { createPostcard: p } = await window.__p10Import("/src/memories/postcard.ts");
        const base = c.getPose();
        const original = JSON.parse(s.exportDocument());
        const mutations = [];
        console.log("P10_BENCH pins");
        for (let i = 0; i < 297; i++)
          s.saveMemory({
            id: crypto.randomUUID(),
            title: "Ví dụ tổng hợp",
            body: "",
            position: [(i % 18) * 5 - 45, 0, Math.floor(i / 18) * 5 - 40],
            camera: { ...base, target: [(i % 18) * 5 - 45, 0, Math.floor(i / 18) * 5 - 40] },
            date: "2026-06-21",
            preset: "everyday",
            tags: [],
            photos: [],
            visibility: "public",
          });
        // Allow the 300-card React commit and GPU queue to settle before measuring mutations.
        await new Promise((resolve) => setTimeout(resolve, 5000));
        for (let i = 0; i < 5; i++) {
          const id = s.getSnapshot().memories.at(-1).id;
          const t = performance.now();
          s.deleteMemory(id);
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          mutations.push({ kind: "delete", ms: performance.now() - t });
          const t2 = performance.now();
          s.undoDelete();
          await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
          mutations.push({ kind: "add", ms: performance.now() - t2 });
        }
        const canvas = document.createElement("canvas");
        canvas.width = 4000;
        canvas.height = 3000;
        const ctx = canvas.getContext("2d");
        ctx.fillStyle = "#4a5c70";
        ctx.fillRect(0, 0, 4000, 3000);
        const input = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.9));
        canvas.width = canvas.height = 0;
        console.log("P10_BENCH images");
        const images = [];
        for (let i = 0; i < 7; i++) {
          const t = performance.now();
          await processPhoto(input);
          images.push(performance.now() - t);
        }
        const captures = [];
        for (const mobile of [false, true]) {
          console.log(mobile ? "P10_BENCH capture2k" : "P10_BENCH capture4k");
          const t = performance.now();
          const image = await p({ ward: "", date: "2026-06-21", minutes: 420, mobile });
          captures.push({
            ms: performance.now() - t,
            width: image.width,
            height: image.height,
            degraded: image.degraded,
            encodedBytes: image.blob.size,
            estimatedCpuPixelBytes: image.width * image.height * 16,
          });
        }
        const stationary300 = { ...document.querySelector('[data-testid="demo-scene"]').dataset };
        c.startTour(s.getSnapshot().memories.slice(0, 5));
        return { original, mutations, images, captures, stationary300 };
      });
      const with300 = await samples();
      const after = await resources();
      await page.evaluate(() =>
        window.__p10Import("/src/memories/bridge.ts").then(({ memoryCamera: c }) => c.exit()),
      );
      raw.push({ run, baseline, with300, before, after, ...work });
      console.log(`perf run ${run + 1}/3`);
    }
    write("after-raw.json", {
      fixture: "synthetic demo",
      camera: { heading: 28, zoom: 1 },
      date: "2026-06-21",
      time: 420,
      viewport: [1440, 900],
      dpr: 1,
      warmupMs: 5000,
      renderer: "SwiftShader; NOT physical GPU; CPU pixel estimate is NOT GPU memory",
      raw,
      errors,
    });
  }
} finally {
  await browser.close();
}
