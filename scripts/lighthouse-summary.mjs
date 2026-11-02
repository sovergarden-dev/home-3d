// Rebuilds the combined Lighthouse summary from committed run folders, or checks it.
// Usage: node scripts/lighthouse-summary.mjs <evidenceDir> [--check]
// Each <evidenceDir>/run-N holds summary.json, mobile.json.gz and desktop.json.gz written by
// scripts/lighthouse-local.mjs. Medians, labels and every field that the runs or the source
// commit can prove are recomputed. Facts about the measuring machine (Node, tool versions,
// tool lock, install command, build mode, requested runs) cannot be derived from the files:
// they are kept from the existing summary, or read from HOME3D_LIGHTHOUSE_TOOLS for a new one.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { gunzipSync } from "node:zlib";

const [target, ...flags] = process.argv.slice(2);
if (!target || flags.some((flag) => flag !== "--check"))
  throw Error("USAGE: node scripts/lighthouse-summary.mjs <evidenceDir> [--check]");
const check = flags.includes("--check");
const dir = path.resolve(target);
const summaryPath = path.join(dir, "summary.json");
const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const formFactors = ["mobile", "desktop"];
const metricKeys = ["performance", "accessibility", "fcpMs", "lcpMs", "totalBlockingMs"];
const defaultScripts = [
  "scripts/lighthouse-local.mjs",
  "scripts/production-server.mjs",
  "scripts/build-pwa.mjs",
];
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
// Lower middle value, so an even run count never reports a number that no run measured.
const median = (values) => {
  const sorted = values.filter((value) => typeof value === "number").sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : null;
};
const label = (value, threshold) =>
  value === null ? "NOT_VERIFIED" : value >= threshold ? "MET" : "NOT_MET";
const only = (values, code) => {
  const distinct = [...new Set(values)];
  if (distinct.length !== 1) throw Error(code);
  return distinct[0];
};

const runs = (await readdir(dir, { withFileTypes: true }))
  .flatMap((entry) => {
    const match = entry.isDirectory() ? /^run-(\d+)$/.exec(entry.name) : null;
    return match ? [Number(match[1])] : [];
  })
  .sort((a, b) => a - b);
if (!runs.length) throw Error("LIGHTHOUSE_RUNS_MISSING");

const rows = [];
for (const run of runs) {
  const runDir = path.join(dir, `run-${run}`);
  const runSummary = JSON.parse(await readFile(path.join(runDir, "summary.json"), "utf8"));
  for (const formFactor of formFactors) {
    const row = runSummary.rows.find((candidate) => candidate.formFactor === formFactor);
    if (!row) throw Error(`LIGHTHOUSE_ROW_MISSING run-${run} ${formFactor}`);
    const gz = await readFile(path.join(runDir, `${formFactor}.json.gz`));
    const report = JSON.parse(gunzipSync(gz).toString("utf8"));
    // The row must describe the report stored beside it (same formulas as lighthouse-local).
    const fromReport = {
      formFactor: report.configSettings?.formFactor,
      lighthouseVersion: report.lighthouseVersion,
      performance: report.categories.performance.score * 100,
      accessibility: report.categories.accessibility.score * 100,
      fcpMs: report.audits["first-contentful-paint"].numericValue,
      lcpMs: report.audits["largest-contentful-paint"].numericValue,
      totalBlockingMs: report.audits["total-blocking-time"].numericValue,
    };
    for (const [key, value] of Object.entries(fromReport))
      if (row[key] !== value)
        throw Error(`LIGHTHOUSE_ROW_REPORT_MISMATCH run-${run} ${formFactor} ${key}`);
    rows.push({
      run,
      ...row,
      benchmarkIndex: report.environment?.benchmarkIndex ?? null,
      reportGzipSha256: sha256(gz),
      reportGzipBytes: gz.length,
    });
  }
}
const sourceSha = only(
  rows.map((row) => row.sourceSha),
  "LIGHTHOUSE_SOURCE_SHA_MIXED",
);
if (!/^[a-f0-9]{40}$/.test(sourceSha)) throw Error("LIGHTHOUSE_SOURCE_SHA_INVALID");

const existing = existsSync(summaryPath)
  ? JSON.parse(await readFile(summaryPath, "utf8"))
  : undefined;
async function machineFacts() {
  if (existing) {
    const { node, tools, toolLockSha256, toolInstall, scriptSha256, build } = existing.provenance;
    return {
      runsRequested: existing.runsRequested,
      node,
      tools,
      toolLockSha256,
      toolInstall,
      scripts: Object.keys(scriptSha256),
      build,
    };
  }
  const tools = process.env.HOME3D_LIGHTHOUSE_TOOLS;
  if (!tools || !path.isAbsolute(tools)) throw Error("EXPLICIT_LIGHTHOUSE_TOOL_ROOT_REQUIRED");
  const version = async (name) =>
    JSON.parse(await readFile(path.join(tools, "node_modules", name, "package.json"), "utf8"))
      .version;
  return {
    runsRequested: runs.length,
    node: process.version,
    tools: {
      lighthouse: await version("lighthouse"),
      "chrome-launcher": await version("chrome-launcher"),
    },
    toolLockSha256: sha256(await readFile(path.join(tools, "package-lock.json"))),
    toolInstall: "NOT_RECORDED",
    scripts: defaultScripts,
    build: "bun run build with VITE_BUILD_SHA=sourceSha",
  };
}
const facts = await machineFacts();
if (!Number.isInteger(facts.runsRequested) || facts.runsRequested < runs.length)
  throw Error("LIGHTHOUSE_RUNS_REQUESTED_INVALID");
// The measured scripts are read from the source commit, which the runs verified through the HUD.
const scriptSha256 = Object.fromEntries(
  facts.scripts.map((file) => [
    file,
    sha256(execFileSync("git", ["show", `${sourceSha}:${file}`], { cwd: repo })),
  ]),
);
const medianFor = (formFactor) => {
  const subset = rows.filter((row) => row.formFactor === formFactor);
  const values = Object.fromEntries(
    metricKeys.map((key) => [key, median(subset.map((row) => row[key]))]),
  );
  return {
    runs: subset.length,
    ...values,
    performanceTarget90: label(values.performance, 90),
    accessibilityTarget95: label(values.accessibility, 95),
  };
};
const summary = {
  syntheticOnly: true,
  sourceSha,
  runsRequested: facts.runsRequested,
  failures: facts.runsRequested - runs.length,
  provenance: {
    node: facts.node,
    tools: facts.tools,
    toolLockSha256: facts.toolLockSha256,
    toolInstall: facts.toolInstall,
    scriptSha256,
    transport: only(
      rows.map((row) => row.transport),
      "LIGHTHOUSE_TRANSPORT_MIXED",
    ),
    gpuDriver: only(
      rows.map((row) => row.driverVersion),
      "LIGHTHOUSE_GPU_DRIVER_MIXED",
    ),
    userAgent: rows[0].environment?.userAgent ?? "NOT_VERIFIED",
    renderer: rows[0].environment?.renderer ?? "NOT_VERIFIED",
    build: facts.build,
  },
  median: Object.fromEntries(formFactors.map((formFactor) => [formFactor, medianFor(formFactor)])),
  rows,
};

if (!check) {
  await writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n");
  console.log(`LIGHTHOUSE_SUMMARY_WRITTEN ${JSON.stringify(summary.median)}`);
} else {
  if (!existing) throw Error("LIGHTHOUSE_SUMMARY_MISSING");
  const differences = [];
  const compare = (expected, actual, at) => {
    if (Object.is(expected, actual)) return;
    const objects = [expected, actual].every((value) => value && typeof value === "object");
    if (objects && Array.isArray(expected) === Array.isArray(actual)) {
      for (const key of new Set([...Object.keys(expected), ...Object.keys(actual)]))
        compare(expected[key], actual[key], `${at}.${key}`);
    } else differences.push(at);
  };
  compare(summary, existing, "summary");
  if (differences.length) {
    console.error(`LIGHTHOUSE_SUMMARY_DIFFERS ${differences.slice(0, 20).join(" ")}`);
    process.exit(1);
  }
  console.log(
    `LIGHTHOUSE_SUMMARY_REPRODUCED runs=${runs.length} ${JSON.stringify(summary.median)}`,
  );
}
