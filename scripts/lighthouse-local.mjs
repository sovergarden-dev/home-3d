import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import path from "node:path";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { chromium } from "@playwright/test";

const toolsRoot = process.env.HOME3D_LIGHTHOUSE_TOOLS;
if (!toolsRoot || !path.isAbsolute(toolsRoot))
  throw Error("EXPLICIT_LIGHTHOUSE_TOOL_ROOT_REQUIRED");
const requireTool = createRequire(path.join(toolsRoot, "package.json"));
const { default: lighthouse, desktopConfig } = await import(
  pathToFileURL(requireTool.resolve("lighthouse")).href
);
const { launch } = await import(pathToFileURL(requireTool.resolve("chrome-launcher")).href);
const output = process.argv[2] ?? "test-results/lighthouse";
const port = Number(process.env.PRODUCTION_QA_PORT ?? 4193);
const origin = `http://127.0.0.1:${port}`;
await mkdir(output, { recursive: true });
const rows = [];
for (const formFactor of ["mobile", "desktop"]) {
  const chrome = await launch({
    chromeFlags: ["--headless=new", "--mute-audio", "--no-first-run"],
  });
  try {
    const browser = await chromium.connectOverCDP(`http://127.0.0.1:${chrome.port}`);
    const page = await browser.newPage();
    await page.goto(`${origin}/gioi-thieu`);
    const environment = await page.evaluate(() => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const ext = gl?.getExtension("WEBGL_debug_renderer_info");
      return {
        userAgent: navigator.userAgent,
        renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "NOT_VERIFIED",
      };
    });
    await page.close();
    const result = await lighthouse(
      `${origin}/`,
      {
        port: chrome.port,
        output: "json",
        logLevel: "error",
        onlyCategories: ["performance", "accessibility"],
      },
      formFactor === "desktop" ? desktopConfig : undefined,
    );
    if (!result?.lhr) throw Error("LIGHTHOUSE_REPORT_MISSING");
    const report = result.lhr;
    const externalHosts = [
      ...new Set(
        (report.audits["network-requests"]?.details?.items ?? []).flatMap((item) => {
          try {
            const url = new URL(item.url);
            return ["http:", "https:"].includes(url.protocol) && url.origin !== origin
              ? [url.hostname]
              : [];
          } catch {
            return [];
          }
        }),
      ),
    ];
    const safeReport = JSON.stringify(report).replaceAll(origin, "https://synthetic.invalid");
    await writeFile(path.join(output, `${formFactor}.json.gz`), gzipSync(safeReport));
    rows.push({
      formFactor,
      lighthouseVersion: report.lighthouseVersion,
      environment,
      driverVersion: process.env.BENCH_GPU_DRIVER ?? "NOT_VERIFIED",
      performance: report.categories.performance.score * 100,
      accessibility: report.categories.accessibility.score * 100,
      fcpMs: report.audits["first-contentful-paint"].numericValue,
      lcpMs: report.audits["largest-contentful-paint"].numericValue,
      totalBlockingMs: report.audits["total-blocking-time"].numericValue,
      externalHosts,
      runtimeError: report.runtimeError ?? null,
      warnings: report.runWarnings,
      method:
        "Production root, Lighthouse default mobile/desktop settings; dedicated headless Chrome. Raw JSON gzip changes only loopback origin to synthetic.invalid, preserving all timings/audits.",
    });
    console.log(JSON.stringify(rows.at(-1)));
    // Closing this CDP connection also closes our owned browser, never an existing user session.
    await browser.close();
  } finally {
    await chrome.kill();
  }
}
const manifest = JSON.parse(await readFile(".output/public/manifest.webmanifest", "utf8"));
await writeFile(
  path.join(output, "summary.json"),
  JSON.stringify({ syntheticOnly: true, buildManifest: manifest, rows }, null, 2) + "\n",
);
