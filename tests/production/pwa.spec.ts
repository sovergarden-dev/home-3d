import { expect, test } from "@playwright/test";

test("production registers only in the top-level page; offline cache contains owned static bytes", async ({
  page,
  context,
}) => {
  await page.goto("/gioi-thieu");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const manifest = await (await page.request.get("/manifest.webmanifest")).json();
  expect(manifest.icons.map((icon: { sizes: string }) => icon.sizes)).toEqual([
    "192x192",
    "512x512",
  ]);
  await page.evaluate(async () => {
    await fetch("/api/private-runtime?synthetic-private-sentinel=1", { cache: "no-store" });
  });
  const paths = await page.evaluate(async () => {
    const requests = (
      await Promise.all((await caches.keys()).map(async (name) => (await caches.open(name)).keys()))
    ).flat();
    return requests.map((request) => new URL(request.url).pathname + new URL(request.url).search);
  });
  expect(paths.length).toBeGreaterThan(10);
  expect(
    paths.every(
      (path) =>
        /^\/assets\/[\w.-]+-[\w-]{8,}\.(js|css|woff2|png|svg|jpg|webp)$/.test(path) ||
        /^\/offline-(home|about)-[a-f0-9]{16}\.html$/.test(path),
    ),
  ).toBe(true);
  expect(paths.some((path) => /api|synthetic-private-sentinel|\?/.test(path))).toBe(false);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole("link", { name: "Về phố", exact: true })).toBeVisible();
  await page.goto("/");
  await expect(page.locator("#scene-root")).toHaveAttribute("data-scene-state", /ready|fallback/, {
    timeout: 60000,
  });
  await expect(page.getByTestId("build-info")).toBeVisible();
  await context.setOffline(false);
});

test("a clean iframe never registers a service worker", async ({ page }) => {
  await page.goto("/__qa__/iframe");
  await expect(
    page.frameLocator("iframe").getByRole("link", { name: "Về phố", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length),
  ).toBe(0);
});

test("an update prompts, waits for explicit confirmation and leaves other tabs intact", async ({
  page,
  context,
}) => {
  await page.goto("/gioi-thieu");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const other = await context.newPage();
  await other.goto("/gioi-thieu");
  await other.evaluate(() => {
    document.body.dataset["qaSession"] = "retained";
  });
  await page.request.post("/__qa__/update");
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.getRegistration();
    await registration!.update();
  });
  await expect(page.getByTestId("pwa-update")).toBeVisible({ timeout: 60000 });
  await page
    .getByTestId("pwa-update")
    .getByRole("button", { name: "Tải lại", exact: true })
    .click();
  await expect(page.getByRole("alertdialog")).toBeVisible();
  await page.getByRole("alertdialog").getByRole("button", { name: "Để sau", exact: true }).click();
  expect(await other.locator("body").getAttribute("data-qa-session")).toBe("retained");
  await page
    .getByTestId("pwa-update")
    .getByRole("button", { name: "Tải lại", exact: true })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Tải lại", exact: true }).click();
  await expect(page.getByTestId("pwa-update")).toHaveCount(0);
  await expect(other.getByTestId("pwa-update")).toBeVisible();
  expect(await other.locator("body").getAttribute("data-qa-session")).toBe("retained");
  expect(
    await page.evaluate(
      async () =>
        (await caches.keys()).filter((key) => key.startsWith("home3d-public-static-v1-")).length,
    ),
  ).toBe(2);
});

test("failed installation is removed and the previously activated generation survives the next update", async ({
  page,
}) => {
  await page.request.post("/__qa__/update");
  await page.goto("/gioi-thieu");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const original = await page.evaluate(async () =>
    (await caches.keys()).find((name) => name.startsWith("home3d-public-static-v1-")),
  );
  expect(original).toBeTruthy();
  await page.request.post("/__qa__/update?fail=1");
  const failedState = await page.evaluate(async () => {
    const registration = (await navigator.serviceWorker.getRegistration())!;
    const done = new Promise<string>((resolve) =>
      registration.addEventListener(
        "updatefound",
        () => {
          const worker = registration.installing!;
          worker.addEventListener("statechange", () => {
            if (worker.state === "redundant") resolve(worker.state);
          });
        },
        { once: true },
      ),
    );
    await registration.update();
    return done;
  });
  expect(failedState).toBe("redundant");
  expect(
    await page.evaluate(async () =>
      (await caches.keys()).filter((name) => name.startsWith("home3d-public-static-v1-")),
    ),
  ).toEqual([original]);
  await page.request.post("/__qa__/update");
  await page.evaluate(async () => {
    await (await navigator.serviceWorker.getRegistration())!.update();
  });
  await expect(page.getByTestId("pwa-update")).toBeVisible({ timeout: 60000 });
  await page
    .getByTestId("pwa-update")
    .getByRole("button", { name: "Tải lại", exact: true })
    .click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Tải lại", exact: true }).click();
  await expect(page.getByTestId("pwa-update")).toHaveCount(0);
  const generations = await page.evaluate(async () =>
    (await caches.keys()).filter((name) => name.startsWith("home3d-public-static-v1-")),
  );
  expect(generations).toHaveLength(2);
  expect(generations).toContain(original);
});

test("rollback refreshes activation order and failed rollback preserves retained bytes", async ({
  page,
}) => {
  await page.request.post("/__qa__/update?revision=100");
  await page.goto("/gioi-thieu");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await expect
    .poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller)))
    .toBe(true);
  const versions = () =>
    page.evaluate(async () =>
      (await caches.keys()).filter((name) => name.startsWith("home3d-public-static-v1-")),
    );
  const a = (await versions())[0]!;
  const activate = async (revision: number) => {
    await page.request.post(`/__qa__/update?revision=${revision}`);
    await page.evaluate(async () => {
      await (await navigator.serviceWorker.getRegistration())!.update();
    });
    await expect(page.getByTestId("pwa-update")).toBeVisible({ timeout: 60000 });
    await page
      .getByTestId("pwa-update")
      .getByRole("button", { name: "Tải lại", exact: true })
      .click();
    await page
      .getByRole("alertdialog")
      .getByRole("button", { name: "Tải lại", exact: true })
      .click();
    await expect(page.getByTestId("pwa-update")).toHaveCount(0);
  };
  await activate(101);
  const retained = await page.evaluate(async (name) => {
    const cache = await caches.open(name),
      keys = await cache.keys();
    const bytes = await (await cache.match(keys[0]!))!.arrayBuffer();
    return {
      count: keys.length,
      path: new URL(keys[0]!.url).pathname,
      hash: [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))],
    };
  }, a);
  await page.request.post("/__qa__/update?revision=100&fail=1");
  await page.evaluate(async () => {
    const registration = (await navigator.serviceWorker.getRegistration())!;
    const failed = new Promise<void>((resolve) =>
      registration.addEventListener(
        "updatefound",
        () => {
          const worker = registration.installing!;
          worker.addEventListener("statechange", () => {
            if (worker.state === "redundant") resolve();
          });
        },
        { once: true },
      ),
    );
    await registration.update();
    await failed;
  });
  expect(await versions()).toContain(a);
  expect(
    await page.evaluate(
      async ({ name, resource }) => {
        const cache = await caches.open(name),
          bytes = await (await cache.match(resource))!.arrayBuffer();
        return {
          count: (await cache.keys()).length,
          path: resource,
          hash: [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))],
        };
      },
      { name: a, resource: retained.path },
    ),
  ).toEqual(retained);
  await activate(100);
  await activate(102);
  const final = await versions();
  expect(final).toHaveLength(2);
  expect(final).toContain(a);
  expect(final.some((name) => name.endsWith("-qa101"))).toBe(false);
});
