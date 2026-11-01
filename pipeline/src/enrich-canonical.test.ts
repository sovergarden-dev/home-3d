import { expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { writeArrayBuffer } from "geotiff";
import { SYNTHETIC_NEIGHBORHOOD } from "../../src/world/fixtures/syntheticNeighborhood";
import { sha256Text, parsePackageGeoreference } from "../../src/world/packageGeoreference";
import { runCanonicalEnrichment } from "./enrich-canonical";

test("canonical enrichment preserves geometry, requires exact G1 binding and writes a newly bound companion only to new files", async () => {
  const dir = mkdtempSync(join(tmpdir(), "home3d-canonical-height-synthetic-"));
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD);
  world.roads = [];
  world.lots = [];
  world.trees = [];
  world.props = [];
  world.buildings = [
    {
      localId: "synthetic-existing-footprint",
      geometry: {
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
      },
      footprintKind: "footprint",
      wallHeight: 0,
      roofType: "unknown",
      provenance: { source: "synthetic", quality: "synthetic" },
    },
  ];
  const input = JSON.stringify({ manifest: world.manifest, world }),
    origin = { longitude: 0.6, latitude: 0.4, altitude: 0 };
  const write = (name: string, value: unknown) =>
    writeFileSync(join(dir, name), JSON.stringify(value));
  writeFileSync(join(dir, "input.json"), input);
  write("reference.json", { schemaVersion: "1.0", packageSha256: await sha256Text(input), origin });
  const data = new Float32Array([0.9, 10, 0.9, 10, 0.9, 10, 0.9, 10, 0.9, 10, 0.9, 10]);
  writeFileSync(
    join(dir, "synthetic.tif"),
    new Uint8Array(
      await writeArrayBuffer(data, {
        width: 3,
        height: 2,
        SamplesPerPixel: 2,
        BitsPerSample: [32, 32],
        SampleFormat: [3, 3],
        PhotometricInterpretation: 1,
        GTModelTypeGeoKey: 2,
        GTRasterTypeGeoKey: 1,
        GeographicTypeGeoKey: 4326,
        ModelPixelScale: [0.00004, 0.00004, 0],
        ModelTiepoint: [0, 0, 0, 0.6002, 0.4004, 0],
      }),
    ),
  );
  const config = {
    schemaVersion: "1.0",
    packagePath: "input.json",
    georeferencePath: "reference.json",
    openBuildings: {
      centerExclusionRadiusMetres: 5,
      presenceThreshold: 0.8,
      tiles: [{ path: "synthetic.tif", year: 2023, heightBand: 1, presenceBand: 0 }],
    },
    output: {
      packagePath: "new.json",
      georeferencePath: "new-reference.json",
      reportPath: "report.json",
    },
  };
  write("config.json", config);
  const args = ["--config", join(dir, "config.json")];
  const preview = await runCanonicalEnrichment([...args, "--dry-run"]);
  expect(preview.openBuildings?.assigned).toBe(1);
  expect(existsSync(join(dir, "new.json"))).toBe(false);
  const summary = await runCanonicalEnrichment(args);
  expect(JSON.stringify(summary)).not.toContain("synthetic-existing-footprint");
  expect(JSON.stringify(summary)).not.toContain(dir);
  const newText = readFileSync(join(dir, "new.json"), "utf8"),
    changed = JSON.parse(newText);
  expect(changed.world.buildings[0].geometry).toEqual(world.buildings[0]!.geometry);
  expect(changed.world.buildings[0].wallHeight).toBe(10);
  const rebound = parsePackageGeoreference(readFileSync(join(dir, "new-reference.json"), "utf8"))!;
  expect(rebound.origin).toEqual(origin);
  expect(rebound.packageSha256).toBe(await sha256Text(newText));
  expect(rebound.packageSha256).not.toBe(await sha256Text(input));
  await expect(runCanonicalEnrichment(args)).rejects.toThrow("CANONICAL_OUTPUT_MUST_BE_NEW");
  write("reference.json", { schemaVersion: "1.0", packageSha256: "0".repeat(64), origin });
  await expect(runCanonicalEnrichment([...args, "--dry-run"])).rejects.toThrow(
    "CANONICAL_GEOREFERENCE_MISMATCH",
  );
  expect(readFileSync(join(dir, "input.json"), "utf8")).toBe(input);
});
