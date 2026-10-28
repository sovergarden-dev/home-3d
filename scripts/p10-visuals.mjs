import { launchBenchmark } from "./benchmark-browser.mjs";
import { expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
const output = path.resolve(process.argv[2] ?? "test-results/p10-visuals"),
  port = process.env.P10_PORT ?? "4178";
await mkdir(output, { recursive: true });
const { browser, dpr, environment } = await launchBenchmark();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: dpr,
    reducedMotion: "reduce",
    locale: "vi-VN",
  });
  await page.addInitScript(() => {
    window.__p10Import = (p) => {
      const e = [...performance.getEntriesByType("resource")]
        .reverse()
        .find((e) => new URL(e.name).pathname === p);
      return import(e?.name ?? new URL(p, location.href).href);
    };
  });
  await page.route("**/*", (r) =>
    new URL(r.request().url()).hostname === "127.0.0.1" ? r.continue() : r.abort(),
  );
  await page.goto(`http://127.0.0.1:${port}/?local-preview=1`);
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 30000,
  });
  const observed = await environment(page);
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
  await expect(page.getByTestId("memory-card")).toHaveCount(3);
  await page.evaluate(async () => {
    const { useAppStore: s } = await window.__p10Import("/src/state/appStore.ts");
    s.setState({
      selectedDate: "2026-06-21",
      timeOfDayMinutes: 420,
      timeSpeed: 0,
      lifeEnabled: false,
      heading: 28,
      zoom: 1,
    });
  });
  const pinFiles = [];
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
    { width: 740, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    for (const viewMode of ["diorama", "topdown"])
      for (const zoom of [0.25, 4]) {
        await page.evaluate(
          async ({ viewMode, zoom }) => {
            (await window.__p10Import("/src/state/appStore.ts")).useAppStore.setState({
              viewMode,
              zoom,
            });
          },
          { viewMode, zoom },
        );
        await page.waitForTimeout(500);
        const file = `pins-${viewMode}-${viewport.width}x${viewport.height}-zoom${zoom}.png`;
        await page.screenshot({ path: path.join(output, file) });
        pinFiles.push(file);
      }
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.evaluate(async () => {
    (await window.__p10Import("/src/state/appStore.ts")).useAppStore.setState({
      viewMode: "diorama",
      zoom: 1,
    });
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(output, "diorama-pins.png") });
  await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
  await page.screenshot({ path: path.join(output, "topdown-pins.png") });
  await page.getByRole("radio", { name: "Diorama", exact: true }).click();
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 740, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
    await page.getByRole("button", { name: "Thêm kỷ niệm", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Tên kỷ niệm", exact: true })
      .fill("Ví dụ tổng hợp — một ngày bình yên");
    await page.getByLabel("Ngày", { exact: true }).fill("2026-06-21");
    await page.screenshot({
      path: path.join(output, `editor-${viewport.width}x${viewport.height}.png`),
    });
    await page.keyboard.press("Escape");
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
  await page.getByRole("button", { name: "Dạo một vòng", exact: true }).click();
  await expect(page.getByTestId("memory-tour-card")).toBeVisible();
  await page.getByTestId("memory-tour-card").scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "tour-card.png") });
  await page.getByRole("button", { name: "Thoát tour", exact: true }).click();
  const card = await page.evaluate(async () => {
    const { memorySession: s } = await window.__p10Import("/src/memories/session.ts");
    const { processPhoto } = await window.__p10Import("/src/memories/imagePipeline.ts");
    for (let i = 0; i < 2; i++) {
      const c = document.createElement("canvas");
      c.width = 480;
      c.height = 320;
      const x = c.getContext("2d");
      x.fillStyle = i ? "#b1d3bc" : "#e1bd94";
      x.fillRect(0, 0, 480, 320);
      for (let j = 0; j < 10; j++) {
        x.fillStyle = j % 2 ? "#4b665c" : "#e8dcc2";
        x.fillRect(j * 48, 160 - i * 50, 30, 80 + i * 50);
      }
      const p = await processPhoto(await new Promise((r) => c.toBlob(r, "image/png")));
      s.saveJournal({
        id: crypto.randomUUID(),
        date: `2026-06-${20 + i}`,
        stage: i ? "frame" : "land",
        body: "Ví dụ tổng hợp — ảnh tạo bằng mã, không phải công trường thật.",
        photos: [p],
      });
      c.width = c.height = 0;
    }
    const { createPostcard } = await window.__p10Import("/src/memories/postcard.ts");
    const result = await createPostcard({
      ward: "Ví dụ tổng hợp",
      date: "2026-06-21",
      minutes: 420,
      mobile: true,
    });
    const bytes = new Uint8Array(await result.blob.arrayBuffer());
    let str = "";
    for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
    return {
      base64: btoa(str),
      type: result.blob.type,
      width: result.width,
      height: result.height,
    };
  });
  await page
    .getByRole("slider", { name: "Mức hiển thị ảnh sau", exact: true })
    .evaluate((el) => el.parentElement.previousElementSibling.scrollIntoView({ block: "start" }));
  await page.screenshot({ path: path.join(output, "journal-before-after.png") });
  await writeFile(path.join(output, "postcard-2k.png"), Buffer.from(card.base64, "base64"));
  const card4k = await page.evaluate(async () => {
    const result = await (
      await window.__p10Import("/src/memories/postcard.ts")
    ).createPostcard({ ward: "", date: "2026-06-21", minutes: 420, mobile: false });
    return {
      width: result.width,
      height: result.height,
      degraded: result.degraded,
      base64: await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result.split(",")[1]);
        reader.readAsDataURL(result.blob);
      }),
    };
  });
  expect(card4k.width).toBe(3840);
  expect(card4k.height).toBe(2160);
  expect(card4k.degraded).toBe(false);
  await writeFile(
    path.join(output, "postcard-4k-empty-ward.png"),
    Buffer.from(card4k.base64, "base64"),
  );
  await page.evaluate(async () => {
    (await window.__p10Import("/src/memories/session.ts")).memorySession.setGuest(true);
  });
  await page.getByRole("switch", { name: "Xem như khách", exact: true }).scrollIntoViewIfNeeded();
  await page.screenshot({ path: path.join(output, "guest.png") });
  await writeFile(
    path.join(output, "visuals.json"),
    JSON.stringify(
      {
        syntheticOnly: true,
        fixture: "built-in synthetic demo + generated stripes",
        date: "2026-06-21",
        minutes: 420,
        heading: 28,
        zoom: 1,
        dpr,
        environment: observed,
        renderer: observed.renderer,
        postcard: { width: card.width, height: card.height, type: card.type },
        files: [
          ...pinFiles,
          "postcard-4k-empty-ward.png",
          "diorama-pins.png",
          "topdown-pins.png",
          "editor-390x844.png",
          "editor-740x390.png",
          "tour-card.png",
          "journal-before-after.png",
          "postcard-2k.png",
          "guest.png",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log("P10 synthetic visuals complete");
} finally {
  await browser.close();
}
