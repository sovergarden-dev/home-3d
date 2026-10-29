import { readFile, stat, writeFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, resolve, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWorldPackage, MAX_WORLD_PACKAGE_BYTES } from "../../src/world/package";
import { parsePackageGeoreference, sha256Text } from "../../src/world/packageGeoreference";
import { parseOpenBuildingsConfig } from "./open-buildings-config";
import { openHeightSampler } from "./open-buildings-geotiff";
import { enrichOpenBuildingsPackage } from "./open-buildings";
import { publicBuildSummary } from "./report";

const record = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);
async function read(path: string, limit: number) {
  try {
    if ((await stat(path)).size > limit) throw Error();
    return await readFile(path, "utf8");
  } catch {
    throw Error("CANONICAL_LOCAL_INPUT_READ_FAILED");
  }
}
function parse(text: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(text);
    if (record(value)) return value;
  } catch {
    // Parser details may include private input; emit the neutral code below.
  }
  throw Error("CANONICAL_CONFIG_INVALID");
}
function localPath(base: string, value: unknown): string {
  if (typeof value !== "string" || !value.trim() || /^https?:/i.test(value))
    throw Error("CANONICAL_LOCAL_PATH_REQUIRED");
  return isAbsolute(value) ? resolve(value) : resolve(dirname(base), value);
}
function inside(root: string, path: string) {
  const part = relative(root, path);
  return part === "" || (part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part));
}

/** Explicit local canonical package + matching G1 companion; never discovers or downloads data. */
export async function runCanonicalEnrichment(args: string[]) {
  let configPath: string | undefined,
    dryRun = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--config") {
      configPath = args[++i];
      continue;
    }
    if (args[i] === "--dry-run") {
      dryRun = true;
      continue;
    }
    throw Error("CANONICAL_ARGUMENT_INVALID");
  }
  if (!configPath) throw Error("CANONICAL_CONFIG_REQUIRED");
  configPath = resolve(configPath);
  const config = parse(await read(configPath, 131072));
  if (config["schemaVersion"] !== "1.0" || !record(config["output"]))
    throw Error("CANONICAL_CONFIG_INVALID");
  const policy = parseOpenBuildingsConfig(config["openBuildings"]);
  if (!policy) throw Error("OPEN_BUILDINGS_CONFIG_REQUIRED");
  const packagePath = localPath(configPath, config["packagePath"]),
    georeferencePath = localPath(configPath, config["georeferencePath"]);
  const output = config["output"];
  const targets = [
    localPath(configPath, output["packagePath"]),
    localPath(configPath, output["georeferencePath"]),
    localPath(configPath, output["reportPath"]),
  ];
  const inputs = [
    configPath,
    packagePath,
    georeferencePath,
    ...policy.tiles.map((tile) => localPath(configPath, tile.path)),
  ];
  const key = (path: string) => (process.platform === "win32" ? path.toLowerCase() : path);
  if (
    new Set(targets.map(key)).size !== targets.length ||
    targets.some((path) => inputs.map(key).includes(key(path)))
  )
    throw Error("CANONICAL_OUTPUT_MUST_BE_NEW");
  const packageText = await read(packagePath, MAX_WORLD_PACKAGE_BYTES);
  const opened = parseWorldPackage(packageText);
  if (!opened.ok) throw Error("CANONICAL_PACKAGE_INVALID");
  if (!opened.package.manifest.isSynthetic) {
    const repository = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
    const syncRoots = [
      process.env["OneDrive"],
      process.env["OneDriveConsumer"],
      process.env["OneDriveCommercial"],
    ].filter((path): path is string => Boolean(path));
    const resolvedPaths = await Promise.all(
      [...inputs, ...targets].map(async (path) => {
        try {
          return await realpath(path);
        } catch {
          return resolve(await realpath(dirname(path)), path.slice(dirname(path).length + 1));
        }
      }),
    );
    if (
      resolvedPaths.some(
        (path) =>
          inside(repository, path) ||
          syncRoots.some((root) => inside(root, path)) ||
          /(?:^|[\\/])OneDrive(?:[\\/]|$)/i.test(path),
      )
    )
      throw Error("CANONICAL_PRIVATE_PATH_OUTSIDE_REPO_AND_SYNC_REQUIRED");
  }
  const companion = parsePackageGeoreference(await read(georeferencePath, 4096));
  if (!companion || companion.packageSha256 !== (await sha256Text(packageText)))
    throw Error("CANONICAL_GEOREFERENCE_MISMATCH");
  const sampler = await openHeightSampler(policy, companion.origin, configPath);
  try {
    const enriched = await enrichOpenBuildingsPackage(opened.package, sampler, policy);
    const newText = JSON.stringify(enriched.package);
    const newCompanion = { ...companion, packageSha256: await sha256Text(newText) };
    const summary = { ...publicBuildSummary(enriched.report), companionRebound: true, dryRun };
    if (!dryRun) {
      if ((await Promise.all(targets.map((path) => stat(path).catch(() => null)))).some(Boolean))
        throw Error("CANONICAL_OUTPUT_MUST_BE_NEW");
      try {
        await writeFile(targets[0]!, newText, { flag: "wx" });
        await writeFile(targets[1]!, JSON.stringify(newCompanion), { flag: "wx" });
        await writeFile(targets[2]!, JSON.stringify(summary), { flag: "wx" });
      } catch {
        throw Error("CANONICAL_OUTPUT_WRITE_FAILED");
      }
    }
    return summary;
  } finally {
    await sampler.close();
  }
}
if (import.meta.main)
  void runCanonicalEnrichment(Bun.argv.slice(2))
    .then((summary) => console.log(JSON.stringify(summary)))
    .catch(() => {
      console.error(JSON.stringify({ status: "error", code: "CANONICAL_ENRICHMENT_FAILED" }));
      process.exitCode = 1;
    });
