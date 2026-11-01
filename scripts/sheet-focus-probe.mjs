import { firefox, expect } from "@playwright/test";
import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
const browser = await firefox.launch();
try {
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    reducedMotion: "no-preference",
  });
  await page.route("**/*", (route) =>
    new URL(route.request().url()).hostname === "127.0.0.1" ? route.continue() : route.abort(),
  );
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, ...args) {
      return type === "webgl2" ? null : original.apply(this, [type, ...args]);
    };
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("http://127.0.0.1:4188/");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "fallback");
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  const handle = page.getByRole("button", { name: "Kéo để mở rộng bảng điều khiển", exact: true });
  await handle.evaluate((element) =>
    element.addEventListener(
      "pointerdown",
      (event) => (element.dataset.pointerId = String(event.pointerId)),
    ),
  );
  const rows = [];
  const snap = async (stage) =>
    rows.push({
      stage,
      ...(await handle.evaluate((element) => {
        const r = element.getBoundingClientRect();
        return {
          media: matchMedia("(prefers-reduced-motion: reduce)").matches,
          height: element.parentElement.getBoundingClientRect().height,
          handleY: r.y,
          active: document.activeElement?.outerHTML.slice(0, 300),
          focused: document.activeElement === element,
          transition: getComputedStyle(element.parentElement).transitionDuration,
          pointerId: element.dataset.pointerId,
        };
      })),
    });
  for (const state of ["peek", "half", "full"]) {
    if (state !== "peek") await handle.press("ArrowUp");
    await snap(`before-${state}`);
    const b = await handle.boundingBox();
    await page.mouse.move(b.x + b.width / 2, b.y + 12);
    await page.mouse.down();
    await snap(`down-${state}`);
    await page.mouse.move(b.x + b.width / 2, state === "peek" ? b.y - 70 : b.y + 45, { steps: 3 });
    await snap(`move-${state}`);
    await handle.dispatchEvent("pointercancel", {
      pointerId: Number(await handle.getAttribute("data-pointer-id")),
      pointerType: "mouse",
      isPrimary: true,
      bubbles: true,
    });
    await snap(`cancel-${state}`);
    await page.mouse.up();
    await snap(`up-${state}`);
  }
  const output = path.resolve(process.argv[2] ?? "test-results/sheet-focus-probe.json");
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify(rows, null, 2) + "\n");
  console.log(JSON.stringify(rows));
} finally {
  await browser.close();
}
