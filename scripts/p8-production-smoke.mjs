// Bun loopback only after build; synthetic content, no deployment or Google traffic.
import { chromium, expect } from "@playwright/test";
import { createHash } from "node:crypto";
import { resolve, relative, sep, join } from "node:path";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { SYNTHETIC_NEIGHBORHOOD } from "../src/world/fixtures/syntheticNeighborhood.ts";
import worker from "../.output/server/index.mjs";

const output = resolve(process.env.P8_SMOKE_OUTPUT_DIR ?? "/tmp/p8-production-smoke");
const publicDir = resolve(".output/public");
const origin = { latitude: 0.4321987, longitude: 0.6789123, altitude: 0 };
const sentinel = "P8_PRODUCTION_SYNTHETIC_8147";
const source = structuredClone(SYNTHETIC_NEIGHBORHOOD);
source.manifest.datasetRevision = sentinel;
const text = JSON.stringify({ manifest: source.manifest, world: source });
const companion = JSON.stringify({
  schemaVersion: "1.0",
  packageSha256: createHash("sha256").update(text).digest("hex"),
  origin,
});
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
            return (await file.exists()) ? new Response(file) : new Response(null, { status: 404 });
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
let browser;
try {
  await mkdir(output, { recursive: true });
  browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const checks = [];
  const attempts = [],
    errors = [],
    navigations = [];
  await context.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:4179") return route.continue();
    attempts.push(route.request().url());
    if (url.origin === "https://www.google.com" && url.pathname === "/maps/@") {
      navigations.push({ url: url.href, referrer: route.request().headers()["referer"] ?? null });
      return route.fulfill({
        contentType: "text/html",
        body: "<title>Synthetic intercepted destination</title>",
      });
    }
    return route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("http://127.0.0.1:4179/");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready", {
    timeout: 30000,
  });
  await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeDisabled();
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-production.json",
    mimeType: "application/json",
    buffer: Buffer.from(text),
  });
  await page.getByLabel("Mở tham chiếu địa lý").setInputFiles({
    name: "synthetic-reference.json",
    mimeType: "application/json",
    buffer: Buffer.from(companion),
  });
  const trigger = page.getByRole("button", { name: "Phố thật", exact: true });
  await expect(trigger).toBeEnabled();
  await trigger.click();
  await page.getByRole("button", { name: "Hủy", exact: true }).click();
  expect(navigations).toEqual([]);
  expect(attempts.join("\n")).not.toContain(String(origin.latitude));
  expect(attempts.join("\n")).not.toContain(sentinel);
  const ssr = await (await page.request.get("http://127.0.0.1:4179/")).text();
  expect(ssr).not.toContain(String(origin.latitude));
  expect(ssr).not.toContain(sentinel);
  expect(
    await page.evaluate(
      () => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }),
    ),
  ).not.toContain(String(origin.latitude));
  for (const choice of ["Street View", "Vệ tinh"]) {
    await trigger.click();
    await page.getByRole("button", { name: choice, exact: true }).click();
    const [popup] = await Promise.all([
      page.waitForEvent("popup"),
      page.getByRole("button", { name: "Mở Google", exact: true }).click(),
    ]);
    await popup.waitForURL("https://www.google.com/maps/**");
    await popup.waitForLoadState();
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    await popup.close();
    await expect(page.locator("#scene-root canvas")).toHaveCount(1);
  }
  checks.push("P7 popup/no-opener/no-referrer regression on P8 build");
  await page.getByLabel("Ngày đang xem").fill("2026-02-17");
  await page.getByRole("tab", { name: "Lễ hội", exact: true }).click();
  await expect(page.getByRole("radio", { name: "Tết", exact: true })).toHaveAttribute(
    "aria-checked",
    "true",
  );
  await page.getByRole("radio", { name: "Trung Thu", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Lễ hội tự động", exact: true })).toHaveAttribute(
    "aria-checked",
    "false",
  );
  await page.getByRole("tab", { name: "Thời tiết", exact: true }).click();
  for (const name of ["Nhiều mây", "Mưa", "Mưa to", "Nắng nhẹ"])
    await page.getByRole("radio", { name, exact: true }).click();
  await expect(page.getByRole("button", { name: "Thời tiết thật", exact: true })).toBeDisabled();
  await page.getByRole("radio", { name: "Mùa mưa", exact: true }).click();
  await page.getByRole("switch", { name: "Lớp không khí", exact: true }).click();
  await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
  await expect(page.locator('[data-testid="demo-scene"]')).toHaveAttribute(
    "data-plan-zenith",
    "true",
  );
  await page.getByRole("radio", { name: "Diorama", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Xuất bản làm việc", exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const buffers = [];
  for await (const c of stream) buffers.push(Buffer.from(c));
  const exported = JSON.parse(Buffer.concat(buffers).toString("utf8"));
  expect(exported.world.buildings).toEqual(source.buildings);
  expect(exported.world.roads).toEqual(source.roads);
  await expect(page.getByTestId("build-info")).toContainText("P8");
  await page.screenshot({ path: join(output, "p8-production.png") });
  checks.push(
    "P8 Vietnamese date/auto Tet/manual festival",
    "four weather controls and blocked real activation",
    "season/layer toggle and neutral plan",
    "export preserves source buildings and roads",
    "P8 production identity",
  );
  expect(navigations).toHaveLength(2);
  expect(navigations.every((item) => item.referrer === null)).toBe(true);
  expect(new URL(navigations[0].url).searchParams.get("map_action")).toBe("pano");
  expect(new URL(navigations[1].url).searchParams.get("basemap")).toBe("satellite");
  async function scan(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) await scan(path);
      else {
        const data = await readFile(path);
        for (const value of [sentinel, String(origin.latitude), String(origin.longitude)])
          expect(data.includes(Buffer.from(value))).toBe(false);
      }
    }
  }
  await scan(resolve(".output"));
  expect(errors).toEqual([]);
  await page.reload();
  await expect(trigger).toBeDisabled();
  await writeFile(
    join(output, "report.json"),
    JSON.stringify(
      {
        status: "PASS",
        syntheticOnly: true,
        checks: 17,
        p8Checks: checks,
        googleNetworkRequests: 0,
        interceptedNavigations: 2,
        openerNull: true,
        referrerAbsent: true,
        errors,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(
    "P8 production smoke PASS: 17 checks; 2 intercepted synthetic navigations; 0 Google network requests",
  );
} finally {
  await browser?.close();
  server.stop(true);
}
