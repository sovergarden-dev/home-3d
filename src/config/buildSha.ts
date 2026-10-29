export function normalizeBuildSha(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : null;
}
