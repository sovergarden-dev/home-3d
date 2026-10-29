import { stat } from "node:fs/promises";
import { spawn } from "node:child_process";
import path from "node:path";

const deploy = process.argv.includes("--deploy");
if (process.argv.slice(2).some((argument) => !["--deploy", "--dry-run"].includes(argument)))
  throw Error("UNKNOWN_PRIVATE_DEPLOY_ARGUMENT");
if (deploy && process.argv.includes("--dry-run")) throw Error("CHOOSE_ONE_DEPLOY_MODE");
if (deploy && process.env.CI) throw Error("PRIVATE_DEPLOY_REQUIRES_OWNER_INITIATION");
if (!(await stat(".output/server/index.mjs").catch(() => null))?.isFile())
  throw Error("BUILD_APPLICATION_FIRST_WITH_BUN_RUN_BUILD");
const cli = process.env.HOME3D_WRANGLER_CLI;
if (!cli || !(await stat(cli).catch(() => null))?.isFile())
  throw Error("SET_HOME3D_WRANGLER_CLI_TO_THE_REVIEWED_LOCAL_WRANGLER_JS_ENTRY");
const args = [path.resolve(cli), "deploy", "--config", "wrangler.private.jsonc", ...(deploy ? [] : ["--dry-run"] )];
console.log(deploy ? "Owner-initiated private deployment." : "Local private deployment dry run; no upload requested.");
const child = spawn(process.execPath, args, { stdio: "inherit", windowsHide: true, env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
child.once("error", () => { console.error("PRIVATE_TOOL_START_FAILED"); process.exitCode = 1; });
child.once("exit", (code) => { process.exitCode = code ?? 1; });
