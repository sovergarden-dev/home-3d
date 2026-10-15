import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { buildWorldPackage } from "../../pipeline/src/build";
import type { PipelineConfig } from "../../pipeline/src/config";
import type { GeoJsonFeatureCollection } from "../../pipeline/src/normalize";
import { parseWorldPackage } from "../../src/world/package";
import type { WorldOverrideDocument } from "../../src/world/schema";

const origin = { longitude: 0.6, latitude: 0.4, altitude: 0 };
const metresPerDegreeLatitude = 111_320;
const metresPerDegreeLongitude =
  metresPerDegreeLatitude * Math.cos((origin.latitude * Math.PI) / 180);

function position(x: number, z: number): [number, number] {
  return [
    origin.longitude + x / metresPerDegreeLongitude,
    origin.latitude - z / metresPerDegreeLatitude,
  ];
}

function polygon(
  minX: number,
  minZ: number,
  maxX: number,
  maxZ: number,
  holes: Array<[number, number, number, number]> = [],
) {
  const ring = (bounds: [number, number, number, number]) => {
    const [left, top, right, bottom] = bounds;
    return [
      position(left, top),
      position(right, top),
      position(right, bottom),
      position(left, bottom),
      position(left, top),
    ];
  };
  return {
    type: "Polygon" as const,
    coordinates: [ring([minX, minZ, maxX, maxZ]), ...holes.map(ring)],
  };
}

const source: GeoJsonFeatureCollection = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "qa-courtyard",
      properties: { building: "yes", height: 6, roof: "gabled" },
      geometry: polygon(-12, -5, -2, 5, [[-11, -4, -3, 4]]),
    },
    {
      type: "Feature",
      id: "qa-parent",
      properties: { building: "yes", height: 12, roof: "flat" },
      geometry: polygon(2, -5, 12, 5),
    },
    {
      type: "Feature",
      id: "qa-part-left",
      properties: {
        "building:part": "yes",
        "building:parent": "qa-parent",
        height: 4,
        roof: "flat",
      },
      geometry: polygon(2, -5, 4, 5),
    },
    {
      type: "Feature",
      id: "qa-part-right",
      properties: {
        "building:part": "yes",
        "building:parent": "qa-parent",
        height: 7,
        roof: "flat",
      },
      geometry: polygon(4, -5, 12, 5),
    },
    {
      type: "Feature",
      id: "qa-empty-lot",
      properties: { lot: "yes", status: "empty", confirmed: true },
      geometry: polygon(-10, -3, -4, 3),
    },
    {
      type: "Feature",
      id: "qa-road",
      properties: { highway: "residential", width: 4 },
      geometry: { type: "LineString", coordinates: [position(-14, -7), position(14, -7)] },
    },
  ],
};

const config: PipelineConfig = {
  schemaVersion: "1.0",
  datasetRevision: "synthetic-h6-roundtrip-v1",
  origin,
  input: { kind: "file", path: "synthetic-h6.geojson", format: "geojson" },
  source: {
    kind: "synthetic",
    namespace: "synthetic-h6",
    revision: "fixture-v1",
    licence: "CC0-1.0",
  },
  output: { packagePath: "out/h6-package.json", reportPath: "out/h6-report.json" },
};

test("H6 synthetic source → build → editor → export → source rebuild → reload preserves part edits", async ({
  page,
  browserName,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.setViewportSize({ width: 1280, height: 800 });

  const baseBuild = buildWorldPackage(source, config);
  expect(baseBuild.report.valid).toBe(true);
  expect(baseBuild.package.world.lots).toHaveLength(1);
  const courtyard = baseBuild.package.world.buildings.find((building) => !building.parts?.length);
  const parent = baseBuild.package.world.buildings.find((building) => building.parts?.length);
  expect(courtyard).toBeDefined();
  expect(parent?.parts).toHaveLength(2);
  const part = parent?.parts?.[0];
  expect(part).toBeDefined();

  await page.goto("/?local-preview=1");
  const sceneRoot = page.locator("#scene-root");
  await expect(sceneRoot).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 30000,
  });
  const rendererReady = (await sceneRoot.getAttribute("data-scene-state")) === "ready";
  const outputDirectory = process.env["H6_QA_OUTPUT_DIR"];
  const captureEvidence = Boolean(outputDirectory) && browserName === "chromium";
  if (captureEvidence && outputDirectory) await mkdir(outputDirectory, { recursive: true });
  if (process.env["H6_CAPTURE_EVIDENCE"] === "1") expect(rendererReady).toBe(true);

  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-h6-source-package.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(baseBuild.package)),
  });
  await expect(page.getByText("Đã mở gói cục bộ")).toBeVisible();
  const scene = page.getByTestId("demo-scene");
  if (rendererReady) {
    await expect(scene).toHaveAttribute("data-world-mode", "private");
    await expect(scene).toHaveAttribute("data-active-worlds", "1");
  }

  const shots: Array<{ file: string; viewport: string; note: string }> = [];
  const capture = async (file: string, note: string) => {
    if (!captureEvidence || !outputDirectory) return;
    const viewport = page.viewportSize();
    await page.screenshot({ path: join(outputDirectory, file), fullPage: false });
    shots.push({
      file,
      viewport: `${viewport?.width ?? 0}x${viewport?.height ?? 0}`,
      note,
    });
  };

  const buildingSelect = page.getByLabel("Chọn công trình");
  await buildingSelect.selectOption(courtyard!.localId);
  if (rendererReady) await page.waitForTimeout(600);
  await capture(
    "07-h6-courtyard-roof-and-empty-lot.png",
    "Synthetic courtyard building with a confirmed empty lot fully inside its courtyard hole; default diorama view.",
  );

  await buildingSelect.selectOption(parent!.localId);
  await expect(page.getByLabel("Chiều cao (m)")).toBeDisabled();
  const partSelect = page.getByLabel("Chọn phần công trình");
  await partSelect.selectOption(part!.localId);
  const partHeight = page.getByLabel("Chiều cao phần (m)");
  await expect(partHeight).toHaveValue("4");
  await partHeight.fill("5.5");
  await page.getByRole("button", { name: "Lưu phần" }).click();
  await expect(partHeight).toHaveValue("5.5");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(partHeight).toHaveValue("4");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(partHeight).toHaveValue("5.5");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Xuất file overrides (.json)" }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8")) as WorldOverrideDocument;
  expect(exported.overrides).toHaveLength(1);
  expect(exported.overrides[0]?.patch).toMatchObject({
    operation: "patch_building_part",
    buildingId: parent!.localId,
    partId: part!.localId,
    patch: { wallHeight: 5.5 },
  });

  const rebuilt = buildWorldPackage(source, config, { overrides: exported });
  expect(rebuilt.report.valid).toBe(true);
  expect(
    rebuilt.package.world.buildings.find((building) => building.localId === parent!.localId)
      ?.parts?.[0]?.wallHeight,
  ).toBe(4);
  expect(rebuilt.package.overrides).toEqual(exported);
  const parsed = parseWorldPackage(JSON.stringify(rebuilt.package));
  expect(parsed.ok).toBe(true);
  if (!parsed.ok) throw new Error(parsed.errorCode);
  const persistedPart = parsed.world.buildings
    .find((building) => building.localId === parent!.localId)
    ?.parts?.find((buildingPart) => buildingPart.localId === part!.localId);
  expect(persistedPart?.wallHeight).toBe(5.5);
  expect(persistedPart?.attributes?.wallHeight).toMatchObject({
    source: "manual_override",
    quality: "inferred",
  });

  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-h6-rebuilt-package.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(rebuilt.package)),
  });
  await expect(page.getByText("Đã mở gói cục bộ")).toBeVisible();
  await buildingSelect.selectOption(parent!.localId);
  await partSelect.selectOption(part!.localId);
  await expect(partHeight).toHaveValue("5.5");
  await expect(page.getByRole("button", { name: "Undo" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Redo" })).toHaveCount(0);
  if (rendererReady) await page.waitForTimeout(600);
  await capture(
    "08-h6-parent-part-editor-after-rebuild.png",
    "Rebuilt source package reloaded with the exported 5.5 m part override; package history reset.",
  );

  await partHeight.fill("6.5");
  await page.getByRole("button", { name: "Lưu phần" }).click();
  await expect(partHeight).toHaveValue("6.5");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(partHeight).toHaveValue("5.5");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(partHeight).toHaveValue("6.5");

  if (captureEvidence && outputDirectory) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("building-part-editor")).toBeVisible();
    await capture(
      "09-h6-parent-part-editor-mobile.png",
      "Mobile viewport showing the synthetic rebuilt package and active part editor after undo/redo.",
    );
    const exportedPath = join(outputDirectory, "07-h6-part-overrides-export.json");
    await writeFile(exportedPath, JSON.stringify(exported, null, 2));
    const fixtureSha256 = createHash("sha256")
      .update(JSON.stringify({ source, config }))
      .digest("hex");
    const report = {
      capturedAt: new Date().toISOString(),
      codeSha: process.env["H6_CODE_SHA"] ?? "not-recorded",
      browser: "Playwright Chromium headless with SwiftShader",
      sceneState: "ready",
      webglHardwareBenchmark: "not performed; SwiftShader is not a physical GPU benchmark",
      viewports: ["1280x800", "390x844"],
      method:
        "Playwright E2E: buildWorldPackage(source) → load in local editor → patch part → undo/redo → download overrides → buildWorldPackage(originalSource, exportedOverrides) → parseWorldPackage → reload in editor → verify persisted part and reset history",
      fixtureSha256,
      buildReport: { valid: baseBuild.report.valid, rebuiltValid: rebuilt.report.valid },
      exportedOverrideOperations: exported.overrides.map((override) => override.patch.operation),
      screenshots: shots,
      exportedOverrideFile: "07-h6-part-overrides-export.json",
    };
    await writeFile(join(outputDirectory, "qa-capture-h6.json"), JSON.stringify(report, null, 2));
  }

  expect(pageErrors).toEqual([]);
});
