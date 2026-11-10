import { execFileSync, spawn } from "node:child_process";
import {
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { cpus, tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

const sourceSha = "ba0c67ab4c6bb1598ac978e2c09c5904f17d914e";
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
let worktreeAdded = false;
let serverFailed = false;
let outputTail = "";
try {
  try {
    execFileSync("git", ["cat-file", "-e", `${sourceSha}^{commit}`], { stdio: "pipe" });
  } catch {
    execFileSync("git", ["fetch", "--depth=1", "origin", sourceSha], { stdio: "pipe" });
  }
  execFileSync("git", ["worktree", "add", "--detach", checkout, sourceSha], { stdio: "pipe" });
  worktreeAdded = true;
  await symlink(
    path.join(root, "node_modules"),
    path.join(checkout, "node_modules"),
    process.platform === "win32" ? "junction" : "dir",
  );
  await copyFile(
    path.join(root, "tests/e2e/cycle-budget.spec.ts"),
    path.join(checkout, "tests/e2e/cycle-budget.spec.ts"),
  );
  const launcher = path.join(temporary, "serve-baseline.mjs");
  await writeFile(
    launcher,
    `import { createServer } from ${JSON.stringify(pathToFileURL(path.join(root, "node_modules/vite/dist/node/index.js")).href)};\nconst server = await createServer(${JSON.stringify({ root: checkout, configFile: path.join(checkout, "vite.config.ts"), cacheDir: path.join(temporary, "vite-cache"), server: { host: "127.0.0.1", port, strictPort: true } })});\nawait server.listen();\nconst address = server.httpServer.address();\nif (!address || typeof address === "string" || address.port !== ${port}) throw Error("BASELINE_BOUND_PORT_MISMATCH");\nconsole.log("HOME3D_BASELINE_READY:" + address.port);\n`,
  );
  server = spawn(process.execPath, [launcher], {
    cwd: checkout,
    env: { ...process.env, VITE_BUILD_SHA: sourceSha },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  let announced = false;
  server.on("error", () => {
    serverFailed = true;
  });
  server.stdout.on("data", (chunk) => {
    outputTail = (outputTail + String(chunk)).slice(-1024);
    if (outputTail.includes(`HOME3D_BASELINE_READY:${port}`)) announced = true;
  });
  server.stderr.on("data", (chunk) => {
    outputTail = (outputTail + String(chunk)).slice(-1024);
  });
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
    "tests/e2e/cycle-budget.spec.ts",
    "--project=webkit",
    "--grep",
    "20 view changes preserve one scene, then a route remount recovers cleanly",
    "--reporter=json",
    `--output=${path.join(temporary, "artifacts")}`,
  ];
  // Baseline and current head execute the same scene lifecycle test.
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
        spec.title !== "20 view changes preserve one scene, then a route remount recovers cleanly"
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
} catch (error) {
  receipt.status = "BASELINE_DIAGNOSTIC_FAILED";
  const failure = error && typeof error === "object" ? error : {};
  console.error(
    `H6_BASELINE_DIAGNOSTIC ${JSON.stringify({
      code: "code" in failure ? failure.code : null,
      exitCode: "status" in failure ? failure.status : null,
      signal: "signal" in failure ? failure.signal : null,
      serverExited: server?.exitCode ?? null,
      serverFailed,
      serverOutputSignature: outputTail.includes("HOME3D_BASELINE_READY")
        ? "ready-marker-seen"
        : outputTail.includes("Error")
          ? "server-error-output"
          : "no-ready-marker",
    })}`,
  );
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
  if (worktreeAdded) {
    const dependencyLink = path.join(checkout, "node_modules");
    if ((await lstat(dependencyLink).catch(() => null))?.isSymbolicLink())
      await unlink(dependencyLink);
    execFileSync("git", ["worktree", "remove", "--force", checkout], { stdio: "pipe" });
  }
  await rm(temporary, { recursive: true, force: true });
  console.log(`H6_BASELINE ${JSON.stringify(receipt)}`);
}
