/**
 * Verdict for one cache state of the 4G load benchmark. A sample counts only if its navigation paid
 * the emulated latency; warm samples also need their own context's service worker throttled, and
 * any failure to attach to or throttle a worker leaves every verdict unverified.
 */
export function loadVerdict(rows, cache, budget, throttleFailures) {
  const selected = rows.filter((row) => row.cache === cache);
  if (!selected.length || throttleFailures.length) return "NOT_VERIFIED";
  // A sample that did not pay the emulated network says nothing about the 4G budget.
  if (selected.some((row) => !row.navigationThrottleObserved)) return "NOT_VERIFIED";
  // Warm loads go through the worker, so that context's worker must have been throttled.
  if (cache === "warm" && selected.some((row) => !row.serviceWorkerThrottled))
    return "NOT_VERIFIED";
  return selected.every((row) => row[budget]) ? "MET" : "NOT_MET";
}
