import { mkdir, writeFile, copyFile, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
const qaRoot = process.env.HOME3D_QA_TOOLS;
if (!qaRoot || !path.isAbsolute(qaRoot)) throw Error("EXPLICIT_QA_TOOL_DIRECTORY_REQUIRED");
await mkdir(qaRoot, { recursive: true });
await writeFile(
  path.join(qaRoot, "package.json"),
  JSON.stringify(
    {
      name: "home3d-private-runtime-qa",
      private: true,
      type: "module",
      dependencies: { wrangler: "4.151.3" },
    },
    null,
    2,
  ),
);
await copyFile("scripts/private-runtime-qa.bun.lock", path.join(qaRoot, "bun.lock"));
await writeFile(
  path.join(qaRoot, "bunfig.toml"),
  "[install]\nminimumReleaseAge = 86400\nsaveTextLockfile = true\n",
);
const env = {};
for (const name of [
  "PATH",
  "SystemRoot",
  "WINDIR",
  "ComSpec",
  "TEMP",
  "TMP",
  "PATHEXT",
  "PROCESSOR_ARCHITECTURE",
])
  if (process.env[name]) env[name] = process.env[name];
Object.assign(env, {
  CI: "1",
  WRANGLER_SEND_METRICS: "false",
  WRANGLER_LOG_PATH: path.join(qaRoot, "wrangler.log"),
  XDG_CONFIG_HOME: path.join(qaRoot, "config"),
  XDG_CACHE_HOME: path.join(qaRoot, "cache"),
  HOME3D_QA_TOOLS: qaRoot,
});
execFileSync("bun", ["install", "--cwd", qaRoot, "--frozen-lockfile", "--ignore-scripts"], {
  env,
  stdio: "inherit",
  windowsHide: true,
});
const bundle = path.join(qaRoot, "bundle");
execFileSync(
  process.execPath,
  [
    path.join(qaRoot, "node_modules/wrangler/bin/wrangler.js"),
    "deploy",
    "--dry-run",
    "--config",
    "wrangler.private.jsonc",
    "--outdir",
    bundle,
  ],
  { env, stdio: "inherit", windowsHide: true },
);
execFileSync(
  process.execPath,
  [
    "scripts/private-workerd-smoke.mjs",
    process.cwd(),
    path.join(bundle, "entry.js"),
    "test-results/private-workerd",
  ],
  { env, stdio: "inherit", windowsHide: true },
);
console.log(await readFile("test-results/private-workerd/workerd-smoke.json", "utf8"));
