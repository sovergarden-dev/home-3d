const title = "20 mode/route/package/capture cycles keep one ready canvas and no page errors";
const isH6 = (test) =>
  test.title === title && /(?:^|[\\/])h6-completion\.spec\.ts$/.test(test.location.file);

export default class H6BudgetReporter {
  constructor() {
    this.enforce = process.env.CI === "true" || process.env.CI === "1";
    this.requiresWebkit = false;
    this.expected = new Set();
    this.observed = new Set();
    this.failed = false;
  }
  onBegin(_config, suite) {
    const tests = suite.allTests();
    this.requiresWebkit = tests.some((test) => test.parent.project()?.name === "webkit");
    for (const test of tests)
      if (isH6(test) && test.parent.project()?.name === "webkit") this.expected.add(test.id);
  }
  onTestEnd(test, result) {
    if (!isH6(test)) return;
    const project = test.parent.project()?.name;
    console.log(
      `H6_DURATION ${JSON.stringify({ project, status: result.status, durationMs: result.duration, limitMs: project === "webkit" ? 70000 : null, enforced: this.enforce && project === "webkit" })}`,
    );
    if (project !== "webkit") return;
    if (this.enforce) {
      try {
        const baseline = JSON.parse(readFileSync(".qa-ci/h6-baseline.json", "utf8"));
        const comparable =
          baseline.sourceSha === "de7173261a8a3928685555252c2b479f76a713fe" &&
          baseline.status === "passed" &&
          Number.isFinite(baseline.durationMs) &&
          baseline.durationMs > 0;
        const changePct = comparable ? 100 * (result.duration / baseline.durationMs - 1) : null;
        console.log(
          `H6_COMPARISON ${JSON.stringify({ baselineStatus: baseline.status, baselineDurationMs: baseline.durationMs, currentDurationMs: result.duration, changePct, limitPct: 10 })}`,
        );
        if (!comparable || result.duration > baseline.durationMs * 1.1) this.failed = true;
      } catch {
        console.error("H6_BASELINE_NOT_VERIFIED: same-runner comparison is missing.");
        this.failed = true;
      }
    }
    this.observed.add(test.id);
    if (result.status !== "passed" || !Number.isFinite(result.duration) || result.duration >= 70000)
      this.failed = true;
  }
  async onEnd() {
    if (!this.enforce || !this.requiresWebkit) return;
    if (!this.expected.size || [...this.expected].some((id) => !this.observed.has(id)))
      this.failed = true;
    if (this.failed) {
      console.error(
        "H6_WEBKIT_GATE_NOT_MET: require a passing 20-cycle test below 70000 ms and a verified same-runner baseline within the 10% regression limit.",
      );
      return { status: "failed" };
    }
  }
}
import { readFileSync } from "node:fs";
