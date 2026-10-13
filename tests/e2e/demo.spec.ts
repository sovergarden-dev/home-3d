import { test, expect, type Page } from "@playwright/test";
async function openDemo(page: Page, options: { requireReady?: boolean } = {}) {
  const requireReady = options.requireReady ?? process.env["REQUIRE_WEBGL2"] === "1";
  await page.route("https://fonts.googleapis.com/**", (route) => route.abort());
  await page.route("https://fonts.gstatic.com/**", (route) => route.abort());
  await page.goto("/");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 30000,
  });
  const state = await page.locator("#scene-root").getAttribute("data-scene-state");
  if (requireReady) expect(state).toBe("ready");
  return state === "ready";
}
test("demo labels, privacy, noindex and graceful 3D capability branch", async ({ page }) => {
  const privateCalls: string[] = [];
  page.on("request", (request) => {
    if (/maps\.(google|app)|streetview|open-meteo/i.test(request.url()))
      privateCalls.push(request.url());
  });
  const ready = await openDemo(page);
  await expect(page.getByText("DEMO · Phố hư cấu", { exact: true })).toBeVisible();
  await expect(page.getByRole("tab")).toHaveCount(4);
  await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeDisabled();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", "noindex, nofollow");
  if (ready) await expect(page.locator("#scene-root canvas")).toBeVisible();
  else await expect(page.getByText("Thiết bị chưa mở được 3D")).toBeVisible();
  expect(privateCalls).toEqual([]);
});
test("time, weather, festivals, camera, capture and clear work in a rendered scene", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const ready = await openDemo(page);
  test.skip(!ready, "No WebGL2: fallback branch is covered separately, not a GPU pass.");
  await page.getByRole("button", { name: /12:00.*Trưa/ }).click();
  await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-night", "false");
  const daytime = await page.locator("#scene-root canvas").screenshot();
  await page.getByRole("button", { name: /19:30.*Chợ đêm/ }).click();
  await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-night", "true");
  const nighttime = await page.locator("#scene-root canvas").screenshot();
  expect(Buffer.compare(daytime, nighttime)).not.toBe(0);
  await page.getByRole("tab", { name: "Thời tiết", exact: true }).click();
  await page.getByRole("radio", { name: "Mưa", exact: true }).click();
  await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-weather", "rain");
  await page.getByRole("tab", { name: "Lễ hội", exact: true }).click();
  await page.getByRole("radio", { name: "Trung Thu", exact: true }).click();
  await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-festival", "midautumn");
  await page.getByRole("button", { name: "Phóng to", exact: true }).click();
  await page.getByRole("button", { name: "Về nhà mình", exact: true }).click();
  await page.getByRole("button", { name: "Giữ khoảnh khắc", exact: true }).click();
  await page.getByRole("tab", { name: "Kỷ niệm", exact: true }).click();
  await expect(page.getByRole("img", { name: /Giữ khoảnh khắc/ })).toBeVisible();
  const href = await page.locator("a[download]").getAttribute("href");
  expect(href).toMatch(/^data:image\/png;base64,/);
  await page.getByRole("button", { name: "Xoá ảnh trong phiên" }).click();
  await expect(page.getByText("Chưa có kỷ niệm nào")).toBeVisible();

  // Test Top-down / Plan view mode (Bước 4: Camera nhìn thẳng từ trên xuống, thước mét, lớp dữ liệu)
  await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
  await expect(page.getByTestId("plan-scale-bar")).toBeVisible();
  await expect(page.getByText("Bắc ↑")).toBeVisible();
  await expect(page.getByText(/Thước mét/)).toBeVisible();

  // Test Layer Toggles (Cây xanh, Nhãn)
  await page.getByRole("button", { name: /Cây xanh/ }).click();
  await page.getByRole("button", { name: /Nhãn/ }).click();

  // Return to Diorama
  await page.getByRole("radio", { name: "Diorama", exact: true }).click();
  await expect(page.getByTestId("plan-scale-bar")).toBeHidden();

  expect(errors).toEqual([]);
});
test("mobile controls hide immediately during drag and return at peek", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const ready = await openDemo(page);
  test.skip(!ready, "Fallback does not have active map controls.");
  const controls = page.getByRole("button", { name: "Phóng to", exact: true });
  const handle = page.getByRole("button", { name: "Kéo để mở rộng bảng điều khiển" });
  await expect(controls).toBeVisible();
  const bounds = await handle.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y + 12);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + bounds!.width / 2, bounds!.y - 260, { steps: 8 });
  await expect(controls).toBeHidden();
  await page.mouse.up();
  await expect(controls).toBeHidden();
  await handle.focus();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("ArrowDown");
  await expect(controls).toBeVisible();
  await page.getByRole("radio", { name: "en", exact: true }).click();
  await expect(page.getByRole("tab", { name: "Time", exact: true })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
});
test("WebGL unavailable cannot trap the user behind loading or claim capture success", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
      if (type === "webgl2") return null;
      return Reflect.apply(original, this, [type, ...args]);
    } as typeof original;
  });
  await openDemo(page, { requireReady: false });
  await expect(page.getByText("Thiết bị chưa mở được 3D")).toBeVisible();
  await expect(page.getByRole("button", { name: "Giữ khoảnh khắc" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Thử lại 3D" })).toBeVisible();
});
test("route roundtrip recreates exactly one canvas and context loss has a recovery UI", async ({
  page,
}) => {
  const ready = await openDemo(page);
  test.skip(!ready, "GPU lifecycle is not tested when WebGL2 is absent.");
  await page.getByRole("link", { name: "Giới thiệu", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Về Phố Nhà Mình" })).toBeVisible();
  await page.getByRole("link", { name: "Về phố", exact: true }).click();
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready");
  await expect(page.locator("#scene-root canvas")).toHaveCount(1);
  await page.locator("#scene-root canvas").evaluate((canvas) => {
    const gl = (canvas as HTMLCanvasElement).getContext("webgl2");
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
  });
  await expect(page.getByText("Thiết bị chưa mở được 3D")).toBeVisible();
  await page.getByRole("button", { name: "Thử lại 3D" }).click();
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready");
  await expect(page.locator("#scene-root canvas")).toHaveCount(1);
});
test("Mặt bằng renders one orthographic world, measures from its camera and applies layer toggles", async ({
  page,
}) => {
  const ready = await openDemo(page);
  test.skip(!ready, "Fallback does not have a rendered world.");
  const scene = page.getByTestId("demo-scene");
  await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
  await expect(page.getByRole("button", { name: "La bàn — xoay về hướng Bắc" })).toBeDisabled();
  await expect(page.getByText("Kéo để quay · Chụm / cuộn để zoom")).toBeHidden();
  await expect(scene).toHaveAttribute("data-active-worlds", "1");
  await expect(scene).toHaveAttribute("data-camera-type", "OrthographicCamera");
  await expect(scene).toHaveAttribute("data-plan-zenith", "true");
  await expect(scene).toHaveAttribute("data-rendered-frames", /[1-9]/);
  await expect(scene).toHaveAttribute("data-frame-p95-ms", /[0-9]/);
  const ruler = page.getByTestId("plan-scale-ruler");
  await expect(ruler).toHaveAttribute("style", /width: [1-9]/);
  const rulerBeforeZoom = await ruler.getAttribute("style");
  await page.getByRole("button", { name: "Phóng to", exact: true }).click();
  await expect(ruler).not.toHaveAttribute("style", rulerBeforeZoom ?? "");
  const canvas = page.locator("#scene-root canvas");
  const bounds = await canvas.boundingBox();
  expect(bounds).not.toBeNull();
  await page.mouse.move(bounds!.x + 720, bounds!.y + 300);
  await page.mouse.down();
  await page.mouse.move(bounds!.x + 230, bounds!.y + 210, { steps: 4 });
  await page.mouse.up();
  await expect(scene).toHaveAttribute("data-plan-pan-revision", /[1-9]/);
  await page.getByRole("button", { name: /Cây xanh/ }).click();
  await expect(scene).toHaveAttribute("data-trees-visible", "false");
  await page.getByRole("button", { name: /Nhãn/ }).click();
  await expect(scene).toHaveAttribute("data-labels-visible", "false");
});
test("explicit local preview refuses malformed package instead of silently returning to fixture", async ({
  page,
}) => {
  await page.goto("/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 30000,
  });
  await expect(page.getByText("Xem trước gói cục bộ")).toBeVisible();
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "invalid-world.json",
    mimeType: "application/json",
    buffer: Buffer.from("{ invalid"),
  });
  await expect(page.getByRole("alert")).toBeVisible();
  const rendererReady =
    (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
  if (rendererReady) {
    await expect(page.getByTestId("demo-scene")).toHaveAttribute(
      "data-world-mode",
      "private-error",
    );
    await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-active-worlds", "0");
  } else {
    await expect(page.getByText("Thiết bị chưa mở được 3D")).toBeVisible();
  }
});

test("explicit local preview opens a valid synthetic package as one in-memory world", async ({
  page,
}) => {
  const manifest = {
    schemaVersion: "1.0",
    datasetRevision: "synthetic-private-e2e",
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
        localId: "road-e2e",
        polylineENU: [
          [-6, 0],
          [6, 0],
        ],
        connectorIds: [],
        roadClass: "residential",
        carriagewayWidth: 5,
        elevationLayer: 0,
        direction: "both",
        provenance: { source: "synthetic", quality: "synthetic" },
      },
    ],
    buildings: [],
    lots: [],
  };
  await page.goto("/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 30000,
  });
  await page.getByLabel("Mở gói world").setInputFiles({
    name: "synthetic-world.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ manifest, world })),
  });
  await expect(page.getByText("Đã mở gói cục bộ")).toBeVisible();
  const rendererReady =
    (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
  if (rendererReady) {
    await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-world-mode", "private");
    await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-active-worlds", "1");
  } else {
    await expect(page.getByText("Thiết bị chưa mở được 3D")).toBeVisible();
  }
});
