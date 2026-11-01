import { expect, test, type Page } from "@playwright/test";

type ShaderHold = { holdFrom: number; created: () => number };

// Reports "still linking" for every program created at or after `holdFrom`, through the
// KHR_parallel_shader_compile query that startup polls. Engines without the extension get a
// stand-in, so the wait is deterministic everywhere. Test-only; nothing leaves the page.
function holdShaderPrograms() {
  const COMPLETION_STATUS_KHR = 0x91b1;
  const proto = WebGL2RenderingContext.prototype;
  const { createProgram, getExtension, getProgramParameter } = proto;
  const created = new WeakMap<WebGLProgram, number>();
  const native = new WeakMap<WebGL2RenderingContext, boolean>();
  let count = 0;
  const hold: ShaderHold = { holdFrom: 0, created: () => count };
  (window as unknown as { __shaderHold: ShaderHold }).__shaderHold = hold;
  proto.createProgram = function (this: WebGL2RenderingContext) {
    const program = createProgram.call(this);
    if (program) created.set(program, count++);
    return program;
  };
  proto.getExtension = function (this: WebGL2RenderingContext, name: string) {
    const extension = getExtension.call(this, name);
    if (name !== "KHR_parallel_shader_compile") return extension;
    native.set(this, extension !== null);
    return extension ?? { COMPLETION_STATUS_KHR };
  } as unknown as typeof proto.getExtension;
  proto.getProgramParameter = function (
    this: WebGL2RenderingContext,
    program: WebGLProgram,
    pname: number,
  ) {
    if (pname !== COMPLETION_STATUS_KHR) return getProgramParameter.call(this, program, pname);
    if ((created.get(program) ?? 0) >= hold.holdFrom) return false;
    return native.get(this) ? getProgramParameter.call(this, program, pname) : true;
  };
}

/** "existing" releases programs created so far and keeps holding newer ones. */
const setHold = (page: Page, mode: "existing" | "none") =>
  page.evaluate((next) => {
    const hold = (window as unknown as { __shaderHold: ShaderHold }).__shaderHold;
    hold.holdFrom = next === "none" ? Number.POSITIVE_INFINITY : hold.created();
    return hold.created();
  }, mode);

const createdPrograms = (page: Page) =>
  page.evaluate(() => (window as unknown as { __shaderHold: ShaderHold }).__shaderHold.created());

test("startup keeps input closed until every shader variant settles, also across context loss", async ({
  page,
}) => {
  await page.addInitScript(holdShaderPrograms);
  await page.goto("/");
  const root = page.locator("#scene-root");
  const scene = page.getByTestId("demo-scene");
  const canvas = root.locator("canvas");
  const splash = page.getByRole("progressbar", { name: "Đang tải phố 3D", exact: true });
  await expect
    .poll(
      async () =>
        (await canvas.count()) > 0 || (await root.getAttribute("data-scene-state")) === "fallback",
      { timeout: 60000 },
    )
    .toBe(true);
  const webgl = (await canvas.count()) > 0;
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(webgl).toBe(true);
  test.skip(!webgl, "This browser has no WebGL2; there is no shader startup to hold.");
  const canLose = await canvas.evaluate((element: HTMLCanvasElement) =>
    Boolean(element.getContext("webgl2")?.getExtension("WEBGL_lose_context")),
  );
  test.skip(!canLose, "Native context-loss extension unavailable");

  // Programs for the visible state are held: no frame, no variant, the splash stays up.
  await page.waitForTimeout(500);
  await expect(root).toHaveAttribute("data-scene-state", "loading");
  await expect(splash).toBeVisible();
  await expect(scene).not.toHaveAttribute("data-memory-geometries");
  await expect(scene).not.toHaveAttribute("data-startup-variants");

  // Release those but hold programs created from now on: the first frame draws and every
  // variant compiles, yet input stays closed while the variant programs link.
  const visiblePrograms = await setHold(page, "existing");
  await expect(scene).toHaveAttribute("data-memory-geometries", /^\d+$/);
  await expect
    .poll(async () => {
      const [warmed, total] = ((await scene.getAttribute("data-startup-variants")) ?? "0/1")
        .split("/")
        .map(Number);
      return warmed === total;
    })
    .toBe(true);
  expect(await createdPrograms(page)).toBeGreaterThan(visiblePrograms);
  await page.waitForTimeout(300);
  await expect(root).toHaveAttribute("data-scene-state", "loading");
  await expect(splash).toBeVisible();

  // Lose the context twice before startup ends: one automatic retry, then the retry card
  // must be reachable instead of hidden behind the splash.
  const loseContext = (label: string) =>
    canvas.evaluate((element: HTMLCanvasElement, mark) => {
      element.dataset["lostCanvas"] = mark;
      element.getContext("webgl2")!.getExtension("WEBGL_lose_context")!.loseContext();
    }, label);
  await loseContext("first");
  await expect(root).toHaveAttribute("data-recovery-attempts", "1");
  await expect(root.locator("canvas:not([data-lost-canvas])")).toHaveCount(1);
  await expect(root).toHaveAttribute("data-scene-state", "loading");
  await loseContext("second");
  await expect(root).toHaveAttribute("data-scene-state", "fallback");
  await expect(page.getByTestId("static-scene")).toBeVisible();
  await expect(splash).toHaveCount(0);
  const retry = page.getByRole("button", { name: "Thử lại 3D", exact: true });
  await retry.click({ trial: true });

  // A hash set while the retried scene is still held applies at its first frame.
  await retry.click();
  await expect(canvas).toHaveCount(1);
  await expect(root).toHaveAttribute("data-scene-state", "loading");
  await page.evaluate(() => {
    window.location.hash =
      "v=1&mode=diorama&target=0,0,0&yaw=0.5&pitch=0.6&distance=60&zoom=1&time=1234";
  });
  await setHold(page, "none");
  await expect(root).toHaveAttribute("data-scene-state", "ready", { timeout: 60000 });
  const [warmed, total] = (await scene.getAttribute("data-startup-variants"))!
    .split("/")
    .map(Number);
  expect(total).toBeGreaterThan(0);
  expect(warmed).toBe(total);
  await expect(scene).toHaveAttribute("data-time-minutes", "1234");
});
