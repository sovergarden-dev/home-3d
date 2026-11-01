import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const report = JSON.parse(await readFile("coverage/coverage-summary.json", "utf8"));
const groups = {
  geo: "src/geo/",
  state: "src/state/",
  simulation: "src/engine/life/",
  atmosphere: "src/atmosphere/",
};
const metrics = ["lines", "statements", "functions", "branches"];
const measured = {};
for (const [group, prefix] of Object.entries(groups)) {
  const rows = Object.entries(report).filter(
    ([file]) =>
      file !== "total" &&
      path.relative(process.cwd(), file).replaceAll("\\", "/").startsWith(prefix),
  );
  if (!rows.length) throw Error(`MISSING_COVERAGE_${group}`);
  measured[group] = Object.fromEntries(
    metrics.map((metric) => {
      const total = rows.reduce((n, [, row]) => n + row[metric].total, 0);
      const covered = rows.reduce((n, [, row]) => n + row[metric].covered, 0);
      return [metric, total ? Math.floor((10000 * covered) / total) / 100 : 100];
    }),
  );
}
if (process.argv.includes("--write-baseline")) {
  await writeFile(
    "coverage-baseline.json",
    JSON.stringify({ targetPct: 85, thresholds: measured }, null, 2) + "\n",
  );
} else {
  const baseline = JSON.parse(await readFile("coverage-baseline.json", "utf8"));
  for (const [group, values] of Object.entries(measured))
    for (const [metric, value] of Object.entries(values)) {
      const threshold = baseline.thresholds[group]?.[metric];
      if (!Number.isFinite(threshold) || value < threshold) {
        console.error(`${group}.${metric}: ${value}% below ratchet ${threshold}%`);
        process.exitCode = 1;
      }
    }
}
console.log(
  JSON.stringify(
    {
      measured,
      targetPct: 85,
      note: "Current thresholds are a measured ratchet, not a claim that the 85% target is met.",
    },
    null,
    2,
  ),
);
