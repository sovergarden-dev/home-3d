import { chromium, firefox } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { rendererDriver } from "./renderer-driver.mjs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

/** The GPU devices and drivers Chromium itself reports; Firefox exposes no equivalent. */
async function browserGpuDevices(browser, firefoxRun) {
  if (firefoxRun) return null;
  const session = await browser.newBrowserCDPSession();
  try {
    const { gpu } = await session.send("SystemInfo.getInfo");
    return gpu.devices ?? [];
  } catch {
    return null;
  } finally {
    await session.detach().catch(() => {});
  }
}

/** Keeps the existing harnesses' measurements unchanged while identifying their renderer. */
export async function launchBenchmark(extraArgs = []) {
  const mode = process.env.BENCH_GPU ?? "auto";
  if (!["auto", "real", "software"].includes(mode)) throw Error("INVALID_BENCH_GPU");
  const headed = mode === "real";
  const channel = process.env.BENCH_BROWSER ?? "chrome";
  if (headed && !["chrome", "msedge", "firefox"].includes(channel))
    throw Error("INVALID_BENCH_BROWSER");
  const firefoxRun = headed && channel === "firefox";
  const browser = firefoxRun
    ? await firefox.launch({ headless: false, firefoxUserPrefs: { "media.volume_scale": "0.0" } })
    : await chromium.launch({
        headless: !headed,
        ...(headed ? { channel } : {}),
        args: [
          ...(headed ? [] : ["--enable-unsafe-swiftshader"]),
          ...(mode === "software" ? ["--use-gl=angle", "--use-angle=swiftshader"] : []),
          ...extraArgs,
        ],
      });
  try {
    let dpr = Number(process.env.BENCH_DPR ?? "1");
    if (process.env.BENCH_DPR === "native") {
      if (!headed) throw Error("NATIVE_DPR_REQUIRES_HEADED_BROWSER");
      const context = await browser.newContext({ viewport: null });
      try {
        const page = await context.newPage();
        dpr = await page.evaluate(() => window.devicePixelRatio);
      } finally {
        await context.close();
      }
    }
    if (!Number.isFinite(dpr) || dpr <= 0 || dpr > 4) throw Error("INVALID_BENCH_DPR");
    const harnessSha = git("rev-parse", "HEAD");
    // Modified or untracked files mean the harness that ran is not exactly harnessSha.
    const harnessTreeClean = git("status", "--porcelain") === "";
    const devices = headed ? await browserGpuDevices(browser, firefoxRun) : null;
    return {
      browser,
      dpr,
      async environment(page) {
        const buildInfo = await page.getByTestId("build-info").innerText();
        const sourceSha = buildInfo.match(/\b[a-f0-9]{40}\b/i)?.[0]?.toLowerCase() ?? null;
        const expectedSha = process.env.BENCH_SOURCE_SHA?.toLowerCase();
        if (expectedSha && (!/^[a-f0-9]{40}$/.test(expectedSha) || sourceSha !== expectedSha))
          throw Error("MEASURED_SERVER_SHA_MISMATCH");
        if (mode !== "auto" && !sourceSha) throw Error("MEASURED_SERVER_SHA_REQUIRED");
        const gpu = await page.evaluate(() => {
          const canvas = document.querySelector('[data-testid="demo-scene"] canvas');
          const gl = canvas?.getContext("webgl2");
          const info = gl?.getExtension("WEBGL_debug_renderer_info");
          if (!gl || !info) throw Error("UNMASKED_RENDERER_UNAVAILABLE");
          return {
            renderer: gl.getParameter(info.UNMASKED_RENDERER_WEBGL),
            vendor: gl.getParameter(info.UNMASKED_VENDOR_WEBGL),
            dpr: window.devicePixelRatio,
          };
        });
        const software = /swiftshader|llvmpipe|software|basic render/i.test(gpu.renderer);
        if (mode === "real" && (software || !/intel|nvidia|amd|radeon|geforce/i.test(gpu.renderer)))
          throw Error("REAL_GPU_REQUIRED");
        if (mode === "software" && !/swiftshader/i.test(gpu.renderer))
          throw Error("SWIFTSHADER_REQUIRED");
        const reported = devices ? rendererDriver(devices, gpu.renderer) : null;
        const operator = process.env.BENCH_GPU_DRIVER;
        const driver = !headed
          ? { driverVersion: "SOFTWARE_OR_HEADLESS", driverSource: "NONE", driverMatch: "NONE" }
          : reported
            ? {
                driverVersion: reported.version,
                driverSource: "BROWSER_SYSTEM_INFO",
                driverMatch: reported.match,
              }
            : operator
              ? { driverVersion: operator, driverSource: "OPERATOR_ENV", driverMatch: "NONE" }
              : { driverVersion: "NOT_VERIFIED", driverSource: "NONE", driverMatch: "NONE" };
        return {
          sourceSha,
          harnessSha,
          harnessTreeClean,
          platform: process.platform === "win32" ? "WINDOWS_LOCAL" : process.platform,
          syntheticOnly: true,
          rendererClass: software ? "SWIFTSHADER" : headed ? "REAL_GPU" : "HARDWARE_HEADLESS",
          headed,
          channel: firefoxRun ? "playwright-firefox" : headed ? channel : "playwright-chromium",
          browserVersion: browser.version(),
          ...driver,
          dprRequest: process.env.BENCH_DPR ?? "1",
          viewport: page.viewportSize(),
          ...gpu,
          memoryMeaning: "Heap and renderer counters are not physical GPU memory measurements.",
        };
      },
    };
  } catch (error) {
    await browser.close();
    throw error;
  }
}
