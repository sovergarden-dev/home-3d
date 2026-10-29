import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { gzipSync } from "node:zlib";
import { readBuildOutput } from "../build/output.mjs";

const output = await readBuildOutput();
const root = path.resolve(process.argv[2] ?? output.root);
const manifest = JSON.parse(
  await readFile(
    process.argv[3] ?? path.join(path.dirname(output.serverEntry), "client-manifest.json"),
    "utf8",
  ),
);
const entries = Object.entries(manifest).filter(([, row]) => row.isEntry || row.isDynamicEntry);
const engine = entries.find(([key, row]) => /(?:^|\/)engine\/demoScene\.ts$/.test(row.src ?? key));
if (!entries.length || !engine || !engine[1].isDynamicEntry)
  throw Error("LAZY_ENGINE_MANIFEST_REQUIRED");
const shell = new Set();
function visit(key) {
  if (shell.has(key)) return;
  const row = manifest[key];
  if (!row) throw Error("INVALID_BUNDLE_IMPORT");
  shell.add(key);
  for (const dependency of row.imports ?? []) visit(dependency);
}
for (const [key] of entries) if (key !== engine[0]) visit(key);
if (shell.has(engine[0])) throw Error("ENGINE_MUST_NOT_BE_A_STATIC_SHELL_IMPORT");
const files = [];
for (const key of shell) {
  const file = manifest[key].file;
  if (!file.endsWith(".js")) continue;
  if (!/^assets\/[\w.-]+\.js$/.test(file)) throw Error("INVALID_PUBLIC_ASSET_PATH");
  const data = await readFile(path.join(root, file));
  files.push({ file, bytes: data.length, gzipBytes: gzipSync(data, { level: 9 }).length });
}
const gzipBytes = files.reduce((sum, row) => sum + row.gzipBytes, 0);
const report = {
  status: gzipBytes <= 250000 ? "PASS" : "NOT_MET",
  limitBytes: 250000,
  gzipBytes,
  method:
    "Sum of gzip level 9 sizes for all client entry/dynamic-entry static closures except the separately loaded engine; shared imports counted once.",
  files,
};
await mkdir("test-results", { recursive: true });
await writeFile("test-results/bundle-budget.json", JSON.stringify(report, null, 2) + "\n");
console.log(JSON.stringify(report, null, 2));
if (report.status !== "PASS") process.exitCode = 1;
