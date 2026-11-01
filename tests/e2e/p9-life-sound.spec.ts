import { createHash } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { P8_PACKAGE_TEXT } from "./helpers/p8-fixture";
const sentinel = "P9_SYNTHETIC_NO_NETWORK_90421";
const packageText = P8_PACKAGE_TEXT.replaceAll("P8_SYNTHETIC_ATMOSPHERE_ONLY", sentinel);
async function store(page: Page, patch: Record<string, unknown>) {
  await page.evaluate(async (next) => {
    const url = performance
      .getEntriesByType("resource")
      .find((entry) => new URL(entry.name).pathname === "/src/state/appStore.ts")?.name;
    if (!url) throw Error("ACTIVE_STORE_MODULE_MISSING");
    (await import(url)).useAppStore.setState(next);
  }, patch);
}
async function open(page: Page) {
  await page.goto("/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 20000,
  });
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "p9-synthetic.json",
    mimeType: "application/json",
    buffer: Buffer.from(packageText),
  });
  await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await store(page, {
    selectedDate: "2026-06-21",
    timeOfDayMinutes: 420,
    festivalAuto: false,
    festival: "normal",
    realTimeEnabled: false,
    timeSpeed: 0,
  });
  const ready = (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(ready).toBe(true);
  return ready;
}
async function pixels(page: Page) {
  return page.evaluate(async () => {
    const url = performance
      .getEntriesByType("resource")
      .find((entry) => new URL(entry.name).pathname === "/src/engine/capture.ts")?.name;
    if (!url) throw Error("CAPTURE_MODULE_MISSING");
    return (await import(url)).captureDemoFrame();
  });
}
const scene = (page: Page) => page.getByTestId("demo-scene");
test.describe("P9 synthetic life and sound", () => {
  test.beforeEach(async ({ context }) => {
    await context.route("**/*", (route) => {
      const u = new URL(route.request().url());
      return ["127.0.0.1", "localhost", "::1"].includes(u.hostname) ||
        ["data:", "blob:"].includes(u.protocol)
        ? route.continue()
        : route.abort();
    });
  });
  test("local fixture, life toggle, walk, ride and sound send no data; real activation stays blocked", async ({
    page,
  }) => {
    const logs: string[] = [];
    page.on("console", (message) => logs.push(message.text()));
    const ready = await open(page);
    const requests: string[] = [];
    page.on("request", (request) => requests.push(`${request.url()} ${request.postData() ?? ""}`));
    if (ready) {
      await page.getByRole("switch", { name: "Lớp sống", exact: true }).click();
      await page.getByRole("switch", { name: "Lớp sống", exact: true }).click();
      for (const name of ["Đi bộ", "Ngồi sau xe ôm", "Diorama"])
        await page.getByRole("radio", { name, exact: true }).click();
      await page.getByRole("button", { name: "Tiếng phố", exact: true }).click();
      await page.getByRole("button", { name: "Tiếng phố", exact: true }).click();
    } else {
      await expect(page.getByRole("radio", { name: "Đi bộ", exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "Tiếng phố", exact: true })).toBeDisabled();
    }
    expect(
      requests.filter(
        (url) =>
          !url.startsWith("http://127.0.0.1:") &&
          !url.startsWith("blob:") &&
          !url.startsWith("data:"),
      ),
    ).toEqual([]);
    expect(requests.join("\n")).not.toContain(sentinel);
    expect(logs.join("\n")).not.toContain(sentinel);
    expect(
      await page.evaluate(
        () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
      ),
    ).not.toContain(sentinel);
    await page.getByRole("tab", { name: "Thời tiết", exact: true }).click();
    await expect(page.getByRole("button", { name: "Thời tiết thật", exact: true })).toBeDisabled();
    await expect(
      page.getByRole("status").filter({ hasText: "BLOCKED_MISSING_GEOREFERENCE" }),
    ).toBeVisible();
  });
  test("life is visible in real pixels, Plan hides it and Pause does not advance simulation", async ({
    page,
  }) => {
    const ready = await open(page);
    test.skip(!ready, "GPU pixel simulation requires WebGL2; fallback is tested separately");
    await expect(scene(page)).toHaveAttribute("data-life-graph-ready", "true");
    await expect(scene(page)).toHaveAttribute("data-life-agents", /[1-9]\d*/);
    const before = await pixels(page);
    await store(page, { lifeEnabled: false });
    const after = await pixels(page);
    expect(before).toMatch(/^data:image\/png/);
    expect(after).not.toBe(before);
    await store(page, { lifeEnabled: true, viewMode: "topdown" });
    await expect(scene(page)).toHaveAttribute("data-life-visible", "false");
    await store(page, { viewMode: "diorama", timeSpeed: 1 });
    await expect
      .poll(async () => +((await scene(page).getAttribute("data-life-clock")) ?? 0))
      .toBeGreaterThan(0.1);
    await store(page, { timeSpeed: 0 });
    await pixels(page);
    const clock = +((await scene(page).getAttribute("data-life-clock")) ?? 0);
    await page.waitForTimeout(400);
    await pixels(page);
    expect(+((await scene(page).getAttribute("data-life-clock")) ?? 0)).toBeCloseTo(clock, 1);
  });
  test("POV is eye level, exit keeps package and camera, keyboard releases; ride pause and tilt remain optional", async ({
    page,
  }) => {
    const ready = await open(page);
    test.skip(!ready, "POV GPU integration requires WebGL2");
    const original = await page.evaluate(async () => {
      const url = performance
        .getEntriesByType("resource")
        .find((e) => new URL(e.name).pathname === "/src/world/privateWorldSession.ts")?.name;
      if (!url) throw Error("SESSION_MISSING");
      return JSON.stringify((await import(url)).worldDataProvider.exportWorkingPackage());
    });
    await page.getByRole("radio", { name: "Đi bộ", exact: true }).click();
    await expect(page.getByRole("button", { name: "Thoát POV", exact: true })).toBeVisible();
    await page.locator("canvas").focus();
    await page.keyboard.down("w");
    await page.waitForTimeout(150);
    await page.keyboard.up("w");
    await page.keyboard.press("Escape");
    await expect(page.getByRole("radio", { name: "Diorama", exact: true })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await page.getByRole("radio", { name: "Ngồi sau xe ôm", exact: true }).click();
    await page.getByRole("button", { name: "Tạm dừng chuyến", exact: true }).click();
    await expect(
      page.getByRole("button", { name: "Tiếp tục chuyến", exact: true }),
    ).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "Cho phép nghiêng điện thoại", exact: true }).click();
    await page.getByRole("button", { name: "Thoát POV", exact: true }).click();
    const current = await page.evaluate(async () => {
      const url = performance
        .getEntriesByType("resource")
        .find((e) => new URL(e.name).pathname === "/src/world/privateWorldSession.ts")!.name;
      return JSON.stringify((await import(url)).worldDataProvider.exportWorkingPackage());
    });
    expect(current).toBe(original);
  });
  test("sound context is gesture-only, one per scene, local clip manifest stays in session and off releases voices", async ({
    page,
  }) => {
    const ready = await open(page);
    test.skip(!ready, "Audio UI is disabled in renderer fallback");
    await expect(scene(page)).toHaveAttribute("data-audio-contexts", "0");
    await page.getByRole("button", { name: "Tiếng phố", exact: true }).click();
    await pixels(page);
    await expect
      .poll(async () => +((await scene(page).getAttribute("data-audio-contexts")) ?? 0))
      .toBe(1);
    const wav = Buffer.alloc(44 + 1600);
    wav.write("RIFF", 0);
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write("WAVEfmt ", 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write("data", 36);
    wav.writeUInt32LE(1600, 40);
    const manifest = {
      name: "synthetic-only.wav",
      size: wav.length,
      type: "audio/wav",
      sha256: createHash("sha256").update(wav).digest("hex"),
    };
    await page.getByText("Nạp clip cục bộ", { exact: true }).click();
    await page.getByLabel("Manifest âm thanh (SHA-256)").setInputFiles({
      name: "synthetic.manifest.json",
      mimeType: "application/json",
      buffer: Buffer.from(JSON.stringify(manifest)),
    });
    await page
      .getByLabel("Clip âm thanh (tối đa 1 MB)")
      .setInputFiles({ name: "synthetic-only.wav", mimeType: "audio/wav", buffer: wav });
    await expect(
      page.getByText("Âm thanh cục bộ · chỉ trong phiên", { exact: false }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Tiếng phố", exact: true }).click();
    await pixels(page);
    await expect(scene(page)).toHaveAttribute("data-audio-voices", "0");
    expect(
      await page.evaluate(
        () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
      ),
    ).not.toContain(manifest.sha256);
  });
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 740, height: 390 },
  ])
    test(`VI/EN touch and exit controls at ${viewport.width}x${viewport.height}`, async ({
      page,
    }) => {
      await page.setViewportSize(viewport);
      const ready = await open(page);
      if (ready) {
        await page.getByRole("radio", { name: "Đi bộ", exact: true }).click();
        const exit = page.getByRole("button", { name: "Thoát POV", exact: true });
        await expect(exit).toBeVisible();
        const box = await exit.boundingBox();
        expect(box!.height).toBeGreaterThanOrEqual(44);
        await exit.click();
      }
      await page.getByRole("radio", { name: "en", exact: true }).click();
      await page.getByRole("tab", { name: "Time", exact: true }).click();
      await page.getByRole("switch", { name: "Life layer", exact: true }).scrollIntoViewIfNeeded();
      await expect(page.getByRole("switch", { name: "Life layer", exact: true })).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
});

test("P9 OfflineAudioContext measures the actual eight-voice storm mix below the peak limit", async ({
  page,
}) => {
  await page.goto("/");
  const result = await page.evaluate(async () => {
    const { createDemoAudio } = await import("/src/engine/demoAudio.ts");
    const context = new OfflineAudioContext(2, 48000 * 2, 48000);
    const audio = createDemoAudio({
      audioContextFactory: () => context as unknown as AudioContext,
    });
    audio.set(true, true, { minutes: 420, weather: "storm", fixture: false });
    audio.gesture();
    for (let i = 0; i < 8; i++)
      audio.passby({ position: [0, 0, 0], level: 0.12, durationMs: 1500 });
    const rendered = await context.startRendering();
    let peak = 0,
      largestStep = 0;
    for (let channel = 0; channel < rendered.numberOfChannels; channel++) {
      const samples = rendered.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) {
        peak = Math.max(peak, Math.abs(samples[i]!));
        if (i) largestStep = Math.max(largestStep, Math.abs(samples[i]! - samples[i - 1]!));
      }
    }
    audio.dispose();
    return { peak, largestStep, sampleCount: rendered.length, channels: rendered.numberOfChannels };
  });
  expect(result.sampleCount).toBe(96000);
  expect(result.channels).toBe(2);
  expect(result.peak).toBeGreaterThan(0);
  expect(result.peak).toBeLessThanOrEqual(0.9);
  expect(result.largestStep).toBeLessThan(0.1);
  await test.info().attach("offline-mix-measurement", {
    body: JSON.stringify(result),
    contentType: "application/json",
  });
});

test("short landscape keeps POV, local package and map controls apart", async ({ page }) => {
  await page.setViewportSize({ width: 740, height: 390 });
  const ready = await open(page);
  test.skip(!ready, "WebGL2 is unavailable in this project");
  for (const mode of ["Đi bộ", "Ngồi sau xe ôm", "Mặt bằng"]) {
    const selectedMode = page.getByRole("radio", { name: mode, exact: true });
    await selectedMode.click();
    await expect(selectedMode).toHaveAttribute("aria-checked", "true");
    if (mode === "Mặt bằng") await expect(page.getByTestId("plan-scale-ruler")).toBeVisible();
    const regions = await page
      .locator(
        ".h6-top-info,.private-world-panel,.p9-pov-controls,.plan-scale-bar,.h6-map-controls-anchor",
      )
      .evaluateAll((elements) =>
        elements.map((element) => {
          const b = element.getBoundingClientRect();
          return { x: b.x, y: b.y, right: b.right, bottom: b.bottom };
        }),
      );
    expect(regions).toHaveLength(4);
    for (const box of regions) {
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.right).toBeLessThanOrEqual(740);
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.bottom).toBeLessThanOrEqual(294);
    }
    for (let i = 0; i < regions.length; i++)
      for (let j = i + 1; j < regions.length; j++) {
        const a = regions[i]!,
          b = regions[j]!;
        expect(
          Math.max(0, Math.min(a.right, b.right) - Math.max(a.x, b.x)) *
            Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.y, b.y)),
        ).toBe(0);
      }
    if (mode === "Mặt bằng") {
      await page.getByRole("radio", { name: "Diorama", exact: true }).click();
    } else {
      const exit = page.getByRole("button", { name: "Thoát POV", exact: true });
      await exit.focus();
      await expect(exit).toBeFocused();
      await exit.press("Enter");
    }
  }
});
