import { createHash } from "node:crypto";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { SYNTHETIC_NEIGHBORHOOD } from "../../src/world/fixtures/syntheticNeighborhood";

const ORIGIN = { latitude: 0.4321987, longitude: 0.6789123, altitude: 0 } as const;
const packageObject = {
  manifest: structuredClone(SYNTHETIC_NEIGHBORHOOD.manifest),
  world: structuredClone(SYNTHETIC_NEIGHBORHOOD),
};
packageObject.manifest.datasetRevision = "P7_SYNTHETIC_SENTINEL";
packageObject.world.manifest.datasetRevision = "P7_SYNTHETIC_SENTINEL";
const packageText = JSON.stringify(packageObject);
const packageSha256 = createHash("sha256").update(packageText, "utf8").digest("hex");
const georeference = JSON.stringify({ schemaVersion: "1.0", packageSha256, origin: ORIGIN });
const wrongGeoreference = JSON.stringify({
  schemaVersion: "1.0",
  packageSha256: "0".repeat(64),
  origin: ORIGIN,
});
const packageBText = JSON.stringify({
  manifest: { ...packageObject.manifest, datasetRevision: "synthetic-p7-package-b" },
  world: {
    ...packageObject.world,
    manifest: { ...packageObject.world.manifest, datasetRevision: "synthetic-p7-package-b" },
  },
});

const loopback = (url: string) => {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "data:" ||
      parsed.protocol === "blob:" ||
      ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)
    );
  } catch {
    return true;
  }
};

async function privacyProbe(page: Page) {
  await page.addInitScript(() => {
    const w = window as typeof window & { __p7Privacy?: Record<string, unknown> };
    const state = (w.__p7Privacy = { clipboard: [], storage: [], logs: [], fetch: [], xhr: [] });
    const sentinel = "P7_SYNTHETIC_SENTINEL";
    const record = (bucket: string, value: unknown) =>
      (state[bucket] as unknown[]).push(String(value));
    if (navigator.clipboard)
      navigator.clipboard.writeText = async (value: string) => record("clipboard", value);
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      record("storage", `${key}=${value}`);
      return originalSetItem.call(this, key, value);
    };
    for (const name of ["log", "info", "warn", "error", "debug"] as const) {
      const original = console[name];
      console[name] = (...args: unknown[]) => {
        record("logs", args.join(" "));
        original(...args);
      };
    }
    const originalFetch = window.fetch;
    window.fetch = ((...args: Parameters<typeof fetch>) => {
      record("fetch", String(args[0]));
      return originalFetch(...args);
    }) as typeof fetch;
    const originalOpen = window.open;
    w.open = ((...args: Parameters<typeof window.open>) => {
      record("fetch", `window.open:${String(args[0])}`);
      return originalOpen(...args);
    }) as typeof window.open;
    const originalSend = XMLHttpRequest.prototype.send;
    XMLHttpRequest.prototype.send = function (body) {
      record("xhr", body ?? "");
      return originalSend.call(this, body);
    };
    void sentinel;
  });
}

async function installPopupProbe(page: Page) {
  await page.addInitScript(() => {
    const state = {
      calls: [] as unknown[][],
      replaces: [] as string[],
      anchors: [] as Array<Record<string, unknown>>,
      metas: 0,
      openerNull: false,
    };
    const elements: Array<Record<string, unknown>> = [];
    const popup = {
      closed: false,
      opener: null as Window | null,
      document: {
        createElement: (tag: string) => {
          const element: Record<string, unknown> = {
            tag,
            name: "",
            content: "",
            rel: "",
            referrerPolicy: "",
            target: "",
            href: "",
            click: () => {
              if (tag === "a") {
                state.anchors.push({ ...element });
                state.replaces.push(String(element.href));
                state.openerNull = popup.opener === null;
              }
            },
          };
          elements.push(element);
          return element;
        },
        head: {
          appendChild: (node: { name?: string; content?: string }) => {
            if (node.name === "referrer" && node.content === "no-referrer") state.metas++;
          },
        },
        body: { appendChild: () => undefined },
      },
      location: {
        replace: (url: string) => {
          state.openerNull = popup.opener === null;
          state.replaces.push(url);
        },
      },
      close: () => {
        popup.closed = true;
      },
    };
    Object.assign(window, {
      __p7Popup: state,
      open: (...args: unknown[]) => {
        state.calls.push(args);
        state.openerNull = popup.opener === null;
        return popup;
      },
    });
  });
}

async function popupState(page: Page) {
  return page.evaluate(() => (window as typeof window & { __p7Popup: unknown }).__p7Popup);
}

async function openRoot(page: Page) {
  await page.goto("/?local-preview=1");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 30000,
  });
  const state = await page.locator("#scene-root").getAttribute("data-scene-state");
  if (state === "fallback")
    test.skip(true, "WebGL2 fallback: P7 visual/runtime assertions are not claimed on this device");
}

async function openPackage(page: Page, text = packageText, name = "synthetic-p7-world.json") {
  await page
    .getByLabel("Mở gói world")
    .setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
  await expect(page.getByText("Đã mở gói cục bộ", { exact: false })).toBeVisible();
}
async function openGeoreference(
  page: Page,
  text = georeference,
  name = "synthetic-p7-georeference.json",
) {
  await page
    .getByLabel("Mở tham chiếu địa lý")
    .setInputFiles({ name, mimeType: "application/json", buffer: Buffer.from(text) });
}
async function loadReadyPrivateWorld(page: Page) {
  await openRoot(page);
  await openPackage(page);
  await openGeoreference(page);
  await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeEnabled();
}
async function openRealStreetDialog(page: Page) {
  await page.getByRole("button", { name: "Phố thật", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
}
async function privacySnapshot(page: Page) {
  return page.evaluate(() => ({
    href: location.href,
    storage: Object.fromEntries(
      Object.entries(
        (window as typeof window & { __p7Privacy: Record<string, unknown[]> }).__p7Privacy,
      ).map(([key, value]) => [key, value.slice()]),
    ),
    body: document.body.innerText,
  }));
}

test.beforeEach(async ({ context }) => {
  await context.route("**/*", async (route) => {
    if (loopback(route.request().url())) await route.continue();
    else await route.abort();
  });
});

test.describe("P7 synthetic real-street handoff", () => {
  test("private package/reference gating is hash-bound and hidden input is attached", async ({
    page,
  }) => {
    await openRoot(page);
    await expect(page.getByLabel("Mở tham chiếu địa lý")).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeDisabled();
    await openPackage(page);
    await expect(page.getByLabel("Mở tham chiếu địa lý")).toBeAttached();
    await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeDisabled();
    await openGeoreference(page, wrongGeoreference, "wrong-p7-georeference.json");
    await expect(page.getByText("Tham chiếu không hợp lệ", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeDisabled();
    await openGeoreference(page);
    await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeEnabled();
  });

  test("fixture, WebGL2 fallback, and loading states keep real street disabled", async ({
    page,
  }) => {
    await openRoot(page);
    await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeDisabled();
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type: string, ...args: unknown[]) {
        if (type === "webgl2") return null;
        return Reflect.apply(original, this, [type, ...args]);
      } as typeof original;
    });
    await page.reload();
    await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", "fallback", {
      timeout: 30000,
    });
    await openPackage(page);
    await openGeoreference(page);
    await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeDisabled();
    await page.addInitScript(() => {
      const original = File.prototype.text;
      File.prototype.text = function () {
        return new Promise<string>((resolve) =>
          setTimeout(() => resolve(original.call(this)), 500),
        );
      };
    });
    await page.reload();
    await page.getByLabel("Mở gói world").setInputFiles({
      name: "slow-p7-world.json",
      mimeType: "application/json",
      buffer: Buffer.from(packageText),
    });
    await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeDisabled();
  });

  test("package switch and imported reset invalidate references without rebuilding the scene host", async ({
    page,
  }) => {
    await loadReadyPrivateWorld(page);
    const baseline = await page.evaluate(() => ({
      host: document.querySelector('[data-testid="demo-scene"]')?.getAttribute("data-testid"),
      scene: document.querySelector("#scene-root")?.getAttribute("data-scene-state"),
    }));
    await openPackage(page, packageBText, "synthetic-p7-world-b.json");
    await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeDisabled();
    await openGeoreference(
      page,
      JSON.stringify({
        schemaVersion: "1.0",
        packageSha256: createHash("sha256").update(packageBText).digest("hex"),
        origin: ORIGIN,
      }),
      "p7-b-georeference.json",
    );
    await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeEnabled();
    await page.evaluate(async () => {
      const { worldDataProvider } = await import("/src/world/privateWorldSession.ts");
      worldDataProvider.resetFixture();
    });
    await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeDisabled();
    await expect
      .poll(() =>
        page.evaluate(() => ({
          host: document.querySelector('[data-testid="demo-scene"]')?.getAttribute("data-testid"),
          scene: document.querySelector("#scene-root")?.getAttribute("data-scene-state"),
        })),
      )
      .toEqual(baseline);
  });

  test("cancel intentionally focuses first and leaves no privacy side effect", async ({
    page,
    context,
  }) => {
    const requests: string[] = [];
    context.on("request", (request) => requests.push(request.url() + (request.postData() ?? "")));
    await privacyProbe(page);
    await installPopupProbe(page);
    await loadReadyPrivateWorld(page);
    const before = await privacySnapshot(page);
    await openRealStreetDialog(page);
    await expect(page.getByRole("dialog")).toContainText(/vị trí điểm đang xem/);
    await expect(page.getByRole("button", { name: "Hủy", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Hủy", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(await popupState(page)).toMatchObject({
      calls: [],
      replaces: [],
      anchors: [],
      metas: 0,
      openerNull: false,
    });
    const after = await privacySnapshot(page);
    expect(after.href).toBe(before.href);
    expect(after.storage).toEqual(before.storage);
    for (const needle of [
      "P7_SYNTHETIC_SENTINEL",
      String(ORIGIN.latitude),
      String(ORIGIN.longitude),
    ]) {
      expect(requests.join("\n")).not.toContain(needle);
      expect(JSON.stringify(after.storage)).not.toContain(needle);
      expect(await (await page.request.get("/")).text()).not.toContain(needle);
    }
    await expect(
      page.locator('a[href*="google.com/maps"],link[href*="google.com/maps"]'),
    ).toHaveCount(0);
  });

  test("Street View confirmation uses synthetic popup, no real Google contact, no referrer, and minimal encoded params", async ({
    page,
    context,
  }) => {
    await privacyProbe(page);
    const googleRequests: { url: string; referer?: string }[] = [];
    await context.route("**", async (route) => {
      const url = route.request().url();
      if (url.startsWith("https://www.google.com/maps/")) {
        googleRequests.push({ url, referer: route.request().headers().referer });
        await route.fulfill({
          status: 200,
          contentType: "text/html",
          body: "<!doctype html><title>synthetic Google</title>",
        });
      } else if (loopback(url)) await route.continue();
      else await route.abort();
    });
    await loadReadyPrivateWorld(page);
    const before = await privacySnapshot(page);
    await openRealStreetDialog(page);
    const popupPromise = page.waitForEvent("popup");
    await page.getByRole("button", { name: "Mở Google", exact: true }).click();
    const popup = await popupPromise;
    await popup.waitForURL("https://www.google.com/maps/**");
    await expect(popup).toHaveTitle("synthetic Google");
    const opener = await popup.evaluate(() => window.opener);
    const url = new URL(popup.url());
    expect(opener).toBeNull();
    expect(googleRequests).toHaveLength(1);
    expect(googleRequests[0]?.referer).toBeUndefined();
    expect(url.origin).toBe("https://www.google.com");
    expect(url.pathname).toBe("/maps/@");
    expect(url.searchParams.get("api")).toBe("1");
    expect(url.searchParams.get("map_action")).toBe("pano");
    const viewpoint = url.searchParams.get("viewpoint")?.split(",").map(Number) ?? [];
    expect(viewpoint).toHaveLength(2);
    expect(viewpoint[0]).toBeGreaterThan(ORIGIN.latitude - 0.01);
    expect(viewpoint[0]).toBeLessThan(ORIGIN.latitude + 0.01);
    expect(viewpoint[1]).toBeGreaterThan(ORIGIN.longitude - 0.01);
    expect(viewpoint[1]).toBeLessThan(ORIGIN.longitude + 0.01);
    expect(Number(url.searchParams.get("heading"))).toBeGreaterThanOrEqual(0);
    expect(Number(url.searchParams.get("heading"))).toBeLessThan(360);
    expect([...url.searchParams.keys()].sort()).toEqual([
      "api",
      "heading",
      "map_action",
      "viewpoint",
    ]);
    const after = await privacySnapshot(page);
    expect(after.storage.storage).toEqual(before.storage.storage);
    expect(after.storage.fetch.every((entry) => !entry.includes("P7_SYNTHETIC_SENTINEL"))).toBe(
      true,
    );
    expect(after.storage.xhr.every((entry) => !entry.includes("P7_SYNTHETIC_SENTINEL"))).toBe(true);
    expect(after.body).not.toContain("P7_SYNTHETIC_SENTINEL");
  });

  test("Satellite confirmation sends only its documented minimal parameters", async ({ page }) => {
    await installPopupProbe(page);
    await loadReadyPrivateWorld(page);
    await openRealStreetDialog(page);
    await page.getByRole("button", { name: "Vệ tinh", exact: true }).click();
    await page.getByRole("button", { name: "Mở Google", exact: true }).click();
    const state = (await popupState(page)) as {
      replaces: string[];
      anchors: Array<Record<string, unknown>>;
      metas: number;
      openerNull: boolean;
    };
    expect(state.metas).toBe(1);
    expect(state.openerNull).toBe(true);
    expect(state.anchors[0]).toMatchObject({
      rel: "noopener noreferrer",
      referrerPolicy: "no-referrer",
      target: "_self",
    });
    const url = new URL(state.replaces[0]!);
    expect(url.searchParams.get("map_action")).toBe("map");
    expect(url.searchParams.get("basemap")).toBe("satellite");
    expect(Number(url.searchParams.get("zoom"))).toBeGreaterThanOrEqual(0);
    expect(Number(url.searchParams.get("zoom"))).toBeLessThanOrEqual(21);
    expect(url.searchParams.get("center")?.split(",").map(Number)).toHaveLength(2);
    expect([...url.searchParams.keys()].sort()).toEqual([
      "api",
      "basemap",
      "center",
      "map_action",
      "zoom",
    ]);
  });

  test("blocked popup preserves the session and keeps the control usable", async ({ page }) => {
    await page.addInitScript(() => {
      Object.assign(window, { open: () => null });
    });
    await loadReadyPrivateWorld(page);
    await openRealStreetDialog(page);
    await page.getByRole("button", { name: "Mở Google", exact: true }).click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("alert")).toContainText(/popup|cửa sổ|blocked|bị chặn/i);
    await page.getByRole("button", { name: "Hủy", exact: true }).click();
    await expect(page.getByRole("button", { name: "Phố thật", exact: true })).toBeEnabled();
  });

  test("language and portrait/landscape keep the dialog reachable", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await loadReadyPrivateWorld(page);
    await page.getByRole("button", { name: "Phố thật", exact: true }).focus();
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Hủy", exact: true })).toBeFocused();
    await page.screenshot({
      path: "test-results/p7/real-street-mobile-portrait.png",
      fullPage: true,
    });
    await page.getByRole("button", { name: "Hủy", exact: true }).click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("radio", { name: "en", exact: true }).click();
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.locator(".h6-map-controls-anchor")).toHaveClass(/top-1\/2/);
    const realStreet = page.getByRole("button", { name: "Real street", exact: true });
    await expect(realStreet).toBeEnabled();
    await realStreet.focus();
    await expect(realStreet).toBeFocused();
    await realStreet.press("Enter");
    await expect(page.getByRole("dialog")).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
    await page.screenshot({
      path: "test-results/p7/real-street-mobile-landscape.png",
      fullPage: true,
    });
  });
});
