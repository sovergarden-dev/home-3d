import { expect, test } from "@playwright/test";

test("20 view changes preserve one scene, then a route remount recovers cleanly", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));

  await page.goto("/");
  const root = page.locator("#scene-root");
  await expect(root).toHaveAttribute("data-scene-state", /ready|fallback/, { timeout: 60000 });
  const initialState = await root.getAttribute("data-scene-state");
  if (initialState !== "ready") {
    test.skip(
      process.env["REQUIRE_WEBGL2"] !== "1",
      "WebGL2 unavailable; rendered-scene lifecycle NOT_VERIFIED.",
    );
    expect(initialState).toBe("ready");
  }

  const diorama = page.getByRole("radio", { name: "Diorama", exact: true });
  const plan = page.getByRole("radio", { name: "Mặt bằng", exact: true });
  for (let cycle = 0; cycle < 10; cycle++) {
    await plan.click();
    await expect(root.locator("canvas")).toHaveCount(1);
    await diorama.click();
    await expect(root.locator("canvas")).toHaveCount(1);
  }

  await page.getByRole("link", { name: "Giới thiệu", exact: true }).click();
  await expect(page).toHaveURL(/\/gioi-thieu$/);
  await expect(page.getByRole("heading")).toBeVisible();
  await page.getByRole("link", { name: "Về phố", exact: true }).click();
  await expect(root).toHaveAttribute("data-scene-state", "ready", { timeout: 60000 });
  await expect(root.locator("canvas")).toHaveCount(1);
  expect(pageErrors).toEqual([]);
});
