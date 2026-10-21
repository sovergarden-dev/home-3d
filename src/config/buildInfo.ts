export const PUBLIC_BUILD_VERSION = "H6";

/** Only an explicitly supplied build revision is evidence of a build's identity. */
export function normalizeBuildSha(value: unknown): string | null {
  return typeof value === "string" && /^[a-f0-9]{40}$/i.test(value) ? value.toLowerCase() : null;
}

export const BUILD_SHA = normalizeBuildSha(import.meta.env["VITE_BUILD_SHA"]);
