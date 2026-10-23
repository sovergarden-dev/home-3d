// Bun, after build. Loopback only, synthetic data; never deploys.
import { chromium, expect } from "@playwright/test";
import { resolve, relative, sep, join } from "node:path";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import worker from "../.output/server/index.mjs";
const output = resolve(process.env.P10_SMOKE_OUTPUT_DIR ?? "/tmp/p10-production-smoke"),
  root = resolve(".output/public");
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4179,
  fetch(request) {
    return worker.fetch(
      request,
      {
        ASSETS: {
          async fetch(request) {
            const path = resolve(root, `.${decodeURIComponent(new URL(request.url).pathname)}`);
            const rel = relative(root, path);
            if (rel === ".." || rel.startsWith(`..${sep}`))
              return new Response(null, { status: 404 });
            const file = Bun.file(path);
            return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 });
          },
        },
      },
      {
        waitUntil(p) {
          void p.catch(() => {});
        },
      },
    );
  },
});
let browser;
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
    reducedMotion: "reduce",
  });
  const errors = [],
    external = [],
    allowedFontAborts = [],
    sentinel = "P10_PRODUCTION_SYNTHETIC_PRIVATE_581";
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => {
    if (/hydration|Minified React error #418|Shader Error/i.test(m.text())) errors.push(m.text());
  });
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "127.0.0.1" || ["blob:", "data:"].includes(url.protocol))
      return route.continue();
    if (["fonts.googleapis.com", "fonts.gstatic.com"].includes(url.hostname)) {
      allowedFontAborts.push(url.origin);
      return route.abort();
    }
    external.push(url.origin);
    return route.abort();
  });
  await page.goto("http://127.0.0.1:4179/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 30000,
  });
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).click();
  await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
  await expect(page.getByTestId("memory-card")).toHaveCount(3);
  await page.getByRole("button", { name: "Thêm kỷ niệm", exact: true }).click();
  await page.getByRole("textbox", { name: "Tên kỷ niệm", exact: true }).fill(sentinel);
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByTestId("memory-card")).toHaveCount(4);
  await page.getByRole("button", { name: "Dạo một vòng", exact: true }).click();
  await expect(page.getByTestId("memory-tour-card")).toBeVisible();
  await page.getByRole("button", { name: "Thoát tour", exact: true }).click();
  await page.getByRole("switch", { name: "Xem như khách", exact: true }).check();
  await expect(page.getByTestId("memory-card")).toHaveCount(3);
  await expect(page.getByTestId("memory-journal")).toHaveCount(0);
  await expect(page.getByText(sentinel, { exact: true })).toHaveCount(0);
  await page.getByRole("switch", { name: "Xem như khách", exact: true }).uncheck();
  const storage = await page.evaluate(async () => ({
    url: location.href,
    local: JSON.stringify({ ...localStorage }),
    session: JSON.stringify({ ...sessionStorage }),
    dbs: typeof indexedDB.databases === "function" ? await indexedDB.databases() : [],
  }));
  expect(JSON.stringify(storage)).not.toContain(sentinel);
  expect(storage.dbs.map((d) => d.name)).not.toContain("pnm-p10");
  expect(await (await page.request.get("http://127.0.0.1:4179/")).text()).not.toContain(sentinel);
  let scanned = 0;
  async function scan(dir) {
    for (const e of await readdir(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) await scan(p);
      else {
        expect((await readFile(p)).includes(Buffer.from(sentinel))).toBe(false);
        scanned++;
      }
    }
  }
  await scan(resolve(".output"));
  await expect(page.locator("#scene-root canvas")).toHaveCount(1);
  expect(external).toEqual([]);
  expect(
    allowedFontAborts.every((origin) =>
      ["https://fonts.googleapis.com", "https://fonts.gstatic.com"].includes(origin),
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.screenshot({ path: join(output, "production-p10-synthetic.png") });
  const head = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  const text = await page.getByTestId("build-info").innerText();
  const buildSha = text.match(/[a-f0-9]{40}/i)?.[0] ?? "unknown";
  expect(buildSha).toBe(head);
  await writeFile(
    join(output, "production-smoke.json"),
    JSON.stringify(
      {
        status: "PASS",
        syntheticOnly: true,
        head,
        buildSha,
        runtime: "Bun loopback / built Cloudflare module + ASSETS",
        scannedFiles: scanned,
        errors,
        externalRequests: external.length,
        allowedFontAborts: allowedFontAborts.length,
        checks: [
          "ready WebGL2 SwiftShader",
          "synthetic add/save/guest/tour/exit UI",
          "one canvas",
          "no unconsented IDB",
          "SSR/build sentinel absent",
          "no hydration/console shader errors",
          "no outside requests",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log("P10 production smoke PASS");
} finally {
  await browser?.close();
  server.stop(true);
}
