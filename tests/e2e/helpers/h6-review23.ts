import { expect, type ConsoleMessage, type Page, type Request } from "@playwright/test";
import { SYNTHETIC_NEIGHBORHOOD } from "../../../src/world/fixtures/syntheticNeighborhood";
import type { WorldData, WorldPackage } from "../../../src/world/schema";

const sentinel = "R23_SYNTHETIC_FILE_SENTINEL_5743";
export const malformedManifestCases = ["missing", "null", "object"] as const;
export function review23Package(): WorldPackage {
  const world = structuredClone(SYNTHETIC_NEIGHBORHOOD) as WorldData;
  world.manifest.datasetRevision = sentinel;
  return { manifest: structuredClone(world.manifest), world };
}
async function load(page: Page, pkg: unknown) {
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-review23.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(pkg)),
  });
}
export async function checkMalformedManifestRecovery(
  page: Page,
  kind: (typeof malformedManifestCases)[number],
) {
  const pkg = review23Package();
  const manifest = pkg.world.manifest as unknown as Record<string, unknown>;
  if (kind === "missing") delete manifest["coverage"];
  else if (kind === "null") manifest["coverage"] = null;
  else manifest["coverage"] = { quality: "synthetic", sourceCount: { sentinel } };
  const errors: string[] = [];
  const output: string[] = [];
  const onError = (error: Error) => errors.push(error.message);
  const onConsole = (message: ConsoleMessage) => output.push(message.text());
  const onRequest = (request: Request) =>
    output.push(`${request.url()} ${request.postData() ?? ""}`);
  page.on("pageerror", onError);
  page.on("console", onConsole);
  page.on("request", onRequest);
  try {
    await load(page, pkg);
    const panel = page.getByTestId("private-world-panel");
    await expect(panel).toContainText("WORLD_PACKAGE_SHAPE_INVALID");
    await expect(page.locator("body")).not.toContainText(sentinel);
    await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toHaveCount(0);
    await load(page, review23Package());
    await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
    await expect(panel).not.toContainText("WORLD_PACKAGE_SHAPE_INVALID");
    expect(errors).toEqual([]);
    expect(output.join("\n")).not.toContain(sentinel);
  } finally {
    page.off("pageerror", onError);
    page.off("console", onConsole);
    page.off("request", onRequest);
  }
}
export async function checkRoadGeometryRoundtrip(page: Page) {
  const pkg = review23Package();
  const road = pkg.world.roads[0]!;
  road.provenance = { source: "osm", quality: "source_only" };
  road.attributes = {
    carriagewayWidth: { source: "survey", quality: "verified" },
    direction: { source: "osm", quality: "source_only" },
    sidewalkWidths: { source: "osm", quality: "unknown" },
    medianWidth: { source: "survey", quality: "inferred" },
  };
  const original = structuredClone(road);
  await load(page, pkg);
  await page.getByRole("button", { name: "Biên tập nâng cao", exact: true }).click();
  await page.getByLabel("Chọn tuyến đường").selectOption(road.localId);
  const panel = page.getByTestId("private-world-panel");
  await expect(
    panel.getByText("Hình học tim đường: osm · source_only", { exact: true }),
  ).toBeVisible();
  pkg.overrides = {
    schemaVersion: "1.0",
    overrides: [
      {
        localId: "synthetic-review23-polyline",
        revision: 1,
        reason: "Synthetic road provenance regression",
        provenance: { source: "manual_override", quality: "inferred" },
        patch: {
          operation: "patch_road",
          featureId: road.localId,
          patch: { polylineENU: road.polylineENU.map(([x, z]) => [x + 0.25, z]) },
        },
      },
    ],
  };
  await load(page, pkg);
  await page.getByRole("button", { name: "Biên tập nâng cao", exact: true }).click();
  await page.getByLabel("Chọn tuyến đường").selectOption(road.localId);
  await expect(
    panel.getByText("Hình học tim đường: manual_override · inferred", { exact: true }),
  ).toBeVisible();
  await expect(panel).toContainText(`${road.carriagewayWidth} · survey · verified`);
  await page.getByRole("radio", { name: "en", exact: true }).click();
  await expect(
    panel.getByText("Road centerline geometry: manual_override · inferred", { exact: true }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "vi", exact: true }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Xuất bản làm việc", exact: true }).click(),
  ]);
  const stream = await download.createReadStream();
  expect(stream).not.toBeNull();
  const chunks: Buffer[] = [];
  if (stream) for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  const exported = JSON.parse(bytes.toString("utf8")) as WorldPackage;
  expect(exported.world.roads[0]).toEqual(original);
  expect(exported.overrides).toEqual(pkg.overrides);
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-review23-working.json",
    mimeType: "application/json",
    buffer: bytes,
  });
  await page.getByRole("button", { name: "Biên tập nâng cao", exact: true }).click();
  await page.getByLabel("Chọn tuyến đường").selectOption(road.localId);
  await expect(
    panel.getByText("Hình học tim đường: manual_override · inferred", { exact: true }),
  ).toBeVisible();
  await expect(panel).toContainText(`${road.carriagewayWidth} · survey · verified`);
  await expect(
    panel.getByText("Footprint GeoJSON: osm · source_only", { exact: true }),
  ).toHaveCount(0);
}
