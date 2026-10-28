import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

const channel = process.env["BENCH_BROWSER"] ?? "chrome";
const baseURL = process.env["BENCH_BASE_URL"] ?? "http://127.0.0.1:4184";
const dpr = Number(process.env["H6_REAL_DPR"] ?? "1");
if (!["chrome", "msedge"].includes(channel)) throw Error("HARDWARE_BROWSER_REQUIRED");
if (!["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname))
  throw Error("LOOPBACK_BENCHMARK_REQUIRED");
if (!Number.isFinite(dpr) || dpr <= 0 || dpr > 4) throw Error("INVALID_HARDWARE_DPR");
if (process.env["BENCH_GPU"] !== "real") throw Error("EXPLICIT_REAL_GPU_REQUIRED");

export default defineConfig({
  ...base,
  outputDir: "test-results/hardware",
  webServer: undefined,
  reporter: [["list"], ["json", { outputFile: "test-results/hardware/report.json" }]],
  use: { ...base.use, baseURL },
  projects: [
    {
      name: `${channel}-real`,
      use: {
        ...base.projects![0]!.use,
        channel,
        headless: false,
        viewport: { width: 1440, height: 900 },
        deviceScaleFactor: dpr,
        launchOptions: { args: [] },
      },
    },
  ],
});
