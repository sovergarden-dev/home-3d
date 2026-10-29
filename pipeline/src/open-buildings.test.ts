import { expect, test } from "bun:test";
import {
  enrichOpenBuildingsPackage,
  type HeightSample,
  type HeightSampler,
} from "./open-buildings";
import { parseOpenBuildingsConfig } from "./open-buildings-config";
import { SYNTHETIC_NEIGHBORHOOD } from "../../src/world/fixtures/syntheticNeighborhood";
import { parseWorldPackage } from "../../src/world/package";
import { assessWallHeight } from "../../src/world/wallHeight";
import type { Building, SurfaceGeometry, WorldPackage } from "../../src/world/schema";

const square = (x: number, z: number, size = 8): SurfaceGeometry => ({
  type: "Polygon",
  coordinates: [
    [
      [x, z],
      [x + size, z],
      [x + size, z + size],
      [x, z + size],
      [x, z],
    ],
  ],
});
const building = (id: string, x = 20, z = 20): Building => ({
  localId: id,
  geometry: square(x, z),
  footprintKind: "footprint",
  wallHeight: 0,
  roofType: "unknown",
  provenance: { source: "synthetic", quality: "synthetic" },
  attributes: { wallHeight: { source: "synthetic", quality: "unknown" } },
});
function fixture(buildings: Building[]): WorldPackage {
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD);
  world.buildings = buildings;
  world.roads = [];
  world.lots = [];
  world.trees = [];
  world.props = [];
  return { manifest: world.manifest, world };
}
const policy = { centerExclusionRadiusMetres: 5, presenceThreshold: 0.8 };
const sampler = (samples: HeightSample[], year = 2023): HeightSampler => ({
  year,
  async sample() {
    return samples;
  },
  async close() {},
});
const sample = (height: number, x = 21, z = 21, presence = 0.9) => ({ height, x, z, presence });

test("uses the median of usable footprint cells, excludes holes and subtracts known roof height", async () => {
  const b = building("synthetic-courtyard");
  b.geometry = {
    type: "Polygon",
    coordinates: [
      [
        [20, 20],
        [30, 20],
        [30, 30],
        [20, 30],
        [20, 20],
      ],
      [
        [24, 24],
        [24, 26],
        [26, 26],
        [26, 24],
        [24, 24],
      ],
    ],
  };
  b.roofHeight = 2;
  const input = fixture([b]),
    before = JSON.stringify(input);
  const result = await enrichOpenBuildingsPackage(
    input,
    sampler([
      sample(8),
      sample(10, 22),
      sample(12, 23),
      sample(99, 25, 25),
      sample(98, 22, 22, 0.1),
      sample(200),
      sample(0),
      sample(NaN),
      sample(90, 40),
    ]),
    policy,
  );
  const changed = result.package.world.buildings[0]!;
  expect(changed.wallHeight).toBe(8);
  expect(changed.geometry).toEqual(b.geometry);
  expect(changed.roofHeight).toBe(2);
  expect(changed.attributes?.wallHeight).toMatchObject({
    source: "open_buildings",
    quality: "inferred",
    sourceRevision: "v1/2023",
    licence: "CC-BY-4.0",
  });
  expect(assessWallHeight(changed, false)).toEqual({ status: "inferred", renderedHeight: 8 });
  expect(result.report.openBuildings).toMatchObject({ assigned: 1, usableSamples: 3, year: 2023 });
  expect(JSON.stringify(input)).toBe(before);
  expect(JSON.stringify(result.report)).not.toContain("synthetic-courtyard");
  expect(parseWorldPackage(JSON.stringify(result.package)).ok).toBe(true);
});

test("preserves source/level/override heights and leaves centre or lot intersections untouched", async () => {
  const known = building("known", 30),
    level = building("levels", 45),
    overridden = building("override", 60),
    center = building("center", -2, -2),
    lot = building("lot", -40, 20);
  known.wallHeight = 7;
  known.attributes!.wallHeight = { source: "survey", quality: "verified" };
  level.wallHeight = 6;
  level.levels = 2;
  const input = fixture([known, level, overridden, center, lot]);
  input.world.lots = [
    {
      localId: "synthetic-unconfirmed-lot",
      geometry: square(-42, 18, 12),
      status: "unknown",
      confirmed: false,
      provenance: { source: "synthetic", quality: "synthetic" },
    },
  ];
  input.overrides = {
    schemaVersion: "1.0",
    overrides: [
      {
        localId: "synthetic-edit",
        revision: 1,
        reason: "synthetic fixture",
        identityScheme: "stable-local-id-v2",
        patch: { operation: "patch_building", featureId: "override", patch: { wallHeight: 9 } },
        provenance: { source: "manual_override", quality: "inferred" },
      },
    ],
  };
  let reads = 0;
  const source: HeightSampler = {
    year: 2023,
    async sample() {
      reads++;
      return [sample(99)];
    },
    async close() {},
  };
  const result = await enrichOpenBuildingsPackage(input, source, policy);
  expect(reads).toBe(0);
  expect(result.package).toEqual(input);
  expect(result.report.openBuildings).toMatchObject({ assigned: 0, preserved: 3, excluded: 2 });
});

test("missing cells and invalid roof subtraction remain unknown without inventing a height", async () => {
  const input = fixture([building("unknown")]);
  let result = await enrichOpenBuildingsPackage(input, sampler([]), policy);
  expect(result.package).toEqual(input);
  input.world.buildings[0]!.roofHeight = 12;
  result = await enrichOpenBuildingsPackage(input, sampler([sample(8), sample(10)]), policy);
  expect(result.package).toEqual(input);
  expect(result.report.openBuildings?.uncovered).toBe(1);
});

test("requires explicit presence/centre policy, local files and supported source years", () => {
  const valid = {
    ...policy,
    tiles: [{ path: "synthetic.tif", year: 2023, heightBand: 1, presenceBand: 0 }],
  };
  expect(parseOpenBuildingsConfig(valid)).toEqual(valid);
  for (const bad of [
    { ...valid, presenceThreshold: 0 },
    { ...valid, centerExclusionRadiusMetres: 0 },
    { ...valid, tiles: [{ ...valid.tiles[0], year: 2030 }] },
    { ...valid, tiles: [{ ...valid.tiles[0], path: "https://example.invalid/private.tif" }] },
    { ...valid, tiles: [valid.tiles[0], valid.tiles[0]] },
  ])
    expect(() => parseOpenBuildingsConfig(bad)).toThrow();
});
