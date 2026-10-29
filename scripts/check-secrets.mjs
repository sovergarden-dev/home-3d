import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtemp, writeFile, chmod } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

let executable = process.env.GITLEAKS_BIN ?? "gitleaks";
if (process.env.CI && !process.env.GITLEAKS_BIN) {
  if (process.platform !== "linux" || process.arch !== "x64")
    throw Error("SET_GITLEAKS_BIN_FOR_THIS_PLATFORM");
  const dir = await mkdtemp(path.join(tmpdir(), "home3d-gitleaks-"));
  const response = await fetch(
    "https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz",
  );
  if (!response.ok) throw Error("GITLEAKS_DOWNLOAD_FAILED");
  const data = Buffer.from(await response.arrayBuffer());
  if (
    createHash("sha256").update(data).digest("hex") !==
    "551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb"
  )
    throw Error("GITLEAKS_CHECKSUM_MISMATCH");
  const archive = path.join(dir, "gitleaks.tar.gz");
  await writeFile(archive, data);
  execFileSync("tar", ["-xzf", archive, "-C", dir, "gitleaks"], { stdio: "inherit" });
  executable = path.join(dir, "gitleaks");
  await chmod(executable, 0o700);
}
const base = process.env.GITLEAKS_BASE_SHA;
if (base && (!/^[a-f0-9]{40}$/.test(base) || /^0+$/.test(base))) throw Error("INVALID_SCAN_BASE");
const args = ["git", "--config", ".gitleaks.toml", "--redact", "--no-banner", "--exit-code", "1"];
if (base && !process.argv.includes("--full-history")) args.push(`--log-opts=${base}..HEAD`);
execFileSync(executable, args, { stdio: "inherit" });
