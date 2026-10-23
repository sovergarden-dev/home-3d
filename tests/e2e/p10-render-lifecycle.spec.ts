import { expect, test, type Page } from "@playwright/test";
async function open(page: Page) {
  await page.goto("/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 30000,
  });
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
  await expect
    .poll(() =>
      page.evaluate(
        async () =>
          (await window.__p10Import("/src/memories/session.ts")).memorySession.getSnapshot().ready,
      ),
    )
    .toBe(true);
  return (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
}
test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.__p10Import = (path) => {
      const e = [...performance.getEntriesByType("resource")]
        .reverse()
        .find((e) => new URL(e.name).pathname === path);
      return import(/* @vite-ignore */ e?.name ?? path);
    };
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (["127.0.0.1", "localhost", "::1"].includes(url.hostname)) return route.continue();
    if (["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) return route.abort();
    return route.abort();
  });
});
test("P10 pins alter real captured pixels without world rebuild", async ({ page }) => {
  const ready = await open(page);
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(ready).toBe(true);
  test.skip(!ready, "WebGL2 unavailable; pixel proof is not a GPU pass");
  const result = await page.evaluate(async () => {
    const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
    const { memoryCamera: c } = await window.__p10Import("/src/memories/bridge.ts");
    const { useAppStore: state } = await window.__p10Import("/src/state/appStore.ts");
    const { worldDataProvider: w } = await window.__p10Import("/src/world/privateWorldSession.ts");
    const { captureDemoFrame } = await window.__p10Import("/src/engine/capture.ts");
    state.setState({ lifeEnabled: false, timeSpeed: 0 });
    c.exit();
    await s.clearAll();
    const epoch = w.getPackageEpoch(),
      revision = w.getSnapshot().revision;
    const before = captureDemoFrame();
    const pose = c.getPose();
    for (let i = 0; i < 30; i++)
      s.saveMemory({
        id: crypto.randomUUID(),
        title: "Ví dụ tổng hợp",
        body: "",
        position: [(i % 6) * 14 - 35, 0, Math.floor(i / 6) * 14 - 28],
        camera: pose,
        date: "2026-06-21",
        preset: "everyday",
        tags: [],
        photos: [],
        visibility: "public",
      });
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    const after = captureDemoFrame();
    async function pixels(url: string) {
      const image = new Image();
      image.src = url;
      await image.decode();
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(image, 0, 0);
      const data = ctx.getImageData(0, 0, image.width, image.height).data;
      canvas.width = canvas.height = 0;
      return data;
    }
    const a = await pixels(before),
      b = await pixels(after);
    let changed = 0;
    for (let i = 0; i < a.length; i += 4)
      if (
        Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) >
        30
      )
        changed++;
    return {
      changed,
      epochSame: epoch === w.getPackageEpoch(),
      revisionSame: revision === w.getSnapshot().revision,
      pins: document.querySelector<HTMLElement>('[data-testid="demo-scene"]')!.dataset.memoryPins,
    };
  });
  expect(result.changed).toBeGreaterThan(20);
  expect(result.epochSame).toBe(true);
  expect(result.revisionSame).toBe(true);
  expect(result.pins).toBe("30");
});
test("P10 journal before/after keyboard slider and VI/EN stay private", async ({ page }) => {
  await open(page);
  await page.evaluate(async () => {
    const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
    const { processPhoto } = await window.__p10Import("/src/memories/imagePipeline.ts");
    const photos = [];
    for (const color of ["#e48647", "#24698b"]) {
      const canvas = document.createElement("canvas");
      canvas.width = 320;
      canvas.height = 240;
      canvas.getContext("2d")!.fillStyle = color;
      canvas.getContext("2d")!.fillRect(0, 0, 320, 240);
      const blob = await new Promise<Blob>((r) => canvas.toBlob((b) => r(b!), "image/png"));
      photos.push(await processPhoto(blob));
      canvas.width = canvas.height = 0;
    }
    for (let i = 0; i < 2; i++)
      s.saveJournal({
        id: crypto.randomUUID(),
        date: `2026-06-${20 + i}`,
        stage: i ? "frame" : "land",
        body: "Ví dụ tổng hợp",
        photos: [photos[i]],
      });
  });
  const slider = page.getByRole("slider", { name: "Mức hiển thị ảnh sau", exact: true });
  await expect(slider).toBeVisible();
  const old = await slider.inputValue();
  await slider.focus();
  await page.keyboard.press("ArrowRight");
  expect(await slider.inputValue()).not.toBe(old);
  await page.evaluate(async () => {
    (await window.__p10Import("/src/state/appStore.ts")).useAppStore.setState({ language: "en" });
  });
  await expect(page.getByRole("heading", { name: "Home journal", exact: true })).toBeVisible();
  await page.evaluate(async () => {
    (await window.__p10Import("/src/memories/session.ts")).memorySession.setGuest(true);
  });
  await expect(page.getByTestId("memory-journal")).toHaveCount(0);
});
test("P10 actual flight freezes for pause/hidden and reduced motion jumps", async ({ page }) => {
  const ready = await open(page);
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(ready).toBe(true);
  test.skip(!ready, "WebGL2 unavailable; no camera GPU claim");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect
    .poll(() => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches))
    .toBe(false);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const result = await page.evaluate(async () => {
    const { memoryCamera: c } = await window.__p10Import("/src/memories/bridge.ts");
    const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    c.startTour(s.getSnapshot().memories);
    await wait(120);
    c.pause();
    await wait(50);
    const paused = c.getPose();
    await wait(180);
    const pausedAfter = c.getPose();
    c.pause();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
    document.dispatchEvent(new Event("visibilitychange"));
    const hidden = c.getPose();
    await wait(200);
    const hiddenAfter = c.getPose();
    Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
    document.dispatchEvent(new Event("visibilitychange"));
    await wait(80);
    const finite = c.getPose().target.every(Number.isFinite);
    c.exit();
    return { paused, pausedAfter, hidden, hiddenAfter, finite };
  });
  expect(result.pausedAfter).toEqual(result.paused);
  expect(result.hiddenAfter).toEqual(result.hidden);
  expect(result.finite).toBe(true);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect
    .poll(() => page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches))
    .toBe(true);
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  const jumped = await page.evaluate(async () => {
    const { memoryCamera: c } = await window.__p10Import("/src/memories/bridge.ts");
    const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
    const m = s.getSnapshot().memories[0];
    c.flyTo(m);
    const pose = c.getPose();
    c.exit();
    return { pose, target: m.camera.target };
  });
  jumped.pose.target.forEach((value: number, index: number) =>
    expect(value).toBeCloseTo(jumped.target[index], 10),
  );
});
