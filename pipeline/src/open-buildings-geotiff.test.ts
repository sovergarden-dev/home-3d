import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeArrayBuffer } from "geotiff";
import proj4 from "proj4";
import { openHeightSampler } from "./open-buildings-geotiff";
import { enrichOpenBuildingsPackage } from "./open-buildings";
import { SYNTHETIC_NEIGHBORHOOD } from "../../src/world/fixtures/syntheticNeighborhood";
import { parseWorldPackage } from "../../src/world/package";
import type { SurfaceGeometry } from "../../src/world/schema";

for (const projected of [false, true])
  test(`reads real synthetic GeoTIFF bytes in ${projected ? "UTM" : "WGS84"}, using only the latest year`, async () => {
    const dir = mkdtempSync(join(tmpdir(), "home3d-open-buildings-synthetic-"));
    const origin = { longitude: 0.6, latitude: 0.4, altitude: 0 };
    const point = proj4("EPSG:4326", "+proj=utm +zone=31 +datum=WGS84 +units=m +no_defs", [
      origin.longitude,
      origin.latitude,
    ]);
    const metadata = {
      width: 3,
      height: 2,
      SamplesPerPixel: 2,
      BitsPerSample: [32, 32],
      SampleFormat: [3, 3],
      PhotometricInterpretation: 1,
      PlanarConfiguration: 1,
      GTModelTypeGeoKey: projected ? 1 : 2,
      GTRasterTypeGeoKey: 1,
      GeographicTypeGeoKey: 4326,
      ...(projected ? { ProjectedCSTypeGeoKey: 32631 } : {}),
      ModelPixelScale: projected ? [4, 4, 0] : [0.00004, 0.00004, 0],
      ModelTiepoint: projected
        ? [0, 0, 0, point[0]! + 20, point[1]! + 44, 0]
        : [0, 0, 0, 0.6002, 0.4004, 0],
    };
    const values = new Float32Array([0.9, 4, 0.9, 8, 0.9, 10, 0.9, 12, 0.9, 14, 0.1, 80]);
    const path = join(dir, "synthetic-latest.tif");
    writeFileSync(path, new Uint8Array(await writeArrayBuffer(values, metadata)));
    const config = {
      centerExclusionRadiusMetres: 5,
      presenceThreshold: 0.8,
      tiles: [
        {
          path: join(dir, "older-year-must-not-be-read.tif"),
          year: 2022,
          heightBand: 1,
          presenceBand: 0,
        },
        { path, year: 2023, heightBand: 1, presenceBand: 0 },
      ],
    };
    const sampler = await openHeightSampler(config, origin, join(dir, "config.json"));
    try {
      expect(sampler.year).toBe(2023);
      const geometry: SurfaceGeometry = {
        type: "Polygon",
        coordinates: [
          [
            [18, -50],
            [40, -50],
            [40, -25],
            [18, -25],
            [18, -50],
          ],
        ],
      };
      const samples = await sampler.sample(geometry);
      expect(samples).toHaveLength(5);
      const world = structuredClone(SYNTHETIC_NEIGHBORHOOD);
      world.roads = [];
      world.lots = [];
      world.trees = [];
      world.props = [];
      world.buildings = [
        {
          localId: "synthetic-raster-building",
          geometry,
          footprintKind: "footprint",
          wallHeight: 0,
          roofType: "unknown",
          provenance: { source: "synthetic", quality: "synthetic" },
        },
      ];
      const result = await enrichOpenBuildingsPackage(
        { manifest: world.manifest, world },
        sampler,
        config,
      );
      expect(result.package.world.buildings[0]!.wallHeight).toBe(10);
      expect(result.package.world.buildings[0]!.geometry).toEqual(geometry);
      expect(result.report.openBuildings).toMatchObject({
        assigned: 1,
        year: 2023,
        usableSamples: 5,
      });
      expect(JSON.stringify(result.report)).not.toContain(dir);
      expect(JSON.stringify(result.report)).not.toContain("synthetic-raster-building");
      expect(parseWorldPackage(JSON.stringify(result.package)).ok).toBe(true);
    } finally {
      await sampler.close();
    }
  });
