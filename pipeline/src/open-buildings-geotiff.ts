import { fromFile } from "geotiff";
import proj4 from "proj4";
import { isAbsolute, dirname, resolve } from "node:path";
import { enuToGeodetic, geodeticToEnu, type GeodeticPoint } from "../../src/geo/enu";
import { polygonsOf } from "../../src/world/geometry";
import type { SurfaceGeometry } from "../../src/world/schema";
import type { OpenBuildingsConfig } from "./open-buildings-config";
import type { HeightSample, HeightSampler } from "./open-buildings";

type Tiff = Awaited<ReturnType<typeof fromFile>>;
type Image = Awaited<ReturnType<Tiff["getImage"]>>;
type Affine = [number, number, number, number, number, number];
function invert(m: Affine): Affine {
  const det = m[0] * m[4] - m[1] * m[3];
  if (!Number.isFinite(det) || Math.abs(det) < 1e-18)
    throw Error("OPEN_BUILDINGS_TRANSFORM_INVALID");
  return [
    m[4] / det,
    -m[1] / det,
    (m[1] * m[5] - m[4] * m[2]) / det,
    -m[3] / det,
    m[0] / det,
    (m[3] * m[2] - m[0] * m[5]) / det,
  ];
}
const transform = (m: Affine, x: number, y: number) =>
  [m[0] * x + m[1] * y + m[2], m[3] * x + m[4] * y + m[5]] as [number, number];
async function affine(image: Image): Promise<Affine> {
  const matrix = await image.fileDirectory.getValue("ModelTransformation");
  if (matrix) {
    if (matrix.length !== 16 || matrix[12] !== 0 || matrix[13] !== 0 || matrix[15] !== 1)
      throw Error("OPEN_BUILDINGS_TRANSFORM_INVALID");
    return [matrix[0]!, matrix[1]!, matrix[3]!, matrix[4]!, matrix[5]!, matrix[7]!];
  }
  const origin = await image.getOrigin(),
    resolution = await image.getResolution();
  const m: Affine = [resolution[0]!, 0, origin[0]!, 0, resolution[1]!, origin[1]!];
  if (!m.every(Number.isFinite)) throw Error("OPEN_BUILDINGS_TRANSFORM_INVALID");
  return m;
}
async function projection(image: Image) {
  const keys = await image.getGeoKeys();
  const projected = Number(keys?.ProjectedCSTypeGeoKey);
  if ((projected >= 32601 && projected <= 32660) || (projected >= 32701 && projected <= 32760)) {
    return proj4(
      `+proj=utm +zone=${projected % 100} ${projected >= 32700 ? "+south" : ""} +datum=WGS84 +units=m +no_defs`,
      "EPSG:4326",
    );
  }
  if (
    (!projected || projected === 32767) &&
    Number(keys?.GeographicTypeGeoKey) === 4326 &&
    Number(keys?.GTModelTypeGeoKey) === 2
  )
    return proj4("EPSG:4326", "EPSG:4326");
  throw Error("OPEN_BUILDINGS_CRS_UNSUPPORTED");
}
async function scale(image: Image, band: number) {
  const metadata = await image.getGDALMetadata(band);
  const factor = Number(metadata?.["SCALE"] ?? 1),
    offset = Number(metadata?.["OFFSET"] ?? 0);
  if (!Number.isFinite(factor) || factor <= 0 || !Number.isFinite(offset))
    throw Error("OPEN_BUILDINGS_SCALE_INVALID");
  return { factor, offset };
}

/** Local filesystem only: this adapter never fetches tiles or searches for the owner's area. */
export async function openHeightSampler(
  config: OpenBuildingsConfig,
  origin: GeodeticPoint,
  configPath: string,
): Promise<HeightSampler> {
  const year = Math.max(...config.tiles.map((tile) => tile.year));
  const handles: Tiff[] = [];
  const close = async () => {
    await Promise.all(handles.map((file) => file.close()));
  };
  try {
    const tiles: Array<
      OpenBuildingsConfig["tiles"][number] & {
        image: Image;
        matrix: Affine;
        inverse: Affine;
        projection: Awaited<ReturnType<typeof projection>>;
        pixelOffset: number;
        heightScale: { factor: number; offset: number };
        presenceScale: { factor: number; offset: number };
        noData: number | null;
      }
    > = [];
    for (const tile of config.tiles.filter((t) => t.year === year)) {
      const file = await fromFile(
        isAbsolute(tile.path) ? tile.path : resolve(dirname(configPath), tile.path),
      );
      handles.push(file);
      const image = await file.getImage();
      if (Math.max(tile.heightBand, tile.presenceBand) >= image.getSamplesPerPixel())
        throw Error("OPEN_BUILDINGS_BAND_INVALID");
      const matrix = await affine(image);
      tiles.push({
        ...tile,
        image,
        matrix,
        inverse: invert(matrix),
        projection: await projection(image),
        pixelOffset: (await image.pixelIsArea()) ? 0.5 : 0,
        heightScale: await scale(image, tile.heightBand),
        presenceScale: await scale(image, tile.presenceBand),
        noData: await image.getGDALNoData(),
      });
    }
    return {
      year,
      close,
      async sample(geometry: SurfaceGeometry) {
        const result: HeightSample[] = [];
        const seen = new Set<string>();
        for (const tile of tiles) {
          const corners = polygonsOf(geometry)
            .flatMap((polygon) => polygon.coordinates.flat())
            .map(([x, z]) => {
              const geo = enuToGeodetic({ east: x, north: -z, up: 0 }, origin);
              const point = tile.projection.inverse([geo.longitude, geo.latitude]);
              return transform(tile.inverse, point[0]!, point[1]!);
            });
          const xs = corners.map((p) => p[0]),
            ys = corners.map((p) => p[1]);
          const left = Math.max(0, Math.floor(Math.min(...xs)) - 2),
            top = Math.max(0, Math.floor(Math.min(...ys)) - 2);
          const right = Math.min(tile.image.getWidth(), Math.ceil(Math.max(...xs)) + 2),
            bottom = Math.min(tile.image.getHeight(), Math.ceil(Math.max(...ys)) + 2);
          if (right <= left || bottom <= top) continue;
          if (
            ![left, top, right, bottom].every(Number.isSafeInteger) ||
            (right - left) * (bottom - top) > 1_000_000
          )
            throw Error("OPEN_BUILDINGS_WINDOW_TOO_LARGE");
          const raster = await tile.image.readRasters({
            window: [left, top, right, bottom],
            samples: [tile.heightBand, tile.presenceBand],
            interleave: false,
          });
          const heights = raster[0]!,
            presence = raster[1]!;
          for (let y = top; y < bottom; y++)
            for (let x = left; x < right; x++) {
              const index = (y - top) * (right - left) + (x - left);
              const rawHeight = heights[index]!,
                rawPresence = presence[index]!;
              if (rawHeight === tile.noData || rawPresence === tile.noData) continue;
              const height = rawHeight * tile.heightScale.factor + tile.heightScale.offset;
              const score = rawPresence * tile.presenceScale.factor + tile.presenceScale.offset;
              if (
                !Number.isFinite(height) ||
                height <= 0 ||
                height > 100 ||
                !Number.isFinite(score) ||
                score < config.presenceThreshold ||
                score > 1
              )
                continue;
              const point = transform(tile.matrix, x + tile.pixelOffset, y + tile.pixelOffset);
              const geo = tile.projection.forward(point);
              const enu = geodeticToEnu(
                { longitude: geo[0]!, latitude: geo[1]!, altitude: origin.altitude ?? 0 },
                origin,
              );
              const key = `${enu.east.toFixed(3)}:${enu.north.toFixed(3)}`;
              if (seen.has(key)) continue;
              seen.add(key);
              result.push({ x: enu.east, z: -enu.north, height, presence: score });
            }
        }
        return result;
      },
    };
  } catch {
    await close();
    throw Error("OPEN_BUILDINGS_TILE_READ_FAILED");
  }
}
