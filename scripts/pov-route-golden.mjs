#!/usr/bin/env node
// Prints the SHA-256 of JSON.stringify(buildPovRoute(HOME_NEIGHBORHOOD)), the golden value
// pinned in src/test/p9-pov-route-golden.test.ts. See docs/POV_ROUTE_GOLDEN.md.
//
//   node scripts/pov-route-golden.mjs          # current working tree
//   node scripts/pov-route-golden.mjs <rev>    # also src/engine/life/pov.ts as of <rev>
//
// The route is computed inside Vitest (Node/V8), the same runtime as the unit test and the
// same engine family as Chromium: Math.hypot differs in the last bit between engines (Bun's
// JavaScriptCore gives a different hash), so never regenerate under another runtime.
// With <rev>, that revision's pov.ts is written next to the current one under a temporary
// name so its relative imports resolve; every temporary file is deleted afterwards.
import { execFileSync } from "node:child_process";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const rev = process.argv[2];
const tag = `golden-${process.pid}`;
const probe = join(root, `src/test/pov-route-${tag}.tmp.test.ts`);
const legacy = join(root, `src/engine/life/pov.${tag}.tmp.ts`);
const marker = "POV_ROUTE_GOLDEN ";

const modules = [["working-tree", "@/engine/life/pov"]];
if (rev) {
  const source = execFileSync("git", ["show", `${rev}:src/engine/life/pov.ts`], {
    cwd: root,
    encoding: "utf8",
  });
  writeFileSync(legacy, source);
  modules.push([rev, `@/engine/life/pov.${tag}.tmp`]);
}

writeFileSync(
  probe,
  `import { createHash } from "node:crypto";
import { it } from "vitest";
import { HOME_NEIGHBORHOOD } from "@/world/homeNeighborhood";
it("pov route golden", async () => {
  for (const [revision, path] of ${JSON.stringify(modules)}) {
    const { buildPovRoute } = await import(/* @vite-ignore */ path);
    const started = performance.now();
    const route = buildPovRoute(HOME_NEIGHBORHOOD);
    const ms = Math.round(performance.now() - started);
    const sha256 = createHash("sha256").update(JSON.stringify(route)).digest("hex");
    console.log(${JSON.stringify(marker)} + JSON.stringify({ revision, segments: route.length, sha256, ms }));
  }
}, 600_000);
`,
);

try {
  const output = execFileSync(
    process.execPath,
    [join(root, "node_modules/vitest/vitest.mjs"), "run", probe, "--reporter=verbose"],
    { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] },
  );
  for (const line of output.split("\n"))
    if (line.includes(marker)) console.log(line.slice(line.indexOf(marker) + marker.length));
} finally {
  rmSync(probe, { force: true });
  rmSync(legacy, { force: true });
}
