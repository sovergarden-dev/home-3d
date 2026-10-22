import { expect, test, type Page } from "@playwright/test";

const SENTINEL = "H6_SYNTHETIC_PRIVACY_SENTINEL_7f236c";
const provenance = { source: "synthetic", quality: "synthetic" } as const;
const manifest = {
  schemaVersion: "1.0",
  datasetRevision: SENTINEL,
  units: "metres",
  frameConvention: "ENU_X_EAST_Y_UP_NEG_Z_NORTH",
  isSynthetic: true,
  chunks: [{ localId: "synthetic-core", bounds: [-260, -260, 260, 260], tier: "core" }],
  assetHashes: {},
  licences: ["CC0-1.0 Synthetic fixture"],
  coverage: { quality: "synthetic", sourceCount: 1 },
};
const buildings = Array.from({ length: 250 }, (_, i) => {
  const x = ((i % 25) - 12) * 20,
    z = (Math.floor(i / 25) - 4) * 20,
    s = 6;
  return {
    localId: `synthetic-building-${i}`,
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [x - s, z - s],
          [x + s, z - s],
          [x + s, z + s],
          [x - s, z + s],
          [x - s, z - s],
        ],
      ],
    },
    footprintKind: "footprint",
    wallHeight: 5 + (i % 5),
    levels: 1 + (i % 4),
    roofType: i % 3 === 0 ? "gabled" : "flat",
    provenance,
  };
});
const syntheticPackage = { manifest, world: { manifest, roads: [], buildings, lots: [] } };
async function openRoot(page: Page, query = "") {
  await page.addInitScript(() => {
    const state = {
      attempts: [] as { kind: string; url: string; body: string }[],
      console: [] as string[],
      pending: [] as Promise<void>[],
    };
    Object.assign(window, { __h6Privacy: state });
    const bodyText = async (value: unknown): Promise<string> => {
      const body = await value;
      if (body instanceof Blob) return body.text();
      if (body instanceof ArrayBuffer) return new TextDecoder().decode(body);
      if (ArrayBuffer.isView(body))
        return new TextDecoder().decode(
          new Uint8Array(body.buffer, body.byteOffset, body.byteLength),
        );
      if (body instanceof FormData)
        return (
          await Promise.all(
            Array.from(body.entries(), async ([key, value]) => `${key}=${await bodyText(value)}`),
          )
        ).join("&");
      return String(body ?? "");
    };
    const record = (kind: string, url: unknown, body?: unknown) => {
      const entry = { kind, url: String(url), body: "" };
      state.attempts.push(entry);
      state.pending.push(
        bodyText(body)
          .then((value) => {
            entry.body = value;
          })
          .catch(() => {
            entry.body = "BODY_UNREADABLE";
          }),
      );
    };
    const nativeFetch = window.fetch;
    window.fetch = function (...args: Parameters<typeof fetch>) {
      const [input, init] = args;
      record(
        "fetch",
        typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
        init?.body ?? (input instanceof Request ? input.clone().text() : undefined),
      );
      return nativeFetch.apply(this, args);
    };
    const open = XMLHttpRequest.prototype.open,
      send = XMLHttpRequest.prototype.send;
    const urls = new WeakMap<XMLHttpRequest, string>();
    XMLHttpRequest.prototype.open = function (
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      urls.set(this, String(url));
      return open.apply(this, [method, url, ...rest] as never);
    };
    XMLHttpRequest.prototype.send = function (body) {
      record("xhr", urls.get(this), body);
      return send.call(this, body);
    };
    const WS = window.WebSocket;
    const wsSend = WS.prototype.send;
    WS.prototype.send = function (data) {
      record("ws-send", this.url, data);
      return wsSend.call(this, data);
    };
    window.WebSocket = class extends WS {
      constructor(url: string | URL, protocols?: string | string[]) {
        record("ws", url);
        super(url, protocols);
      }
    };
    const beacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url, body) => {
      record("beacon", url, body);
      return beacon(url, body);
    };
    for (const name of ["log", "warn", "error"] as const) {
      const old = console[name];
      console[name] = (...args: unknown[]) => {
        state.console.push(args.map(String).join(" "));
        old(...args);
      };
    }
  });
  await page.goto(`/${query}`);
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 30000,
  });
}
async function openPackage(page: Page, buffer = Buffer.from(JSON.stringify(syntheticPackage))) {
  await page
    .getByLabel("Mở gói world")
    .setInputFiles({ name: "synthetic-only.json", mimeType: "application/json", buffer });
  await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
}
async function requireRender(page: Page) {
  const ready = (await page.locator("#scene-root").getAttribute("data-scene-state")) === "ready";
  if (process.env["REQUIRE_WEBGL2"] === "1")
    expect(ready, "Chromium required WebGL2 must not become fallback PASS").toBe(true);
  test.skip(
    !ready,
    "WebGL2 unavailable in this browser environment; data/UI tests still run, GPU runtime NOT_VERIFIED.",
  );
}
async function assertPrivacy(page: Page) {
  const data = await page.evaluate(async () => {
    const state = (
      window as unknown as {
        __h6Privacy: { attempts: unknown[]; console: string[]; pending: Promise<void>[] };
      }
    ).__h6Privacy;
    await Promise.all(state.pending);
    const storage = {
      local: Object.fromEntries(Object.entries(localStorage)),
      session: Object.fromEntries(Object.entries(sessionStorage)),
      databases: await indexedDB.databases(),
      caches: await caches.keys(),
    };
    return { state: { attempts: state.attempts, console: state.console }, storage };
  });
  expect(JSON.stringify(data)).not.toContain(SENTINEL);
  expect(
    data.state.console.filter((line) =>
      /THREE\.WebGLProgram: Shader Error|VALIDATE_STATUS|FRAGMENT shader|VERTEX shader/.test(line),
    ),
  ).toEqual([]);
  expect(
    data.state.attempts.filter((x) =>
      /maps\.google|streetview|open-meteo|supabase|\/upload|analytics|sentry/i.test(
        JSON.stringify(x),
      ),
    ),
  ).toEqual([]);
  const html = await page.request.get("/");
  expect(await html.text()).not.toContain(SENTINEL);
}

test.describe("H6 completion synthetic integration", () => {
  test("root and legacy query expose local file action with noindex and neutral fiction", async ({
    page,
  }) => {
    for (const query of ["", "?local-preview=1"]) {
      await openRoot(page, query);
      await expect(page.getByLabel("Mở gói world")).toBeAttached();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
        "content",
        "noindex, nofollow",
      );
      await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeDisabled();
      await assertPrivacy(page);
    }
  });
  for (const forceNoWebGL of [false, true]) {
    test(
      forceNoWebGL
        ? "sentinel unavailable renderer retains edit/export/privacy and never claims capture"
        : "sentinel open/edit/capture/export/reload never reaches request attempts, console, storage or SSR",
      async ({ page }) => {
        if (forceNoWebGL)
          await page.addInitScript(() => {
            const original = HTMLCanvasElement.prototype.getContext;
            HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
              if (type === "webgl2") return null;
              return Reflect.apply(original, this, [type, ...args]);
            } as typeof original;
          });
        await openRoot(page);
        await openPackage(page);
        await expect(page.locator(".h6-top-info")).toContainText("Điểm tham chiếu");
        await expect(page.locator(".h6-top-info")).not.toContainText("Syringa");
        await expect(page.getByTestId("private-world-panel")).toBeVisible();
        await page.getByLabel("Chọn công trình").selectOption("synthetic-building-0");
        await page.getByRole("button", { name: "Biên tập nâng cao", exact: true }).click();
        await page.getByLabel("Chiều cao (m)", { exact: true }).fill("12");
        await page.getByRole("button", { name: "Lưu sửa", exact: true }).click();
        await expect(page.getByLabel("Chiều cao (m)", { exact: true })).toHaveValue("12");
        page.once("dialog", (dialog) => dialog.dismiss());
        await page.getByRole("link", { name: "Giới thiệu", exact: true }).click();
        await expect(page.locator("#scene-root")).toBeVisible();
        await expect(page.getByLabel("Chiều cao (m)", { exact: true })).toHaveValue("12");
        const sceneState = await page.locator("#scene-root").getAttribute("data-scene-state");
        expect(["ready", "fallback"]).toContain(sceneState);
        if (forceNoWebGL) expect(sceneState).toBe("fallback");
        else if (process.env["REQUIRE_WEBGL2"] === "1")
          expect(sceneState, "Required renderer cannot be reported as a fallback PASS").toBe(
            "ready",
          );
        if (sceneState === "ready") {
          await expect(
            page.getByRole("button", { name: "Giữ khoảnh khắc", exact: true }),
          ).toBeEnabled();
          await page.getByRole("button", { name: "Giữ khoảnh khắc", exact: true }).click();
          const latencies = await page.getByTestId("demo-scene").evaluate((host) => ({
            build: Number(host.dataset.meshBuildLatencyMs),
            capture: Number(host.dataset.captureLatencyMs),
          }));
          expect(Number.isFinite(latencies.build)).toBe(true);
          expect(Number.isFinite(latencies.capture)).toBe(true);
          expect(latencies.build).toBeGreaterThanOrEqual(0);
          expect(latencies.capture).toBeGreaterThanOrEqual(0);
        } else {
          await expect(page.getByText("Thiết bị chưa mở được 3D")).toBeVisible();
          await expect(page.getByRole("button", { name: "Thử lại 3D", exact: true })).toBeVisible();
          await expect(
            page.getByRole("button", { name: "Giữ khoảnh khắc", exact: true }),
          ).toBeDisabled();
          await expect(page.getByTestId("demo-scene")).not.toHaveAttribute(
            "data-capture-latency-ms",
            /.+/,
          );
          test.info().annotations.push({
            type: "capability",
            description: forceNoWebGL
              ? "WebGL2 intentionally unavailable: disabled capture asserted; no rendered-capture claim."
              : "WebGL2 unavailable in this environment: disabled capture asserted; rendered capture NOT_VERIFIED. Privacy/export/reopen assertions still run.",
          });
        }
        const [download] = await Promise.all([
          page.waitForEvent("download"),
          page.getByRole("button", { name: "Xuất bản làm việc", exact: true }).click(),
        ]);
        const stream = await download.createReadStream();
        expect(stream).not.toBeNull();
        const chunks: Buffer[] = [];
        if (stream) for await (const chunk of stream) chunks.push(Buffer.from(chunk));
        const bytes = Buffer.concat(chunks),
          working = JSON.parse(bytes.toString("utf8"));
        expect(working.manifest.datasetRevision).toBe(SENTINEL);
        expect(working.world.buildings).toHaveLength(250);
        expect(working.world.buildings[0].wallHeight).toBe(5);
        expect(working.overrides.overrides.at(-1).patch.patch).toEqual({ wallHeight: 12 });
        expect(working).not.toHaveProperty("temporaryLotIllustrationSelected");
        await assertPrivacy(page);
        await page.reload();
        await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toHaveCount(0);
        await openPackage(page, bytes);
        await page.getByLabel("Chọn công trình").selectOption("synthetic-building-0");
        await page.getByRole("button", { name: "Biên tập nâng cao", exact: true }).click();
        await expect(page.getByLabel("Chiều cao (m)", { exact: true })).toHaveValue("12");
        await assertPrivacy(page);
      },
    );
  }
  test("portrait/landscape keyboard and VI/EN retain a reachable compact panel", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openRoot(page);
    await expect(page.getByTestId("private-world-panel")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Biên tập nâng cao", exact: true }),
    ).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: "Thu gọn bảng riêng", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("button", { name: "Mở bảng riêng", exact: true })).toBeVisible();
    await page.getByRole("radio", { name: "en", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await page.setViewportSize({ width: 740, height: 390 });
    const panel = await page.getByTestId("private-world-panel").boundingBox();
    expect(panel).not.toBeNull();
    expect(panel!.x).toBeGreaterThanOrEqual(0);
    expect(panel!.y).toBeGreaterThanOrEqual(0);
    expect(panel!.y + panel!.height).toBeLessThanOrEqual(390);
    await page.getByRole("radio", { name: "vi", exact: true }).click();
    await expect(page.locator("html")).toHaveAttribute("lang", "vi");
  });
  test("20 mode/route/package/capture cycles keep one ready canvas and no page errors", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await openRoot(page);
    await requireRender(page);
    const cyclePackage = Buffer.from(
      JSON.stringify({
        manifest,
        world: { ...syntheticPackage.world, buildings: buildings.slice(0, 3) },
      }),
    );
    for (let i = 0; i < 20; i++) {
      await openPackage(page, cyclePackage);
      for (const name of ["Mặt bằng", "Đi bộ", "Diorama"])
        await page.getByRole("radio", { name, exact: true }).click();
      await page.getByRole("button", { name: "Giữ khoảnh khắc", exact: true }).click();
      await page.getByRole("link", { name: "Giới thiệu", exact: true }).click();
      await page.getByRole("link", { name: "Về phố", exact: true }).click();
      await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready");
      await expect(page.locator("#scene-root canvas")).toHaveCount(1);
    }
    expect(errors).toEqual([]);
  });
  test("canvas part picking, hidden layers and camera framing preserve the package", async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await openRoot(page);
    await requireRender(page);
    const surface = (left: number, right: number) => ({
      type: "Polygon",
      coordinates: [
        [
          [left, -20],
          [right, -20],
          [right, 20],
          [left, 20],
          [left, -20],
        ],
      ],
    });
    const parent = {
      ...buildings[0],
      localId: "pick-parent",
      geometry: surface(-20, 20),
      roofType: "flat",
      parts: [
        { ...buildings[0], localId: "pick-west", geometry: surface(-20, 0), roofType: "flat" },
        { ...buildings[0], localId: "pick-east", geometry: surface(0, 20), roofType: "flat" },
      ],
    };
    const fixture = {
      manifest,
      world: {
        manifest,
        buildings: [
          parent,
          { ...buildings[1], localId: "pick-remote", geometry: surface(940, 960) },
        ],
        roads: [],
        lots: [
          {
            localId: "pick-lot",
            geometry: surface(-60, -40),
            status: "empty",
            confirmed: false,
            provenance,
          },
        ],
      },
    };
    await openPackage(page, Buffer.from(JSON.stringify(fixture)));
    const scene = page.getByTestId("demo-scene"),
      canvas = page.locator("#scene-root canvas");
    await page.getByRole("radio", { name: "Mặt bằng", exact: true }).click();
    await expect(scene).toHaveAttribute("data-plan-visible-vertical-span-metres", "300");
    const revision = await scene.getAttribute("data-world-revision");
    await page.mouse.click(612, 400);
    await expect(page.getByLabel("Chọn công trình", { exact: true })).toHaveValue("pick-parent");
    await expect(page.getByRole("region", { name: "Inspector", exact: true })).toContainText(
      "pick-west",
    );
    if (browserName === "chromium") {
      const touch = await page.context().newCDPSession(page);
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 667, y: 400 }],
      });
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(page.getByRole("region", { name: "Inspector", exact: true })).toContainText(
        "pick-east",
      );
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [{ x: 612, y: 400 }],
      });
      await touch.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [{ x: 720, y: 400 }],
      });
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(page.getByRole("region", { name: "Inspector", exact: true })).toContainText(
        "pick-east",
      );
      await page.getByRole("button", { name: "Về lõi 300 m", exact: true }).click();
      await touch.detach();
    }
    await page.mouse.click(507, 400);
    await expect(page.getByRole("region", { name: "Inspector", exact: true })).toContainText(
      "pick-lot",
    );
    await page.getByRole("button", { name: /Nhãn/ }).click();
    await page.mouse.click(507, 400);
    await expect(page.getByLabel("Chọn công trình", { exact: true })).toHaveValue("");
    await expect(page.getByRole("region", { name: "Inspector", exact: true })).not.toContainText(
      "pick-lot",
    );
    await page.getByRole("button", { name: /Nhãn/ }).click();
    await page.getByRole("button", { name: "Xem toàn dữ liệu", exact: true }).click();
    await expect
      .poll(async () => Number(await scene.getAttribute("data-plan-visible-vertical-span-metres")))
      .toBeGreaterThan(300);
    await page.getByRole("button", { name: "Về lõi 300 m", exact: true }).click();
    await expect(scene).toHaveAttribute("data-plan-visible-vertical-span-metres", "300");
    await canvas.focus();
    await page.keyboard.press("ArrowRight");
    await expect(scene).toHaveAttribute("data-plan-pan-revision", /[1-9]/);
    if (browserName === "chromium") {
      const cdp = await page.context().newCDPSession(page);
      const zoom = await scene.getAttribute("data-plan-camera-zoom");
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchStart",
        touchPoints: [
          { x: 610, y: 330, id: 0 },
          { x: 670, y: 330, id: 1 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [
          { x: 580, y: 330, id: 0 },
          { x: 700, y: 330, id: 1 },
        ],
      });
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await expect(scene).not.toHaveAttribute("data-plan-camera-zoom", zoom ?? "");
      await cdp.detach();
    }
    await expect(scene).toHaveAttribute("data-world-revision", revision ?? "");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Xuất bản làm việc", exact: true }).click(),
    ]);
    const stream = await download.createReadStream();
    expect(stream).not.toBeNull();
    const chunks: Buffer[] = [];
    if (stream) for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    expect(JSON.parse(Buffer.concat(chunks).toString("utf8")).world).toEqual(fixture.world);
    await openPackage(page, Buffer.from(JSON.stringify(fixture)));
    await expect(page.getByLabel("Chọn công trình", { exact: true })).toHaveValue("");
  });
  test("context loss then real retry preserves the loaded package and one world", async ({
    page,
  }) => {
    await openRoot(page);
    await requireRender(page);
    await openPackage(page);
    const supported = await page
      .locator("#scene-root canvas")
      .evaluate((canvas: HTMLCanvasElement) => {
        const ext = canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context");
        ext?.loseContext();
        return !!ext;
      });
    test.skip(
      !supported,
      "WEBGL_lose_context extension unavailable; native context-loss NOT_VERIFIED",
    );
    await expect(page.getByText("Thiết bị chưa mở được 3D", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Thử lại 3D", exact: true }).click();
    await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "ready");
    await expect(page.locator("#scene-root canvas")).toHaveCount(1);
    await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
    await expect(page.getByTestId("demo-scene")).toHaveAttribute("data-active-worlds", "1");
  });
});
