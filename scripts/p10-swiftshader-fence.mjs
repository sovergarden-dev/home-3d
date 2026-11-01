import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { launchBenchmark } from "./benchmark-browser.mjs";

if (process.env.BENCH_GPU !== "software") throw Error("SOFTWARE_DIAGNOSTIC_ONLY");
const output = path.resolve(process.argv[2] ?? "test-results/swiftshader-fence.json");
const { browser } = await launchBenchmark();
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await page.setContent('<canvas width="1440" height="900"></canvas>');
  const result = await page.evaluate(async () => {
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl2");
    if (!gl) throw Error("WEBGL2_UNAVAILABLE");
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const renderer = gl.getParameter(info.UNMASKED_RENDERER_WEBGL);
    if (!/swiftshader/i.test(renderer)) throw Error("SWIFTSHADER_REQUIRED");
    const statusName = (value) =>
      ({
        [gl.ALREADY_SIGNALED]: "ALREADY_SIGNALED",
        [gl.CONDITION_SATISFIED]: "CONDITION_SATISFIED",
        [gl.TIMEOUT_EXPIRED]: "TIMEOUT_EXPIRED",
        [gl.WAIT_FAILED]: "WAIT_FAILED",
      })[value];
    gl.clearColor(0.2, 0.4, 0.6, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    const fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    if (!fence) throw Error("GPU_FENCE_UNAVAILABLE");
    gl.flush();
    const start = performance.now();
    const polls = [];
    while (performance.now() - start < 2000) {
      await new Promise(requestAnimationFrame);
      const status = gl.clientWaitSync(fence, 0, 0);
      polls.push({ elapsedMs: performance.now() - start, status: statusName(status) });
      if (status === gl.ALREADY_SIGNALED || status === gl.CONDITION_SATISFIED) break;
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterTask = {
      elapsedMs: performance.now() - start,
      status: statusName(gl.clientWaitSync(fence, 0, 0)),
    };
    const finishStart = performance.now();
    gl.finish();
    const finishCpuMs = performance.now() - finishStart;
    const afterFinish = statusName(gl.clientWaitSync(fence, 0, 0));
    gl.clear(gl.COLOR_BUFFER_BIT);
    const pixel = new Uint8Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
    const afterReadPixels = statusName(gl.clientWaitSync(fence, 0, 0));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const afterReadTask = statusName(gl.clientWaitSync(fence, 0, 0));
    gl.deleteSync(fence);
    return {
      renderer,
      polls,
      afterTask,
      finishCpuMs,
      afterFinish,
      afterReadPixels,
      afterReadTask,
      pixel: [...pixel],
      error: gl.getError(),
    };
  });
  await mkdir(path.dirname(output), { recursive: true });
  const report = {
    syntheticOnly: true,
    fixture: "Standalone WebGL2 clear; no application scene or data",
    purpose: "Diagnose software-renderer sync behavior, not application acceptance latency",
    browserVersion: browser.version(),
    platform: process.platform,
    viewport: [1440, 900],
    dpr: 1,
    ...result,
  };
  await writeFile(output, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      renderer: report.renderer,
      lastRafPoll: report.polls.at(-1),
      afterTask: report.afterTask,
      afterFinish: report.afterFinish,
      afterReadTask: report.afterReadTask,
      pixel: report.pixel,
      error: report.error,
    }),
  );
} finally {
  await browser.close();
}
