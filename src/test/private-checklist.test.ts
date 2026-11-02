import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.resolve(__dirname, "../..");
const read = (file: string) => readFileSync(path.resolve(root, file), "utf8");

describe("privacy checklist automation", () => {
  it("keeps the private Worker config to reviewed keys: no account, hostname, secret, storage or logging settings", () => {
    // Plain JSON on purpose: the local Workerd smoke reads the same file with JSON.parse.
    expect(JSON.parse(read("wrangler.private.jsonc"))).toEqual({
      name: "home3d-private",
      main: "private/entry.ts",
      compatibility_date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      compatibility_flags: ["nodejs_compat"],
      workers_dev: false,
      preview_urls: false,
      assets: { directory: ".output/public", binding: "ASSETS", run_worker_first: true },
    });
  });

  it("asks every crawler to stay out of the public build", () => {
    expect(read("public/robots.txt").split(/\r?\n/).filter(Boolean)).toEqual([
      "User-agent: *",
      "Disallow: /",
    ]);
  });

  it("never deploys from CI and rejects ambiguous deploy arguments", () => {
    // No CLI path or credentials reach the child, so even a broken guard cannot start an upload.
    const env: Record<string, string> = { CI: "1" };
    for (const name of ["PATH", "SystemRoot"]) {
      const value = process.env[name];
      if (value) env[name] = value;
    }
    const cases: [string[], string][] = [
      [["--deploy"], "PRIVATE_DEPLOY_REQUIRES_OWNER_INITIATION"],
      [["--deploy", "--dry-run"], "CHOOSE_ONE_DEPLOY_MODE"],
      [["--yes"], "UNKNOWN_PRIVATE_DEPLOY_ARGUMENT"],
    ];
    for (const [args, error] of cases) {
      const result = spawnSync(process.execPath, ["scripts/private-deploy.mjs", ...args], {
        cwd: root,
        env,
        encoding: "utf8",
      });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toContain(error);
    }
  });
});
