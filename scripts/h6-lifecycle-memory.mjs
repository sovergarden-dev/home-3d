const LIMITS = Object.freeze({
  Documents: 0,
  Nodes: 200,
  JSEventListeners: 16,
  JSHeapUsedSize: 4 * 1024 * 1024,
});

const METRICS = ["Documents", "Nodes", "JSEventListeners", "JSHeapUsedSize"];

function cycleNumber(stage) {
  if (typeof stage !== "string") return undefined;
  const match = /^cycle-(\d+)$/i.exec(stage.trim());
  return match?.[1] === undefined ? undefined : Number(match[1]);
}

function invalid(message) {
  throw new TypeError(`Invalid lifecycle memory samples: ${message}`);
}

/**
 * Assess retained resources after the warm-up cycle.
 *
 * This is a conservative post-warm-up QA heuristic, not GPU/device certification.
 * @param {import("./h6-lifecycle-memory.d.mts").LifecycleMemorySample[]} samples
 * @returns {import("./h6-lifecycle-memory.d.mts").LifecycleMemoryAssessment}
 */
export function assessLifecycleMemory(samples) {
  if (!Array.isArray(samples) || samples.length === 0) {
    invalid("at least one row is required");
  }

  const rows = samples.map((row, index) => {
    if (row === null || typeof row !== "object") invalid(`row ${index} is missing`);
    if (typeof row.stage !== "string" || row.stage.trim() === "") {
      invalid(`row ${index} has an invalid stage`);
    }
    const cycle = cycleNumber(row.stage);
    for (const metric of METRICS) {
      if (!(metric in row) || typeof row[metric] !== "number" || !Number.isFinite(row[metric])) {
        invalid(`row ${index} has a missing or non-finite ${metric}`);
      }
    }
    return { ...row, cycle };
  });

  const cycleRows = rows.filter(
    (row) => row.cycle !== undefined && row.cycle >= 5 && row.cycle <= 20,
  );
  const warmRows = cycleRows.filter((row) => row.cycle === 5);
  const endRows = cycleRows.filter((row) => row.cycle === 20);
  if (cycleRows.length < 3 || warmRows.length !== 1 || endRows.length !== 1) {
    invalid("cycle-5 and cycle-20 plus at least three cycle rows are required");
  }

  const warm = warmRows[0];
  const warmIndex = rows.indexOf(warm);
  const measuredRows = rows.slice(warmIndex);
  const end = measuredRows.at(-1);
  const growth = Object.fromEntries(METRICS.map((metric) => [metric, end[metric] - warm[metric]]));
  const peakGrowth = Object.fromEntries(
    METRICS.map((metric) => [
      metric,
      Math.max(...measuredRows.map((row) => row[metric])) - warm[metric],
    ]),
  );
  const reasonCodes = [];

  if (peakGrowth.Documents > LIMITS.Documents) reasonCodes.push("DOCUMENTS_GROWTH");
  if (peakGrowth.Nodes > LIMITS.Nodes) reasonCodes.push("NODES_GROWTH");
  if (peakGrowth.JSEventListeners > LIMITS.JSEventListeners) {
    reasonCodes.push("JS_EVENT_LISTENERS_GROWTH");
  }
  if (peakGrowth.JSHeapUsedSize > LIMITS.JSHeapUsedSize) reasonCodes.push("JS_HEAP_GROWTH");

  for (const metric of METRICS) {
    const values = measuredRows.map((row) => row[metric]);
    const monotonicallyIncreasing =
      values.length >= 3 &&
      values.every((value, index) => index === 0 || value > values[index - 1]);
    // A short monotonic warm-up within the fixed budget is not proof of a leak.
    if (monotonicallyIncreasing && peakGrowth[metric] > LIMITS[metric]) {
      reasonCodes.push(`LINEAR_${metric.toUpperCase()}_GROWTH`);
    }
  }

  return {
    passed: reasonCodes.length === 0,
    warmStage: warm.stage,
    endStage: end.stage,
    growth,
    limits: { ...LIMITS },
    reasonCodes,
  };
}
