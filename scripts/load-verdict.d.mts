export interface LoadRow {
  cache: "cold" | "warm";
  navigationThrottleObserved: boolean;
  serviceWorkerThrottled: boolean;
  shellBudget: boolean;
  worldBudget: boolean;
}

export type LoadVerdict = "MET" | "NOT_MET" | "NOT_VERIFIED";

export function loadVerdict(
  rows: LoadRow[],
  cache: "cold" | "warm",
  budget: "shellBudget" | "worldBudget",
  throttleFailures: string[],
): LoadVerdict;
