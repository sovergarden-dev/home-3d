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
