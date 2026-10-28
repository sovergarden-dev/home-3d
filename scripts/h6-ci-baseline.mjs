import { execFileSync, spawn } from "node:child_process";
import { mkdir, mkdtemp, readFile, symlink, writeFile } from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourceSha = "de7173261a8a3928685555252c2b479f76a713fe";
const root = process.cwd();
const port = Number(process.env.H6_BASELINE_PORT ?? 4184);
if (!Number.isInteger(port) || port < 1024 || port > 65535) throw Error("INVALID_BASELINE_PORT");
const baseURL = `http://127.0.0.1:${port}`;
const temporary = await mkdtemp(path.join(process.env.RUNNER_TEMP ?? tmpdir(), "home3d-h6-"));
const checkout = path.join(temporary, "baseline");
const reportPath = path.join(temporary, "report.json");
const receipt = {
  syntheticOnly: true,
  sourceSha,
  role: "Same-runner baseline calibration; current-head full suite remains the acceptance gate",
  platform: process.platform,
  arch: process.arch,
  cpuModel: cpus()[0]?.model ?? "unknown",
  logicalCpus: cpus().length,
  status: "NOT_VERIFIED",
  durationMs: null,
};
let server;
try {
  try {
    execFileSync("git", ["cat-file", "-e", `${sourceSha}^{commit}`], { stdio: "pipe" });
  } catch {
    execFileSync("git", ["fetch", "--depth=1", "origin", sourceSha], { stdio: "pipe" });
  }
  execFileSync("git", ["worktree", "add", "--detach", checkout, sourceSha], { stdio: "pipe" });
  await symlink(
    path.join(root, "node_modules"),
    path.join(checkout, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  const launcher = path.join(temporary, "serve-baseline.mjs");
  await writeFile(
    launcher,
    `import { createServer } from ${JSON.stringify(pathToFileURL(path.join(root, "node_modules/vite/dist/node/index.js")).href)};\nconst server = await createServer(${JSON.stringify({ root: checkout, configFile: path.join(checkout, "vite.config.ts"), cacheDir: path.join(temporary, "vite-cache"), server: { host: "127.0.0.1", port, strictPort: true } })});\nawait server.listen();\nserver.printUrls();\n`,
  );
  server = spawn(process.execPath, [launcher], {
    cwd: checkout,
    env: { ...process.env, VITE_BUILD_SHA: sourceSha },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let announced = false;
  let serverFailed = false;
  let outputTail = "";
  server.on("error", () => {
    serverFailed = true;
  });
  server.stdout.on("data", (chunk) => {
    outputTail = (outputTail + String(chunk)).slice(-1024);
    if (outputTail.includes(`${baseURL}/`)) announced = true;
  });
  server.stderr.on("data", () => {});
  const deadline = Date.now() + 60000;
  let ready = false;
  while (Date.now() < deadline && server.exitCode === null && !serverFailed) {
    try {
      const response = await fetch(`${baseURL}/src/config/buildInfo.ts`, {
        signal: AbortSignal.timeout(2000),
      });
      if (announced && response.ok && (await response.text()).includes(sourceSha)) {
        ready = true;
        break;
      }
    } catch {
      /* Only the owned local server is being awaited. */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  if (!ready) throw Error("BASELINE_SERVER_NOT_READY");
  const args = [
    path.join(root, "node_modules/playwright/cli.js"),
    "test",
    "tests/e2e/demo.spec.ts",
    "tests/e2e/h6-completion.spec.ts",
    "--project=webkit",
    "--grep",
    "demo labels, privacy, noindex|20 mode/route/package/capture cycles",
    "--reporter=json",
    `--output=${path.join(temporary, "artifacts")}`,
  ];
  // A normal demo test warms the same fixture/driver before the unchanged H6 case.
  try {
    execFileSync(process.execPath, args, {
      cwd: root,
      env: {
        ...process.env,
        PLAYWRIGHT_LOCAL_URL: baseURL,
        PLAYWRIGHT_JSON_OUTPUT_FILE: reportPath,
      },
      stdio: "pipe",
      timeout: 210000,
      maxBuffer: 8 * 1024 * 1024,
    });
  } catch {
    /* Keep a failed or skipped baseline as evidence; never call it a pass. */
  }
  const report = JSON.parse(await readFile(reportPath, "utf8"));
  const visit = (suite) => {
    for (const spec of suite.specs ?? []) {
      if (
        spec.title !==
        "20 mode/route/package/capture cycles keep one ready canvas and no page errors"
      )
        continue;
      const result = spec.tests?.[0]?.results?.at(-1);
      if (result) {
        receipt.status = result.status;
        receipt.durationMs = result.duration;
      }
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report.suites ?? []) visit(suite);
} catch {
  receipt.status = "BASELINE_DIAGNOSTIC_FAILED";
} finally {
  if (server && server.exitCode === null && server.signalCode === null) {
    let timer;
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    await Promise.race([
      stopped,
      new Promise((resolve) => {
        timer = setTimeout(resolve, 5000);
      }),
    ]);
    clearTimeout(timer);
    if (server.exitCode === null && server.signalCode === null) server.kill("SIGKILL");
  }
  await mkdir(".qa-ci", { recursive: true });
  await writeFile(".qa-ci/h6-baseline.json", JSON.stringify(receipt, null, 2) + "\n");
  console.log(`H6_BASELINE ${JSON.stringify(receipt)}`);
}
