import { validateHeightPolicy, type HeightPolicy } from "./open-buildings";
export interface OpenBuildingsConfig extends HeightPolicy {
  tiles: { path: string; year: number; heightBand: number; presenceBand: number }[];
}
export function parseOpenBuildingsConfig(value: unknown): OpenBuildingsConfig | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("OPEN_BUILDINGS_CONFIG_INVALID");
  const input = value as Record<string, unknown>;
  const policy = {
    centerExclusionRadiusMetres: input["centerExclusionRadiusMetres"] as number,
    presenceThreshold: input["presenceThreshold"] as number,
  };
  validateHeightPolicy(policy);
  if (!Array.isArray(input["tiles"]) || !input["tiles"].length || input["tiles"].length > 64)
    throw Error("OPEN_BUILDINGS_TILES_INVALID");
  const tiles = input["tiles"].map((tile: unknown) => {
    if (!tile || typeof tile !== "object" || Array.isArray(tile))
      throw Error("OPEN_BUILDINGS_TILE_INVALID");
    const t = tile as Record<string, unknown>;
    const { path, year, heightBand, presenceBand } = t;
    if (
      typeof path !== "string" ||
      !path.trim() ||
      /^https?:/i.test(path) ||
      typeof year !== "number" ||
      !Number.isInteger(year) ||
      year < 2016 ||
      year > 2023 ||
      typeof heightBand !== "number" ||
      !Number.isInteger(heightBand) ||
      heightBand < 0 ||
      heightBand > 15 ||
      typeof presenceBand !== "number" ||
      !Number.isInteger(presenceBand) ||
      presenceBand < 0 ||
      presenceBand > 15 ||
      heightBand === presenceBand
    )
      throw Error("OPEN_BUILDINGS_TILE_INVALID");
    return { path, year, heightBand, presenceBand };
  });
  if (new Set(tiles.map((tile) => `${tile.year}:${tile.path}`)).size !== tiles.length)
    throw Error("OPEN_BUILDINGS_TILE_DUPLICATE");
  return { ...policy, tiles };
}
