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

  const sourceBuild = buildWorldPackage(source, config);
  const roadId = sourceBuild.package.world.roads[0]!.localId;
  const importedRoadOverrides: WorldOverrideDocument = {
    schemaVersion: "1.0",
    overrides: [
      {
        localId: "review5-imported-road-fields",
        revision: 1,
        reason: "Synthetic imported direction and elevation",
        provenance: { source: "survey", quality: "verified", sourceNamespace: "survey-fixture" },
        patch: {
          operation: "patch_road",
          featureId: roadId,
          patch: { direction: "forward", baseElevation: 3, carriagewayWidth: 7 },
        },
      },
    ],
  };
  const baseBuild = buildWorldPackage(source, config, { overrides: importedRoadOverrides });
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
  const desktopExpandedPanelBox = await page.getByTestId("private-world-panel").boundingBox();
  const desktopDockPanelBox = await page.getByRole("tabpanel").boundingBox();
  expect(desktopExpandedPanelBox).not.toBeNull();
  expect(desktopDockPanelBox).not.toBeNull();
  expect(desktopExpandedPanelBox!.y + desktopExpandedPanelBox!.height).toBeLessThanOrEqual(
    desktopDockPanelBox!.y,
  );

  const planMode = page.getByRole("radio", { name: "Mặt bằng", exact: true });
  if (rendererReady) {
    // MapControls are intentionally disabled in the no-renderer fallback.
    // Keep editor/export/rebuild coverage below, but claim Plan visuals only
    // when the browser can render the world.
    await planMode.click();
    await expect(planMode).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("plan-scale-bar")).toBeVisible();
    await expect(page.getByText("Bắc ↑")).toBeVisible();
    await expect(page.getByText("Thước mét")).toBeVisible();
    await page.waitForTimeout(400);
    await capture(
      "10-h6-plan-desktop-panel-expanded.png",
      "Synthetic Plan view at 1280x800 while the private panel remains expanded; Mặt bằng was activated by a normal click.",
    );
    await page.getByRole("button", { name: "Thu gọn bảng riêng" }).click();
    await expect(page.locator("#private-world-panel-content")).toBeHidden();
    await expect(page.getByTestId("plan-scale-bar")).toBeVisible();
    await page.waitForTimeout(400);
    await capture(
      "11-h6-plan-desktop-panel-collapsed.png",
      "Synthetic Plan view at 1280x800 after collapsing the private panel; north indicator and metric scale remain visible.",
    );
    await page.setViewportSize({ width: 1440, height: 900 });
    const desktopPanelBox = await page.getByTestId("private-world-panel").boundingBox();
    expect(desktopPanelBox).not.toBeNull();
    expect(desktopPanelBox!.y).toBeGreaterThanOrEqual(0);
    expect(desktopPanelBox!.y + desktopPanelBox!.height).toBeLessThanOrEqual(900);
    await expect(planMode).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("plan-scale-bar")).toBeVisible();
    await capture(
      "15-h6-plan-desktop-1440x900.png",
      "Synthetic Plan view and collapsed private-panel bounds at 1440x900.",
    );
    await page.setViewportSize({ width: 1280, height: 800 });
    await page.getByRole("button", { name: "Mở bảng riêng" }).click();
  }

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

  const roadSelect = page.getByLabel("Chọn tuyến đường");
  await roadSelect.selectOption(roadId);
  const roadWidth = page.getByLabel("Bề rộng đường");
  await expect(roadWidth).toHaveValue("7");
  await roadWidth.fill("8");
  await page.getByRole("button", { name: "Lưu đường" }).click();
  await expect(roadWidth).toHaveValue("8");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(roadWidth).toHaveValue("7");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(roadWidth).toHaveValue("8");

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Xuất file overrides (.json)" }).click(),
  ]);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const exported = JSON.parse(Buffer.concat(chunks).toString("utf8")) as WorldOverrideDocument;
  expect(exported.overrides).toHaveLength(3);
  const exportedPartPatch = exported.overrides.find(
    (override) => override.patch.operation === "patch_building_part",
  );
  expect(exportedPartPatch?.patch).toMatchObject({
    operation: "patch_building_part",
    buildingId: parent!.localId,
    partId: part!.localId,
    patch: { wallHeight: 5.5 },
  });
  expect(
    exported.overrides.filter((override) => override.patch.operation === "patch_road"),
  ).toHaveLength(2);
  expect(
    exported.overrides.every((override) => override.identityScheme === "stable-local-id-v2"),
  ).toBe(true);

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
  expect(persistedPart?.attributes?.["wallHeight"]).toMatchObject({
    source: "manual_override",
    quality: "inferred",
  });
  const persistedRoad = parsed.world.roads.find((road) => road.localId === roadId);
  expect(persistedRoad).toMatchObject({
    direction: "forward",
    baseElevation: 3,
    carriagewayWidth: 8,
  });
  expect(persistedRoad?.attributes?.["direction"]).toMatchObject({
    source: "survey",
    quality: "verified",
  });
  expect(persistedRoad?.attributes?.["baseElevation"]).toMatchObject({
    source: "survey",
    quality: "verified",
  });
  expect(persistedRoad?.attributes?.["carriagewayWidth"]).toMatchObject({
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
  await roadSelect.selectOption(roadId);
  await expect(roadWidth).toHaveValue("8");
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

  await page.setViewportSize({ width: 740, height: 390 });
  const privatePanel = page.getByTestId("private-world-panel");
  let scaleLabelReceivesPointer: boolean | null = null;
  let treeToggleReceivesPointer: boolean | null = null;
  let scaleControlClick = "not exercised: renderer unavailable";
  const landscapeCollapseButton = privatePanel.getByRole("button", {
    name: "Thu gọn bảng riêng",
  });
  await expect(partSelect).toHaveValue(part!.localId);
  await expect(partHeight).toHaveValue("6.5");
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();
  const collapseButtonReceivesPointer = await landscapeCollapseButton.evaluate((button) => {
    const rect = button.getBoundingClientRect();
    const hitTarget = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2);
    return hitTarget === button || hitTarget?.closest("button") === button;
  });
  expect(collapseButtonReceivesPointer).toBe(true);
  await landscapeCollapseButton.click();
  await expect(privatePanel).toHaveAttribute("data-collapsed", "true");
  await expect(page.locator("#private-world-panel-content")).toBeHidden();
  if (rendererReady) {
    await expect(page.getByText("Bắc ↑")).toBeVisible();
    const scaleLabel = page.getByText("Thước mét");
    await expect(scaleLabel).toBeVisible();
    await expect(planMode).toBeVisible();
    scaleLabelReceivesPointer = await scaleLabel.evaluate((label) => {
      const rect = label.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );
      return Boolean(hitTarget?.closest('[data-testid="plan-scale-bar"]'));
    });
    expect(scaleLabelReceivesPointer).toBe(true);
    const treeToggle = page.getByTestId("plan-scale-bar").getByRole("button").first();
    const treeToggleWasPressed = await treeToggle.getAttribute("aria-pressed");
    treeToggleReceivesPointer = await treeToggle.evaluate((button) => {
      const rect = button.getBoundingClientRect();
      const hitTarget = document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      );
      return hitTarget === button || hitTarget?.closest("button") === button;
    });
    expect(treeToggleReceivesPointer).toBe(true);
    await treeToggle.click();
    await expect(treeToggle).toHaveAttribute(
      "aria-pressed",
      treeToggleWasPressed === "true" ? "false" : "true",
    );
    await treeToggle.click();
    await expect(treeToggle).toHaveAttribute("aria-pressed", treeToggleWasPressed!);
    scaleControlClick = "normal Playwright click toggled twice; original state restored";
    const dioramaMode = page.getByRole("radio", { name: "Diorama", exact: true });
    await dioramaMode.click();
    await expect(dioramaMode).toHaveAttribute("aria-checked", "true");
    await planMode.click();
    await expect(planMode).toHaveAttribute("aria-checked", "true");
  }
  await privatePanel.getByRole("button", { name: "Mở bảng riêng" }).click();
  await expect(privatePanel).toHaveAttribute("data-collapsed", "false");
  await expect(partSelect).toHaveValue(part!.localId);
  await expect(partHeight).toHaveValue("6.5");
  await expect(page.getByRole("button", { name: "Undo" })).toBeVisible();

  if (captureEvidence && outputDirectory) {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId("building-part-editor")).toBeVisible();
    await planMode.click();
    await expect(planMode).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("plan-scale-bar")).toBeVisible();
    const privatePanel = page.getByTestId("private-world-panel");
    const panelBox = await privatePanel.boundingBox();
    const dockHandle = page.getByRole("button", { name: "Kéo để mở rộng bảng điều khiển" });
    const dockBox = await dockHandle.boundingBox();
    expect(panelBox).not.toBeNull();
    expect(dockBox).not.toBeNull();
    expect(panelBox!.y).toBeGreaterThanOrEqual(0);
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(844);
    expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(dockBox!.y);
    await capture(
      "12-h6-plan-mobile-panel-expanded.png",
      "Synthetic Plan view at 390x844 with the private editor open; panel bounds stay within the viewport and scale controls remain available.",
    );
    await privatePanel.getByRole("button", { name: "Thu gọn bảng riêng" }).click();
    await expect(page.locator("#private-world-panel-content")).toBeHidden();
    const dioramaMode = page.getByRole("radio", { name: "Diorama", exact: true });
    await dioramaMode.focus();
    await page.keyboard.press("Enter");
    await expect(dioramaMode).toHaveAttribute("aria-checked", "true");
    await planMode.focus();
    await page.keyboard.press("Enter");
    await expect(planMode).toHaveAttribute("aria-checked", "true");
    await expect(page.getByText("Bắc ↑")).toBeVisible();
    await expect(page.getByText("Thước mét")).toBeVisible();
    if (rendererReady) await page.waitForTimeout(400);
    await capture(
      "13-h6-plan-mobile-panel-collapsed.png",
      "Synthetic Plan view at 390x844 after collapse; Mặt bằng remains keyboard-accessible and north/metric scale are visible.",
    );
    await privatePanel.getByRole("button", { name: "Mở bảng riêng" }).click();
    await expect(page.getByTestId("building-part-editor")).toBeVisible();
    await capture(
      "09-h6-parent-part-editor-mobile.png",
      "Mobile viewport showing the synthetic rebuilt package and active part editor after undo/redo; panel bounds remain inside viewport.",
    );
    await page.setViewportSize({ width: 740, height: 390 });
    await expect(planMode).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("plan-scale-bar")).toBeVisible();
    const landscapePanelBox = await privatePanel.boundingBox();
    const landscapeDockBox = await dockHandle.boundingBox();
    expect(landscapePanelBox).not.toBeNull();
    expect(landscapeDockBox).not.toBeNull();
    expect(landscapePanelBox!.y).toBeGreaterThanOrEqual(0);
    expect(landscapePanelBox!.y + landscapePanelBox!.height).toBeLessThanOrEqual(390);
    expect(landscapePanelBox!.y + landscapePanelBox!.height).toBeLessThanOrEqual(
      landscapeDockBox!.y,
    );
    await capture(
      "16-h6-private-panel-mobile-landscape.png",
      "Synthetic Plan view at 740x390 with expanded private panel left of MapControls; collapse button remains reachable by pointer.",
    );
    await privatePanel.getByRole("button", { name: "Thu gọn bảng riêng" }).click();
    await expect(privatePanel).toHaveAttribute("data-collapsed", "true");
    await expect(page.locator("#private-world-panel-content")).toBeHidden();
    await expect(page.getByText("Bắc ↑")).toBeVisible();
    await expect(page.getByText("Thước mét")).toBeVisible();
    if (rendererReady) {
      const dioramaMode = page.getByRole("radio", { name: "Diorama", exact: true });
      await dioramaMode.click();
      await expect(dioramaMode).toHaveAttribute("aria-checked", "true");
      await planMode.click();
      await expect(planMode).toHaveAttribute("aria-checked", "true");
    }
    await capture(
      "17-h6-private-panel-mobile-landscape-collapsed.png",
      "Synthetic Plan view at 740x390 after a normal collapse click; Plan, north, and metric scale remain accessible.",
    );
    await privatePanel.getByRole("button", { name: "Mở bảng riêng" }).click();
    await expect(page.getByTestId("building-part-editor")).toBeVisible();
    const exportedPath = join(outputDirectory, "14-h6-override-roundtrip-export.json");
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
      viewports: ["1280x800", "1440x900", "390x844", "740x390"],
      method:
        "Playwright E2E: load synthetic private package → activate Plan with normal click while panel is open → edit part and road width → export → source rebuild/reload → verify retained road fields/provenance and part edit → at 740x390 hit-test the collapse button, collapse with a normal click, exercise Plan and scale controls, and reopen with selection/edit/history retained; also capture desktop/portrait/landscape QA",
      landscapeRegression: {
        viewport: "740x390",
        collapseButtonHitTest: collapseButtonReceivesPointer,
        collapseButtonClick: "normal Playwright click; panel collapsed and reopened",
        scaleLabelHitTest: scaleLabelReceivesPointer,
        scaleControlHitTest: treeToggleReceivesPointer,
        scaleControlClick,
        planControls: rendererReady
          ? "normal Playwright clicks toggled Diorama → Plan"
          : "renderer unavailable; Plan/scale controls not rendered in fallback",
        reopenedEditor: {
          selectedPartId: part!.localId,
          wallHeightMetres: 6.5,
          undoAvailable: true,
        },
      },
      fixtureSha256,
      buildReport: { valid: baseBuild.report.valid, rebuiltValid: rebuilt.report.valid },
      exportedOverrideOperations: exported.overrides.map((override) => override.patch.operation),
      screenshots: shots,
      exportedOverrideFile: "14-h6-override-roundtrip-export.json",
    };
    await writeFile(join(outputDirectory, "qa-capture-h6.json"), JSON.stringify(report, null, 2));
  }

  expect(pageErrors).toEqual([]);
});
