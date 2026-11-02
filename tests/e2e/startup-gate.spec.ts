import { expect, test, type Page } from "@playwright/test";

type ShaderHold = { holdFrom: number; created: () => number; native: () => boolean | null };

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
  let nativeExtension: boolean | null = null;
  const hold: ShaderHold = { holdFrom: 0, created: () => count, native: () => nativeExtension };
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
    nativeExtension ??= extension !== null;
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

/** What a pointer at the canvas centre and at the dock's noon preset would hit. */
const pointerTargets = (page: Page) =>
  page.evaluate(() => {
    const noon = [...document.querySelectorAll("button")].find((button) =>
      /12:00/.test(button.textContent ?? ""),
    );
    return [document.querySelector("#scene-root canvas"), noon].map((target) => {
      if (!target) return "missing";
      const box = target.getBoundingClientRect();
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
      if (hit && target.contains(hit)) return "itself";
      if (hit?.closest('[role="status"]')?.querySelector('[role="progressbar"]')) return "splash";
      return "other";
    });
  });

/** Whether a script can focus the dock's noon preset; inert content cannot take focus. */
const noonTakesFocus = (page: Page) =>
  page.evaluate(() => {
    const noon = [...document.querySelectorAll("button")].find((button) =>
      /12:00/.test(button.textContent ?? ""),
    );
    if (!noon) return "missing";
    noon.focus();
    const focused = document.activeElement === noon;
    noon.blur();
    return focused;
  });

/** Whether a few Tab presses from the top of the page land inside the app shell. */
async function tabReachesShell(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  for (let press = 0; press < 4; press++) {
    await page.keyboard.press("Tab");
    const inShell = await page.evaluate(
      () => document.querySelector("main")?.contains(document.activeElement) ?? false,
    );
    if (inShell) return true;
  }
  return false;
}

test("startup keeps input closed until every shader variant settles, across context loss and retry", async ({
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
  expect(await pointerTargets(page)).toEqual(["splash", "splash"]);
  await test.info().attach("parallel-shader-compile", {
    contentType: "application/json",
    body: JSON.stringify({
      nativeExtension: await page.evaluate(() =>
        (window as unknown as { __shaderHold: ShaderHold }).__shaderHold.native(),
      ),
    }),
  });
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
  // The recovered startup is still held: the splash is back over the canvas and the dock,
  // past its own 250 ms exit.
  await page.waitForTimeout(400);
  await expect(root).toHaveAttribute("data-scene-state", "loading");
  await expect(splash).toBeVisible();
  expect(await pointerTargets(page)).toEqual(["splash", "splash"]);
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
  await page.waitForTimeout(400);
  await expect(root).toHaveAttribute("data-scene-state", "loading");
  await expect(splash).toBeVisible();
  expect(await pointerTargets(page)).toEqual(["splash", "splash"]);
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
  await expect(splash).toHaveCount(0);
  expect(await pointerTargets(page)).toEqual(["itself", "itself"]);
});

test("an interactive scene that loses its context is covered again until recovery settles", async ({
  page,
}) => {
  await page.addInitScript(holdShaderPrograms);
  await page.goto("/");
  const root = page.locator("#scene-root");
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

  // The held first startup is closed to the keyboard as well as the pointer.
  await expect(root).toHaveAttribute("data-scene-state", "loading");
  await expect(splash).toBeVisible();
  expect(await pointerTargets(page)).toEqual(["splash", "splash"]);
  expect(await tabReachesShell(page)).toBe(false);
  expect(await noonTakesFocus(page)).toBe(false);

  await setHold(page, "none");
  await expect(root).toHaveAttribute("data-scene-state", "ready", { timeout: 60000 });
  await expect(splash).toHaveCount(0);
  expect(await pointerTargets(page)).toEqual(["itself", "itself"]);
  expect(await noonTakesFocus(page)).toBe(true);

  // Lose the interactive scene's context and hold the programs of its automatic recovery.
  await setHold(page, "existing");
  await canvas.evaluate((element: HTMLCanvasElement) => {
    element.dataset["lostCanvas"] = "after-ready";
    element.getContext("webgl2")!.getExtension("WEBGL_lose_context")!.loseContext();
  });
  await expect(root).toHaveAttribute("data-recovery-attempts", "1");
  await expect(root.locator("canvas:not([data-lost-canvas])")).toHaveCount(1);
  await expect(root).toHaveAttribute("data-scene-state", "loading");
  // Well past the splash's own 250 ms exit, it covers the recovered startup again.
  await page.waitForTimeout(400);
  await expect(root).toHaveAttribute("data-scene-state", "loading");
  await expect(splash).toBeVisible();
  expect(await pointerTargets(page)).toEqual(["splash", "splash"]);
  expect(await noonTakesFocus(page)).toBe(false);

  await setHold(page, "none");
  await expect(root).toHaveAttribute("data-scene-state", "ready", { timeout: 60000 });
  await expect(splash).toHaveCount(0);
  expect(await pointerTargets(page)).toEqual(["itself", "itself"]);
  expect(await noonTakesFocus(page)).toBe(true);
});

type StartupState = { state: string | null; variants: string | null; splash: boolean };

// Without KHR_parallel_shader_compile there is no link status to poll: programs link on first
// use. Records every startup state change so the order can be checked after the fact.
function hideParallelCompile() {
  const proto = WebGL2RenderingContext.prototype;
  const { getExtension } = proto;
  proto.getExtension = function (this: WebGL2RenderingContext, name: string) {
    return name === "KHR_parallel_shader_compile" ? null : getExtension.call(this, name);
  } as unknown as typeof proto.getExtension;
  const states: StartupState[] = [];
  (window as unknown as { __startupStates: StartupState[] }).__startupStates = states;
  new MutationObserver(() => {
    const row: StartupState = {
      state: document.querySelector("#scene-root")?.getAttribute("data-scene-state") ?? null,
      variants:
        document
          .querySelector('[data-testid="demo-scene"]')
          ?.getAttribute("data-startup-variants") ?? null,
      splash: document.querySelector('[role="progressbar"]') !== null,
    };
    const last = states.at(-1);
    if (last?.state !== row.state || last.variants !== row.variants || last.splash !== row.splash)
      states.push(row);
  }).observe(document, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ["data-scene-state", "data-startup-variants"],
  });
}

test("without parallel shader compile, input still opens only after every variant", async ({
  page,
}) => {
  await page.addInitScript(hideParallelCompile);
  await page.goto("/");
  const root = page.locator("#scene-root");
  await expect(root).toHaveAttribute("data-scene-state", /ready|fallback/, { timeout: 60000 });
  const ready = (await root.getAttribute("data-scene-state")) === "ready";
  if (process.env["REQUIRE_WEBGL2"] === "1") expect(ready).toBe(true);
  test.skip(!ready, "This browser has no WebGL2; there is no shader startup.");
  expect(
    await root
      .locator("canvas")
      .evaluate((element: HTMLCanvasElement) =>
        element.getContext("webgl2")!.getExtension("KHR_parallel_shader_compile"),
      ),
  ).toBeNull();
  const states = await page.evaluate(
    () => (window as unknown as { __startupStates: StartupState[] }).__startupStates,
  );
  // Attach before asserting so a failing run still shows the order.
  await test.info().attach("startup-states", {
    contentType: "application/json",
    body: JSON.stringify(states),
  });
  const firstReady = states.findIndex((row) => row.state === "ready");
  expect(firstReady).toBeGreaterThan(0);
  const [warmed, total] = (states[firstReady]!.variants ?? "0/0").split("/").map(Number);
  expect(total).toBeGreaterThan(0);
  expect(warmed).toBe(total);
  const loading = states.slice(0, firstReady).filter((row) => row.state === "loading");
  expect(loading.length).toBeGreaterThan(0);
  expect(loading.every((row) => row.splash)).toBe(true);
});
