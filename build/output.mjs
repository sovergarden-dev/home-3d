import { readFile, stat } from "node:fs/promises";
import path from "node:path";

/** Nitro uses .output locally; the existing Lovable wrapper can emit dist instead. */
export async function readBuildOutput() {
  const candidates = await Promise.all(
    [".output", "dist"].map(async (directory) => {
      const file = path.resolve(directory, "nitro.json");
      const info = await stat(file).catch(() => null);
      if (!info?.isFile()) return null;
      return {
        directory: path.dirname(file),
        modified: info.mtimeMs,
        metadata: JSON.parse(await readFile(file, "utf8")),
      };
    }),
  );
  const latest = candidates.filter(Boolean).sort((a, b) => b.modified - a.modified)[0];
  if (!latest) throw Error("NITRO_BUILD_METADATA_REQUIRED");
  const inside = (value) => {
    if (typeof value !== "string") throw Error("INVALID_BUILD_OUTPUT_PATH");
    const resolved = path.resolve(latest.directory, value),
      relative = path.relative(latest.directory, resolved);
    if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
      throw Error("INVALID_BUILD_OUTPUT_PATH");
    return resolved;
  };
  return {
    root: inside(latest.metadata.publicDir),
    serverEntry: inside(latest.metadata.serverEntry),
    preset: latest.metadata.preset,
  };
}
