// QA capture for the H6 private-world editor flow (synthetic fixture only).
// Run: PLAYWRIGHT_CHROMIUM_EXECUTABLE=<chrome.exe> node scripts/qa-capture-editor.mjs
// Requires the dev server on http://127.0.0.1:4178 (bun run dev --host 127.0.0.1 --port 4178).
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const baseURL = process.env["QA_BASE_URL"] ?? "http://127.0.0.1:4178";
const executablePath = process.env["PLAYWRIGHT_CHROMIUM_EXECUTABLE"];
const outDir = "docs/assets/qa";
mkdirSync(outDir, { recursive: true });

const manifest = {
  schemaVersion: "1.0",
  datasetRevision: "synthetic-qa-capture",
  units: "metres",
  frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
  isSynthetic: true,
  chunks: [],
  assetHashes: {},
  licences: ["Synthetic fixture"],
  coverage: { quality: "synthetic", sourceCount: 1 },
};
const world = {
  manifest,
  roads: [
    {
      localId: "qa-road",
      polylineENU: [
        [-10, -10],
        [10, -10],
      ],
      connectorIds: [],
      roadClass: "residential",
      carriagewayWidth: 5,
      elevationLayer: 0,
      direction: "both",
      provenance: { source: "synthetic", quality: "synthetic" },
    },
  ],
  buildings: [
    {
      localId: "qa-house",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [-4, -4],
            [4, -4],
            [4, 4],
            [-4, 4],
            [-4, -4],
          ],
        ],
      },
      footprintKind: "footprint",
      wallHeight: 6,
      levels: 2,
      roofType: "flat",
      provenance: { source: "synthetic", quality: "synthetic" },
    },
  ],
  lots: [
    {
      localId: "qa-empty-lot",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [20, 20],
            [26, 20],
            [26, 26],
            [20, 26],
            [20, 20],
          ],
        ],
      },
      confirmed: true,
      status: "empty",
      provenance: { source: "survey", quality: "verified" },
    },
  ],
};
const pkgText = JSON.stringify({ manifest, world });
const pkgSha256 = createHash("sha256").update(pkgText).digest("hex");

const browser = await chromium.launch({
  args: ["--enable-unsafe-swiftshader"],
  ...(executablePath ? { executablePath } : {}),
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const shots = [];

async function shot(name, note) {
  const path = `${outDir}/${name}`;
  await page.screenshot({ path, fullPage: false });
  shots.push({ file: name, note });
}

await page.goto(`${baseURL}/?local-preview=1`);
await page.locator("#scene-root").waitFor({ state: "visible" });
await page.waitForFunction(
  () =>
    /ready|fallback/.test(
      document.querySelector("#scene-root")?.getAttribute("data-scene-state") ?? "",
    ),
  null,
  { timeout: 30000 },
);
const sceneState = await page.locator("#scene-root").getAttribute("data-scene-state");

await page.getByLabel("Mở gói world").setInputFiles({
  name: "synthetic-editor.json",
  mimeType: "application/json",
  buffer: Buffer.from(pkgText),
});
await page.getByText("Đã mở gói cục bộ").waitFor();
await page.waitForTimeout(400);

// 04: editor panel with a loaded package and the full edit surface visible.
await page.getByLabel("Chọn công trình").selectOption("qa-house");
await page.waitForTimeout(250);
await shot(
  "04-local-preview-editor.png",
  "Loaded synthetic package; building/road/lot editors visible",
);

// 05: geometry gate — invading footprint refused with a coded error.
await page.getByLabel("Footprint GeoJSON").fill(
  JSON.stringify({
    type: "Polygon",
    coordinates: [
      [
        [20.5, 20.5],
        [25.5, 20.5],
        [25.5, 25.5],
        [20.5, 25.5],
        [20.5, 20.5],
      ],
    ],
  }),
);
await page.getByRole("button", { name: "Lưu hình dạng" }).click();
await page.getByTestId("private-world-last-error").waitFor();
await page.waitForTimeout(250);
await shot(
  "05-editor-geometry-gate.png",
  "Invading footprint refused: BUILDING_INTERSECTS_CONFIRMED_EMPTY_LOT",
);

// 06: after-edit state — valid footprint, road width edit, undo/redo, export ready.
await page.getByLabel("Footprint GeoJSON").fill(
  JSON.stringify({
    type: "Polygon",
    coordinates: [
      [
        [-6, -6],
        [-2, -6],
        [-2, -2],
        [-6, -2],
        [-6, -6],
      ],
    ],
  }),
);
await page.getByRole("button", { name: "Lưu hình dạng" }).click();
await page.getByLabel("Chọn tuyến đường").selectOption("qa-road");
await page.getByLabel("Bề rộng đường").fill("8");
await page.getByRole("button", { name: "Lưu đường" }).click();
await page.locator('input[type="number"]').first().fill("9.5");
await page.getByRole("button", { name: "Lưu sửa" }).click();
await page.waitForTimeout(400);
await shot(
  "06-editor-after-export-ready.png",
  "Valid edits applied; undo/redo and export controls ready",
);

const download = page.waitForEvent("download");
await page.getByRole("button", { name: "Xuất file overrides (.json)" }).click();
const file = await download;
const stream = await file.createReadStream();
const chunks = [];
for await (const chunk of stream) chunks.push(Buffer.from(chunk));
const exported = Buffer.concat(chunks).toString("utf8");
writeFileSync("docs/assets/qa/06-editor-overrides-export.json", exported);

const report = {
  capturedAt: new Date().toISOString(),
  sceneState,
  viewport: "1280x800",
  method:
    "Playwright chromium (swiftshader), dev server bun run dev --host 127.0.0.1 --port 4178, synthetic fixture only",
  fixtureSha256: pkgSha256,
  shots,
  exportedOverrideOperations: JSON.parse(exported).overrides.map((o) => o.patch.operation),
};
writeFileSync("docs/assets/qa/qa-capture-editor.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

await browser.close();
