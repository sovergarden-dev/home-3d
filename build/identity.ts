import { execFileSync } from "node:child_process";
import { normalizeBuildSha } from "../src/config/buildSha";

export function resolveBuildSha(
  explicit: unknown,
  readGit: () => string = () =>
    execFileSync("git", ["rev-parse", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }),
): string | null {
  const supplied = normalizeBuildSha(explicit);
  if (supplied) return supplied;
  try {
    return normalizeBuildSha(readGit().trim());
  } catch {
    return null;
  }
}
