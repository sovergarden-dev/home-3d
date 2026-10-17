// Run with Bun after `bun run build`. Loopback only; no deployment or real data.
import { chromium, expect } from "@playwright/test";
import { resolve, relative, sep, join } from "node:path";
import { mkdir, writeFile, readdir, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { SYNTHETIC_NEIGHBORHOOD } from "../src/world/fixtures/syntheticNeighborhood.ts";
import worker from "../.output/server/index.mjs";

const output = resolve(process.env.H6_SMOKE_OUTPUT_DIR ?? "/tmp/h6-production-smoke");
const publicDir = resolve(".output/public");
const sentinel = "H6_PRODUCTION_SYNTHETIC_SENTINEL_8720";
const source = structuredClone(SYNTHETIC_NEIGHBORHOOD);
source.manifest.datasetRevision = sentinel;
const pkg = { manifest: source.manifest, world: source };
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4179,
  fetch(request) {
    return worker.fetch(
      request,
      {
        ASSETS: {
          async fetch(assetRequest) {
            const path = resolve(
              publicDir,
              `.${decodeURIComponent(new URL(assetRequest.url).pathname)}`,
            );
            const rel = relative(publicDir, path);
            if (rel === ".." || rel.startsWith(`..${sep}`))
              return new Response(null, { status: 404 });
            const file = Bun.file(path);
            if (!(await file.exists())) return new Response(null, { status: 404 });
            return new Response(file);
          },
        },
      },
      {
        waitUntil(promise) {
          void promise.catch(() => {});
        },
      },
    );
  },
});
console.log("Production Cloudflare-module smoke: loopback 127.0.0.1:4179");
await mkdir(output, { recursive: true });
let browser;
try {
  browser = await chromium.launch({
    args: ["--enable-unsafe-swiftshader"],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : {}),
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    reducedMotion: "reduce",
  });
  const errors = [],
    attempts = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (
      message.type() === "error" &&
      /THREE\.WebGLProgram: Shader Error|VALIDATE_STATUS/.test(message.text())
    )
      errors.push("SHADER_COMPILE_FAILURE");
  });
  page.on("request", (request) => attempts.push(`${request.url()} ${request.postData() ?? ""}`));
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.goto("http://127.0.0.1:4179/");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 30000,
  });
  await expect(page.getByLabel("Mở gói world")).toBeAttached();
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-production.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(pkg)),
  });
  await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
  for (const name of ["Mặt bằng", "Tầm mắt (demo)", "Diorama"])
    await page.getByRole("radio", { name, exact: true }).click();
  const building = source.buildings.find((item) => !item.parts?.length);
  if (!building) throw new Error("SYNTHETIC_BUILDING_REQUIRED");
  await page.getByLabel("Chọn công trình", { exact: true }).selectOption(building.localId);
  await page.getByRole("button", { name: "Biên tập nâng cao", exact: true }).click();
  await page.getByLabel("Chiều cao (m)", { exact: true }).fill("13");
  await page.getByRole("button", { name: "Lưu sửa", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Xuất bản làm việc", exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  if (!stream) throw new Error("DOWNLOAD_STREAM_REQUIRED");
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const working = Buffer.concat(chunks);
  await page.reload();
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-working.json",
    mimeType: "application/json",
    buffer: working,
  });
  await page.getByLabel("Chọn công trình", { exact: true }).selectOption(building.localId);
  await page.getByRole("button", { name: "Biên tập nâng cao", exact: true }).click();
  await expect(page.getByLabel("Chiều cao (m)", { exact: true })).toHaveValue("13");
  await expect(page.locator("#scene-root canvas")).toHaveCount(1);
  expect(attempts.join("\n")).not.toContain(sentinel);
  expect(await (await page.request.get("http://127.0.0.1:4179/")).text()).not.toContain(sentinel);
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await scan(path);
      else expect((await readFile(path)).includes(Buffer.from(sentinel))).toBe(false);
    }
  }
  await scan(resolve(".output"));
  expect(errors).toEqual([]);
  await page.screenshot({ path: join(output, "production-synthetic.png") });
  const report = {
    status: "PASS",
    syntheticOnly: true,
    runtime: "Bun loopback serving built Nitro Cloudflare-module handler and built ASSETS",
    head: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    dirty: !!execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim(),
    browser: await browser.version(),
    checks: [
      "SSR/noindex",
      "built assets and WebGL2 ready",
      "root file action",
      "three modes",
      "edit/export/reload equivalence",
      "one canvas",
      "no sentinel in requests/SSR/build output",
      "no page errors",
    ],
    errors,
  };
  await writeFile(join(output, "report.json"), JSON.stringify(report, null, 2) + "\n");
  console.log(`Production smoke PASS: ${join(output, "report.json")}`);
} finally {
  await browser?.close();
  server.stop(true);
}
