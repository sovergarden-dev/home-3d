import { expect, test, type Page } from "@playwright/test";
import { P8_PACKAGE_TEXT } from "./helpers/p8-fixture";

const sentinel = "P10_SYNTHETIC_PRIVATE_SENTINEL_321";
async function open(page: Page, privateWorld = false) {
  await page.goto("/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 30000,
  });
  if (privateWorld) {
    await page.getByLabel("Mở gói world").setInputFiles({
      name: "synthetic-p10.json",
      mimeType: "application/json",
      buffer: Buffer.from(P8_PACKAGE_TEXT),
    });
    await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
  }
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
  const ready = (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(ready).toBe(true);
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.__p10Import("/src/memories/session.ts")).memorySession.getSnapshot().ready,
      ),
    )
    .toBe(true);
  return ready;
}
async function sampleMemory(page: Page, title = sentinel) {
  return page.evaluate(async (title) => {
    const { memorySession } = await window.__p10Import("/src/memories/session.ts");
    const { memoryCamera } = await window.__p10Import("/src/memories/bridge.ts");
    const pose = memoryCamera.getPose();
    const value = {
      id: crypto.randomUUID(),
      title,
      body: title,
      position: [0, 0, 0],
      camera: { ...pose, target: [...pose.target] },
      date: "2026-01-01",
      preset: "everyday",
      tags: [],
      photos: [],
      visibility: "private",
    };
    memorySession.saveMemory(value);
    return value;
  }, title);
}
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.__p10Import = (path) => {
      const entry = [...performance.getEntriesByType("resource")]
        .reverse()
        .find((e) => new URL(e.name).pathname === path);
      return import(/* @vite-ignore */ entry?.name ?? path);
    };
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost", "::1"].includes(url.hostname) ||
      ["blob:", "data:"].includes(url.protocol)
      ? route.continue()
      : route.abort();
  });
});
test("P10 real image pipeline strips synthetic JPEG EXIF Orientation/GPS/XMP and PNG/WebP metadata", async ({
  page,
}) => {
  await open(page);
  const result = await page.evaluate(async () => {
    const { processPhoto, getImagePipelineDiagnostics } = await window.__p10Import(
      "/src/memories/imagePipeline.ts",
    );
    const { assertNoMetadata } = await window.__p10Import("/src/memories/metadata.ts");
    const c = document.createElement("canvas");
    c.width = 80;
    c.height = 40;
    const ctx = c.getContext("2d")!;
    for (let x = 0; x < 80; x++) {
      ctx.fillStyle = x % 2 ? "#ff0000" : "#00ff00";
      ctx.fillRect(x, 0, 1, 40);
    }
    const encoded = async (type: string) =>
      new Uint8Array(
        await (await new Promise<Blob>((r) => c.toBlob((b) => r(b!), type))).arrayBuffer(),
      );
    const concat = (...parts: Uint8Array[]) => {
      const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
      let offset = 0;
      for (const p of parts) {
        out.set(p, offset);
        offset += p.length;
      }
      return out;
    };
    const text = (s: string) => new TextEncoder().encode(s);
    const app = (marker: number, data: Uint8Array) =>
      concat(new Uint8Array([255, marker, (data.length + 2) >> 8, (data.length + 2) & 255]), data);
    const jpeg = await encoded("image/jpeg");
    // Fully structured TIFF: Orientation plus GPS IFD for synthetic open ocean (10N, 150W).
    const tiff = new Uint8Array(140);
    const tv = new DataView(tiff.buffer);
    tiff.set([73, 73, 42, 0, 8, 0, 0, 0]);
    const entry = (offset: number, tag: number, type: number, count: number, value: number) => {
      tv.setUint16(offset, tag, true);
      tv.setUint16(offset + 2, type, true);
      tv.setUint32(offset + 4, count, true);
      tv.setUint32(offset + 8, value, true);
    };
    tv.setUint16(8, 2, true);
    entry(10, 0x112, 3, 1, 6);
    entry(22, 0x8825, 4, 1, 38);
    tv.setUint16(38, 4, true);
    entry(40, 1, 2, 2, 78);
    entry(52, 2, 5, 3, 92);
    entry(64, 3, 2, 2, 87);
    entry(76, 4, 5, 3, 116);
    for (let i = 0; i < 6; i++) {
      tv.setUint32(92 + i * 8, i === 0 ? 10 : i === 3 ? 150 : 0, true);
      tv.setUint32(96 + i * 8, 1, true);
    }
    const exif = concat(
      new Uint8Array([69, 120, 105, 102, 0, 0]),
      tiff,
      text("GPS_SYNTHETIC_SENTINEL"),
    );
    const dirtyJpeg = concat(
      jpeg.slice(0, 2),
      app(225, exif),
      app(225, text("http://ns.adobe.com/xap/1.0/\0XMP_SYNTHETIC_SENTINEL")),
      jpeg.slice(2),
    );
    const crc = (data: Uint8Array) => {
      let n = 0xffffffff;
      for (const v of data) {
        n ^= v;
        for (let i = 0; i < 8; i++) n = (n >>> 1) ^ (n & 1 ? 0xedb88320 : 0);
      }
      return (n ^ 0xffffffff) >>> 0;
    };
    const chunk = (kind: string, data: Uint8Array) => {
      const out = new Uint8Array(12 + data.length);
      const view = new DataView(out.buffer);
      view.setUint32(0, data.length);
      out.set(text(kind), 4);
      out.set(data, 8);
      view.setUint32(out.length - 4, crc(out.slice(4, -4)));
      return out;
    };
    const png = await encoded("image/png");
    const uprightTiff = tiff.slice();
    new DataView(uprightTiff.buffer).setUint16(18, 1, true);
    const dirtyPng = concat(
      png.slice(0, -12),
      chunk("eXIf", uprightTiff),
      chunk("tEXt", text("GPS\0GPS_SYNTHETIC_SENTINEL")),
      chunk("iTXt", text("XML:com.adobe.xmp\0\0\0\0\0XMP_SYNTHETIC_SENTINEL")),
      png.slice(-12),
    );
    const results = [];
    for (const [bytes, mime] of [
      [dirtyJpeg, "image/jpeg"],
      [dirtyPng, "image/png"],
    ] as const) {
      let dirtyRejected = false;
      try {
        assertNoMetadata(bytes);
      } catch {
        dirtyRejected = true;
      }
      const p = await processPhoto(new Blob([bytes], { type: mime }));
      const clean = Uint8Array.from(atob(p.dataUrl.split(",")[1]!), (x) => x.charCodeAt(0));
      assertNoMetadata(clean);
      for (const url of [p.thumbnail, p.placeholder])
        assertNoMetadata(Uint8Array.from(atob(url.split(",")[1]!), (x) => x.charCodeAt(0)));
      results.push({
        mime,
        dirtyRejected,
        width: p.width,
        height: p.height,
        clean: !new TextDecoder().decode(clean).includes("SYNTHETIC_SENTINEL"),
        placeholder: p.placeholder.length,
      });
    }
    const webp = await encoded("image/webp");
    if (new TextDecoder().decode(webp.slice(0, 4)) === "RIFF") {
      const payload = text("XMP_SYNTHETIC_SENTINEL");
      const extra = new Uint8Array(8 + payload.length + (payload.length % 2));
      extra.set(text("XMP "));
      new DataView(extra.buffer).setUint32(4, payload.length, true);
      extra.set(payload, 8);
      const exifChunk = new Uint8Array(8 + uprightTiff.length);
      exifChunk.set(text("EXIF"));
      new DataView(exifChunk.buffer).setUint32(4, uprightTiff.length, true);
      exifChunk.set(uprightTiff, 8);
      const dirty = concat(webp, exifChunk, extra);
      new DataView(dirty.buffer).setUint32(4, dirty.length - 8, true);
      let dirtyRejected = false;
      try {
        assertNoMetadata(dirty);
      } catch {
        dirtyRejected = true;
      }
      const p = await processPhoto(new Blob([dirty], { type: "image/webp" }));
      assertNoMetadata(Uint8Array.from(atob(p.dataUrl.split(",")[1]!), (x) => x.charCodeAt(0)));
      results.push({
        mime: "image/webp",
        dirtyRejected,
        width: p.width,
        height: p.height,
        clean: true,
        placeholder: p.placeholder.length,
      });
    }
    const original = await processPhoto(new Blob([png], { type: "image/png" }));
    const redacted = await processPhoto(new Blob([png], { type: "image/png" }), [
      { x: 0, y: 0, width: 1, height: 1 },
    ]);
    c.width = 0;
    c.height = 0;
    return {
      results,
      different: original.dataUrl !== redacted.dataUrl,
      reviewed: redacted.reviewed,
      keys: Object.keys(redacted),
      diagnostics: getImagePipelineDiagnostics(),
    };
  });
  expect(result.results[0]).toMatchObject({
    width: 40,
    height: 80,
    dirtyRejected: true,
    clean: true,
  });
  expect(result.results[1]).toMatchObject({
    width: 80,
    height: 40,
    dirtyRejected: true,
    clean: true,
  });
  for (const row of result.results) expect(row.placeholder).toBeLessThan(1024);
  expect(result.different).toBe(true);
  expect(result.reviewed).toBe(false);
  expect(result.keys).not.toContain("original");
});
test("P10 import always reprocesses memory AND journal photos; public export excludes private data", async ({
  page,
}) => {
  await open(page, true);
  const m = await sampleMemory(page);
  const result = await page.evaluate(async (m) => {
    const { memorySession } = await window.__p10Import("/src/memories/session.ts");
    const { processPhoto } = await window.__p10Import("/src/memories/imagePipeline.ts");
    const c = document.createElement("canvas");
    c.width = 32;
    c.height = 16;
    c.getContext("2d")!.fillRect(0, 0, 32, 16);
    const p = await processPhoto(
      await new Promise<Blob>((r) => c.toBlob((b) => r(b!), "image/png")),
    );
    const input = {
      schemaVersion: 1,
      memories: [{ ...m, photos: [{ ...p, reviewed: true }] }],
      journal: [
        {
          id: crypto.randomUUID(),
          date: "2026-01-01",
          stage: "land",
          body: "JOURNAL_PRIVATE",
          photos: [{ ...p, reviewed: true }],
        },
      ],
    };
    await memorySession.importDocument(JSON.stringify(input));
    const s = memorySession.getSnapshot();
    const publicDoc = JSON.parse(memorySession.exportDocument(true));
    return {
      memory: s.memories[0].photos[0],
      journal: s.journal[0].photos[0],
      oldId: p.id,
      publicDoc,
    };
  }, m);
  expect(result.memory.id).not.toBe(result.oldId);
  expect(result.journal.id).not.toBe(result.oldId);
  expect(result.memory.reviewed).toBe(false);
  expect(result.journal.reviewed).toBe(false);
  expect(result.publicDoc).toEqual({ schemaVersion: 1, memories: [], journal: [] });
});
test("P10 A→B→C/loading/error isolation; unconsented private data never enters network, URL or storage", async ({
  page,
}) => {
  const requests: string[] = [];
  const logs: string[] = [];
  page.on("request", (r) => requests.push(r.url() + " " + (r.postData() ?? "")));
  page.on("console", (m) => logs.push(m.text()));
  await open(page, true);
  await sampleMemory(page);
  const result = await page.evaluate(
    async ({ text, sentinel }) => {
      const { worldDataProvider: p } = await window.__p10Import(
        "/src/world/privateWorldSession.ts",
      );
      const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
      const wait = async () => {
        for (let i = 0; i < 100 && !s.getSnapshot().ready; i++)
          await new Promise((r) => setTimeout(r, 10));
        if (!s.getSnapshot().ready) throw Error("NOT_READY");
      };
      const states = [];
      for (const marker of ["B", "C"]) {
        p.openText(text.replaceAll("P8_SYNTHETIC_ATMOSPHERE_ONLY", `P10_SYNTHETIC_${marker}`));
        states.push(s.getSnapshot().memories.length);
        await wait();
        states.push(s.getSnapshot().memories.length);
      }
      p.openText("{}");
      states.push(s.getSnapshot().memories.length);
      p.openText(text);
      await wait();
      const restored = s.getSnapshot().memories.some((m) => m.title === sentinel);
      return {
        states,
        restored,
        url: location.href,
        storage: JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
        dbs: await indexedDB.databases(),
        store: JSON.stringify(
          (await window.__p10Import("/src/state/appStore.ts")).useAppStore.getState(),
        ),
      };
    },
    { text: P8_PACKAGE_TEXT, sentinel },
  );
  expect(result.states).toEqual([0, 0, 0, 0, 0]);
  expect(result.restored).toBe(true);
  expect(
    result.url + result.storage + result.store + requests.join("\n") + logs.join("\n"),
  ).not.toContain(sentinel);
  expect(result.dbs.map((d) => d.name)).not.toContain("pnm-p10");
  expect(
    requests.filter(
      (u) => !u.startsWith("http://127.0.0.1:") && !u.startsWith("blob:") && !u.startsWith("data:"),
    ),
  ).toEqual([]);
});
test("P10 opt-in IndexedDB survives reload; disabling writes retains RAM; all-device delete clears saved data", async ({
  page,
}) => {
  await open(page, true);
  await sampleMemory(page);
  await page.evaluate(async () => {
    const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
    await s.setPersistent(true);
  });
  await page.reload();
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 20000,
  });
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-p10.json",
    mimeType: "application/json",
    buffer: Buffer.from(P8_PACKAGE_TEXT),
  });
  const result = await page.evaluate(async () => {
    const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
    for (let i = 0; i < 100 && !s.getSnapshot().ready; i++)
      await new Promise((r) => setTimeout(r, 10));
    const off = s.getSnapshot().persistent;
    await s.setPersistent(true);
    const titles = s.getSnapshot().memories.map((m) => m.title);
    await s.setPersistent(false);
    const ram = s.getSnapshot().memories.length;
    await s.setPersistent(true);
    await s.clearAll();
    return { off, titles, ram, remaining: s.getSnapshot().memories.length };
  });
  expect(result.off).toBe(false);
  expect(result.titles).toContain(sentinel);
  expect(result.ram).toBeGreaterThan(0);
  expect(result.remaining).toBe(0);
});
test("P10 blocked/quota storage keeps RAM and reports only neutral code", async ({ page }) => {
  await open(page, true);
  const result = await page.evaluate(async () => {
    const { createMemorySession } = await window.__p10Import("/src/memories/session.ts");
    const s = createMemorySession({
      persistence: {
        read: async () => null,
        write: async () => {
          throw new DOMException("synthetic", "QuotaExceededError");
        },
        remove: async () => {
          throw Error("synthetic");
        },
      },
    });
    s.start();
    for (let i = 0; i < 100 && !s.getSnapshot().ready; i++)
      await new Promise((r) => setTimeout(r, 10));
    const m = {
      id: crypto.randomUUID(),
      title: "quota synthetic",
      body: "",
      position: [0, 0, 0],
      camera: { mode: "diorama", target: [0, 0, 0], yaw: 0, pitch: 0.5, distance: 30, zoom: 1 },
      date: "2026-01-01",
      preset: "everyday",
      tags: [],
      photos: [],
      visibility: "private",
    };
    s.saveMemory(m);
    await s.setPersistent(true);
    s.saveMemory({ ...m, body: "retained" });
    await new Promise((r) => setTimeout(r, 50));
    const out = {
      titles: s.getSnapshot().memories.map((m) => m.title),
      error: s.getSnapshot().error,
    };
    s.stop();
    return out;
  });
  expect(result.titles).toContain("quota synthetic");
  expect(result.error).toBe("PERSISTENCE_UNAVAILABLE");
});
test("P10 guest hides private memories, home label, marker/lot and construction diary", async ({
  page,
}) => {
  await open(page);
  await sampleMemory(page);
  await expect(page.getByTestId("memory-card").filter({ hasText: sentinel })).toBeVisible();
  await page.getByRole("switch", { name: "Xem như khách", exact: true }).check();
  await expect(page.getByTestId("memory-card").filter({ hasText: sentinel })).toHaveCount(0);
  await expect(page.getByText("Nhà mình", { exact: true })).not.toBeVisible();
  await expect(page.getByTestId("world-center-marker")).not.toBeVisible();
  await expect(page.getByTestId("memory-journal")).toHaveCount(0);
  await page.getByRole("switch", { name: "Xem như khách", exact: true }).uncheck();
  await expect(page.getByTestId("memory-card").filter({ hasText: sentinel })).toBeVisible();
});
test("P10 tour uses actual camera, restores pose, mode interruption, strict deep-link round trip", async ({
  page,
}) => {
  const ready = await open(page);
  test.skip(!ready, "Actual camera requires WebGL2; fallback remains covered");
  const result = await page.evaluate(async () => {
    const { memoryCamera: c } = await window.__p10Import("/src/memories/bridge.ts");
    const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
    const { useAppStore: a } = await window.__p10Import("/src/state/appStore.ts");
    const d = await window.__p10Import("/src/memories/deepLink.ts");
    const old = c.getPose();
    c.startTour(s.getSnapshot().memories);
    // Await actual camera progress, not an 80 ms assumption about software WebKit.
    const deadline = performance.now() + 5000;
    while (JSON.stringify(c.getPose()) === JSON.stringify(old) && performance.now() < deadline)
      await new Promise((r) => requestAnimationFrame(r));
    const active = c.getSnapshot().active;
    const moved = c.getPose();
    c.exit();
    const restored = c.getPose();
    c.startTour(s.getSnapshot().memories);
    a.getState().setViewMode("walk");
    const stopped = !c.getSnapshot().active;
    a.getState().setViewMode("diorama");
    const hash = d.buildMemoryHash({ pose: old, time: 420 });
    const parsed = d.parseMemoryHash(hash);
    const bad = [
      hash + "&secret=bad",
      hash.replace("v=1", "v=2"),
      hash.replace(/distance=[^&]*/, "distance=NaN"),
      hash.replace(/zoom=[^&]*/, "zoom=999999"),
      hash + "&yaw=0",
    ].map((x) => d.parseMemoryHash(x).valid);
    return { old, active, moved, restored, stopped, parsed, bad };
  });
  expect(result.active).toBe(true);
  expect(result.moved).not.toEqual(result.old);
  expect(result.restored).toEqual(result.old);
  expect(result.stopped).toBe(true);
  expect(result.parsed.valid).toBe(true);
  expect(result.bad).toEqual([false, false, false, false, false]);
});
test("P10 postcard renders actual scene at desktop 4K and mobile 2K, cancels and restores canvas", async ({
  page,
}) => {
  const ready = await open(page);
  test.skip(!ready, "Postcard GPU capture requires WebGL2, not counted as GPU pass");
  const result = await page.evaluate(async () => {
    const p = await window.__p10Import("/src/memories/postcard.ts");
    const { assertNoMetadata } = await window.__p10Import("/src/memories/metadata.ts");
    const canvas = document.querySelector('[data-testid="demo-scene"] canvas') as HTMLCanvasElement;
    const before = [canvas.width, canvas.height];
    const desktop = await p.createPostcard({ ward: "", date: "2026-01-01", minutes: 420 });
    const mobile = await p.createPostcard({
      ward: "Ví dụ tổng hợp",
      date: "2026-01-01",
      minutes: 420,
      mobile: true,
    });
    const size = async (blob: Blob) => {
      assertNoMetadata(new Uint8Array(await blob.arrayBuffer()));
      const b = await createImageBitmap(blob);
      const out = [b.width, b.height];
      b.close();
      return out;
    };
    const abort = new AbortController();
    abort.abort();
    let cancelled = false;
    try {
      await p.createPostcard({ ward: "", date: "2026-01-01", minutes: 420, signal: abort.signal });
    } catch {
      cancelled = true;
    }
    return {
      desktop: await size(desktop.blob),
      mobile: await size(mobile.blob),
      degraded: desktop.degraded,
      before,
      after: [canvas.width, canvas.height],
      cancelled,
      address: p.isAddressLike("12 đường ví dụ"),
    };
  });
  expect(result.desktop).toEqual([3840, 2160]);
  expect(result.mobile).toEqual([2048, 1152]);
  expect(result.degraded).toBe(false);
  expect(result.before).toEqual(result.after);
  expect(result.cancelled).toBe(true);
  expect(result.address).toBe(true);
});
for (const viewport of [
  { width: 1440, height: 900 },
  { width: 390, height: 844 },
  { width: 740, height: 390 },
])
  test(`P10 editor photo <=6 actions, keyboard focus/Escape, XSS text at ${viewport.width}x${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const ready = await open(page, true);
    if (!ready) {
      await expect(page.getByRole("button", { name: "Thêm kỷ niệm", exact: true })).toBeDisabled();
      test.skip(true, "WebGL2 unavailable; add camera requires rendered scene");
    }
    let actions = 0;
    const started = Date.now();
    await page.getByRole("button", { name: "Thêm kỷ niệm", exact: true }).click();
    actions++;
    const dialog = page.getByRole("dialog", { name: "Biên tập kỷ niệm", exact: true });
    const title = "<img src=x onerror=alert(1)>";
    await dialog.getByLabel("Tên kỷ niệm", { exact: true }).fill(title);
    actions++;
    const png = await page.evaluate(() => {
      const c = document.createElement("canvas");
      c.width = 32;
      c.height = 16;
      c.getContext("2d")!.fillRect(0, 0, 32, 16);
      return c.toDataURL("image/png").split(",")[1]!;
    });
    const choosing = page.waitForEvent("filechooser");
    await dialog.getByRole("button", { name: "Thêm ảnh", exact: true }).click();
    actions++;
    const chooser = await choosing;
    await chooser.setFiles({
      name: "P10_SYNTHETIC_FILENAME.png",
      mimeType: "image/png",
      buffer: Buffer.from(png, "base64"),
    });
    actions++;
    await expect(dialog.getByAltText("Ảnh kỷ niệm", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Lưu", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Lưu", exact: true }).click();
    actions++;
    await expect(page.getByTestId("memory-card").filter({ hasText: title })).toBeVisible();
    expect(actions).toBeLessThanOrEqual(6);
    expect(Date.now() - started).toBeLessThan(120000);
    expect(await page.locator('img[onerror],script:has-text("synthetic")').count()).toBe(0);
    await page.getByRole("button", { name: "Sửa", exact: true }).click();
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Tab");
    expect(await dialog.evaluate((e) => e.contains(document.activeElement))).toBe(true);
    expect(
      await dialog
        .getByRole("button", { name: "Lưu", exact: true })
        .evaluate((e) => e.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
      true,
    );
  });
