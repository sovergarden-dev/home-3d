import { chromium, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";
import application from "../.output/server/index.mjs";
import { createPrivateWorker } from "../src/private/worker.server";
import { createAccessVerifier } from "../src/private/access.server";
import { privateRuntimeResponse } from "../src/private/runtime.server";

const output = resolve(process.env["PRIVATE_SMOKE_OUTPUT"] ?? "test-results/private-production");
const assets = resolve(".output/public");
const syntheticEnv = {
  HOME3D_PRIVATE_ENABLED: "1",
  HOME3D_ACCESS_TEAM_DOMAIN: "synthetic-fixture.cloudflareaccess.com",
  HOME3D_ACCESS_AUD: "a".repeat(64),
};
const keys = await crypto.subtle.generateKey(
  {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  },
  true,
  ["sign", "verify"],
);
const publicKey = await crypto.subtle.exportKey("jwk", keys.publicKey);
let keyRequests = 0;
const verify = createAccessVerifier({
  fetcher: (async (url) => {
    expect(String(url)).toBe(
      `https://${syntheticEnv.HOME3D_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`,
    );
    keyRequests++;
    return Response.json({
      keys: [{ ...publicKey, kid: "synthetic-smoke-key", use: "sig", alg: "RS256" }],
    });
  }) as typeof fetch,
});
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
const header = encode({ alg: "RS256", kid: "synthetic-smoke-key", typ: "JWT" });
const body = encode({
  iss: `https://${syntheticEnv.HOME3D_ACCESS_TEAM_DOMAIN}`,
  aud: [syntheticEnv.HOME3D_ACCESS_AUD],
  exp: Math.floor(Date.now() / 1000) + 300,
  iat: Math.floor(Date.now() / 1000),
  email: "SYNTHETIC_PRIVATE_SENTINEL@example.invalid",
});
const signed = `${header}.${body}`;
const signature = await crypto.subtle.sign(
  "RSASSA-PKCS1-v1_5",
  keys.privateKey,
  new TextEncoder().encode(signed),
);
const token = `${signed}.${Buffer.from(signature).toString("base64url")}`;
const worker = createPrivateWorker(application, (request, env) =>
  privateRuntimeResponse(request, env, verify),
);
const binding = {
  async fetch(request: Request) {
    const file = resolve(assets, `.${decodeURIComponent(new URL(request.url).pathname)}`);
    const inside = relative(assets, file);
    if (inside === ".." || inside.startsWith(`..${sep}`) || inside.startsWith(sep))
      return new Response(null, { status: 404 });
    const data = Bun.file(file);
    return (await data.exists()) ? new Response(data) : new Response(null, { status: 404 });
  },
};
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: 4195,
  fetch: (request) =>
    worker.fetch(
      request,
      { ...syntheticEnv, ASSETS: binding },
      { waitUntil: (promise: Promise<unknown>) => void promise.catch(() => {}) },
    ),
});
const url = "http://127.0.0.1:4195";
let browser;
try {
  await mkdir(output, { recursive: true });
  for (const value of [undefined, "synthetic-invalid"]) {
    const response = await fetch(`${url}/api/private-runtime`, {
      headers: value ? { "Cf-Access-Jwt-Assertion": value } : {},
    });
    expect(await response.json()).toEqual({ mode: "demo" });
    expect(response.headers.get("cache-control")).toBe("no-store, private");
  }
  const response = await fetch(`${url}/api/private-runtime`, {
    headers: { "Cf-Access-Jwt-Assertion": token },
  });
  expect(await response.json()).toEqual({ mode: "private", packageSource: "local-file" });
  const html = await (await fetch(url, { headers: { "Cf-Access-Jwt-Assertion": token } })).text();
  expect(html.includes(token)).toBe(false);
  expect(html.includes("SYNTHETIC_PRIVATE_SENTINEL")).toBe(false);
  expect(html.includes(syntheticEnv.HOME3D_ACCESS_AUD)).toBe(false);
  browser = await chromium.launch({ args: ["--enable-unsafe-swiftshader"] });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    extraHTTPHeaders: { "Cf-Access-Jwt-Assertion": token },
  });
  const external = new Set<string>();
  await context.route("**/*", (route) => {
    const address = new URL(route.request().url());
    if (address.origin === url || ["blob:", "data:"].includes(address.protocol))
      return route.continue();
    external.add(address.hostname);
    return route.abort();
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", () => errors.push("PAGE_ERROR"));
  await page.goto(url);
  await expect(page.getByText("Truy cập riêng tư đã xác minh", { exact: true })).toBeVisible({
    timeout: 30000,
  });
  await expect(page.getByText("DEMO · Phố hư cấu", { exact: true })).toBeVisible();
  const buildInfo = await page.getByTestId("build-info").innerText();
  const sourceSha = buildInfo.match(/\b[a-f0-9]{40}\b/i)?.[0];
  expect(sourceSha).toMatch(/^[a-f0-9]{40}$/);
  expect(external.size).toBe(0);
  expect(errors).toEqual([]);
  const cacheURLs = await page.evaluate(async () => {
    const entries: string[] = [];
    for (const name of await caches.keys())
      for (const request of await (await caches.open(name)).keys())
        entries.push(new URL(request.url).pathname);
    return entries;
  });
  expect(cacheURLs.includes("/api/private-runtime")).toBe(false);
  await page.screenshot({ path: resolve(output, "private-access-synthetic.png") });
  await writeFile(
    resolve(output, "private-smoke.json"),
    JSON.stringify(
      {
        syntheticOnly: true,
        sourceSha,
        status: "PASS",
        runtime: "BUN_LOCAL_WORKER_HARNESS",
        deployed: false,
        jwksSource: "in-memory synthetic key only",
        keyRequests,
        anonymousMode: "demo",
        invalidMode: "demo",
        validMode: "private-local-file",
        ssrIdentityLeak: false,
        externalHosts: [...external],
        runtimeEndpointCached: false,
        errors,
        limitation:
          "This exercises the built Worker and real signature verification locally. It does not certify a live Cloudflare account or Access policy.",
      },
      null,
      2,
    ) + "\n",
  );
  console.log("Private Worker production smoke PASS (synthetic/local only).");
} finally {
  await browser?.close();
  await server.stop(true);
}
