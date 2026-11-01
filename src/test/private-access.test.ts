// @vitest-environment node
import { webcrypto } from "node:crypto";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createAccessVerifier, readPrivateRuntime } from "@/private/access.server";
import { privateRuntimeResponse } from "@/private/runtime.server";
import { createPrivateWorker } from "@/private/worker.server";
import { decodeRuntimeMode, runtimeResponse, type RuntimeMode } from "@/private/contract";

const syntheticEnv = {
  HOME3D_PRIVATE_ENABLED: "1",
  HOME3D_ACCESS_TEAM_DOMAIN: "synthetic-fixture.cloudflareaccess.com",
  HOME3D_ACCESS_AUD: "a".repeat(64),
};
const config = readPrivateRuntime(syntheticEnv)!;
const start = 2_000_000_000_000;
let pair: CryptoKeyPair;
let other: CryptoKeyPair;
let publicKey: JsonWebKey;
let otherPublic: JsonWebKey;
beforeAll(async () => {
  const algorithm = {
    name: "RSASSA-PKCS1-v1_5",
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: "SHA-256",
  };
  pair = (await webcrypto.subtle.generateKey(algorithm, true, ["sign", "verify"])) as CryptoKeyPair;
  other = (await webcrypto.subtle.generateKey(algorithm, true, [
    "sign",
    "verify",
  ])) as CryptoKeyPair;
  publicKey = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  otherPublic = await webcrypto.subtle.exportKey("jwk", other.publicKey);
});
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
async function token(
  claims: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
  signer?: CryptoKey,
) {
  const prefix = `${encode({ alg: "RS256", typ: "JWT", kid: "synthetic-key", ...header })}.${encode({ iss: config.issuer, aud: [config.audience], iat: start / 1000 - 10, exp: start / 1000 + 3600, ...claims })}`;
  const signature = await webcrypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    signer ?? pair.privateKey,
    new TextEncoder().encode(prefix),
  );
  return `${prefix}.${Buffer.from(signature).toString("base64url")}`;
}
function setup() {
  let clock = start;
  let keys = [{ ...publicKey, kid: "synthetic-key", use: "sig", alg: "RS256" }];
  const fetcher = vi.fn(async () => Response.json({ keys }));
  const verify = createAccessVerifier({ fetcher: fetcher as typeof fetch, now: () => clock });
  return {
    verify,
    fetcher,
    advance: (milliseconds: number) => {
      clock += milliseconds;
    },
    rotate: () => {
      keys = [{ ...otherPublic, kid: "synthetic-rotated", use: "sig", alg: "RS256" }];
    },
  };
}

describe("private Access runtime (ephemeral synthetic signing keys only)", () => {
  it("defaults to demo for missing, disabled, or unsafe runtime configuration", () => {
    for (const env of [
      undefined,
      {},
      { ...syntheticEnv, HOME3D_PRIVATE_ENABLED: "0" },
      { ...syntheticEnv, HOME3D_ACCESS_TEAM_DOMAIN: "synthetic.invalid/path" },
      { ...syntheticEnv, HOME3D_ACCESS_AUD: "invalid" },
    ])
      expect(readPrivateRuntime(env)).toBeNull();
    expect(readPrivateRuntime(syntheticEnv)).toEqual(config);
  });
  it("verifies a genuine RS256 signature against only the configured issuer JWKS", async () => {
    const { verify, fetcher } = setup();
    expect(await verify(await token(), syntheticEnv)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledWith(
      `${config.issuer}/cdn-cgi/access/certs`,
      expect.objectContaining({ redirect: "manual", cache: "no-store" }),
    );
    expect(await verify(await token({ aud: config.audience }), syntheticEnv)).toBe(true);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    ["wrong audience", { aud: "b".repeat(64) }],
    ["wrong issuer", { iss: "https://different-fixture.cloudflareaccess.com" }],
    ["expired", { exp: start / 1000 }],
    ["not yet valid", { nbf: start / 1000 + 1 }],
    ["future issued", { iat: start / 1000 + 1 }],
    ["missing expiry", { exp: undefined }],
  ])("rejects %s before fetching any key", async (_name, claims) => {
    const { verify, fetcher } = setup();
    expect(await verify(await token(claims as Record<string, unknown>), syntheticEnv)).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects a forged signature, unknown key, algorithm confusion, and remote-key headers", async () => {
    const { verify } = setup();
    expect(await verify(await token({}, {}, other.privateKey), syntheticEnv)).toBe(false);
    expect(await verify(await token({}, { kid: "untrusted-key" }), syntheticEnv)).toBe(false);
    for (const header of [
      { alg: "none" },
      { alg: "HS256" },
      { jku: "https://synthetic.invalid/keys" },
      { crit: ["b64"], b64: false },
    ])
      expect(await verify(await token({}, header), syntheticEnv)).toBe(false);
  });
  it("rejects malformed or oversized inputs and unsafe caller-supplied issuers without network access", async () => {
    const { verify, fetcher } = setup();
    for (const value of [null, "", "a.b.c", "a.b.c.d", "A".repeat(16385)])
      expect(await verify(value, syntheticEnv)).toBe(false);
    expect(
      await verify(await token(), {
        ...syntheticEnv,
        HOME3D_ACCESS_TEAM_DOMAIN: "synthetic.invalid",
      }),
    ).toBe(false);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("refreshes rotated keys after a bounded cache lifetime and never trusts stale keys on fetch failure", async () => {
    const { verify, fetcher, advance, rotate } = setup();
    expect(await verify(await token(), syntheticEnv)).toBe(true);
    rotate();
    const rotated = await token({}, { kid: "synthetic-rotated" }, other.privateKey);
    expect(await verify(rotated, syntheticEnv)).toBe(false);
    advance(300001);
    expect(await verify(rotated, syntheticEnv)).toBe(true);
    advance(300001);
    fetcher.mockRejectedValueOnce(Error("synthetic network failure"));
    expect(await verify(rotated, syntheticEnv)).toBe(false);
  });
  it("rejects ambiguous, oversized, and unavailable JWKS responses", async () => {
    const jwt = await token();
    const key = { ...publicKey, kid: "synthetic-key", use: "sig", alg: "RS256" };
    for (const response of [
      Response.json({ keys: [key, key] }),
      new Response(" ".repeat(65537)),
      new Response(null, { status: 503 }),
    ]) {
      const verify = createAccessVerifier({
        fetcher: (async () => response) as typeof fetch,
        now: () => start,
      });
      expect(await verify(jwt, syntheticEnv)).toBe(false);
    }
  });
  it("rechecks expiry after a delayed key response", async () => {
    let clock = start;
    const verify = createAccessVerifier({
      now: () => clock,
      fetcher: (async () => {
        clock += 2000;
        return Response.json({ keys: [{ ...publicKey, kid: "synthetic-key" }] });
      }) as typeof fetch,
    });
    expect(await verify(await token({ exp: start / 1000 + 1 }), syntheticEnv)).toBe(false);
  });
  it("returns no identity or package data and forbids caching in both modes", async () => {
    const { verify } = setup();
    const request = new Request("https://synthetic.invalid/api/private-runtime", {
      headers: { "Cf-Access-Jwt-Assertion": await token({ email: "synthetic@example.invalid" }) },
    });
    const allowed = await privateRuntimeResponse(request, syntheticEnv, verify);
    expect(await allowed.json()).toEqual({ mode: "private", packageSource: "local-file" });
    expect(allowed.headers.get("cache-control")).toBe("no-store, private");
    const denied = await privateRuntimeResponse(new Request(request.url), syntheticEnv, verify);
    expect(await denied.json()).toEqual({ mode: "demo" });
    expect(denied.headers.get("cache-control")).toBe("no-store, private");
    expect(
      (
        await privateRuntimeResponse(
          new Request(request.url, { method: "POST" }),
          syntheticEnv,
          verify,
        )
      ).status,
    ).toBe(405);
  });
  it("keeps public deployment in demo regardless of supplied private bindings", async () => {
    const { default: publicServer } = await import("../server");
    const request = new Request("https://synthetic.invalid/api/private-runtime", {
      headers: { "Cf-Access-Jwt-Assertion": await token() },
    });
    const response = await publicServer.fetch(request, syntheticEnv, {});
    expect(await response.json()).toEqual({ mode: "demo" });
    expect(response.headers.get("cache-control")).toBe("no-store, private");
  });
  it("wraps the same application and verifies the private route before returning its configuration", async () => {
    const { verify } = setup();
    const application = { fetch: vi.fn(async () => new Response("SYNTHETIC_APPLICATION")) };
    const worker = createPrivateWorker(application, (request, env) =>
      privateRuntimeResponse(request, env, verify),
    );
    const allowed = await worker.fetch(
      new Request("https://synthetic.invalid/api/private-runtime", {
        headers: { "Cf-Access-Jwt-Assertion": await token() },
      }),
      syntheticEnv,
      {},
    );
    expect(await allowed.json()).toEqual({ mode: "private", packageSource: "local-file" });
    expect(application.fetch).not.toHaveBeenCalled();
    const denied = await worker.fetch(
      new Request("https://synthetic.invalid/api/private-runtime"),
      syntheticEnv,
      {},
    );
    expect(await denied.json()).toEqual({ mode: "demo" });
    const shell = await worker.fetch(new Request("https://synthetic.invalid/"), syntheticEnv, {});
    expect(await shell.text()).toBe("SYNTHETIC_APPLICATION");
    expect(application.fetch).toHaveBeenCalledTimes(1);
  });
  it("drops unexpected response fields and remains neutral when verification throws", async () => {
    for (const value of [
      null,
      [],
      "private",
      { mode: "private" },
      { mode: "private", packageSource: "remote" },
    ])
      expect(decodeRuntimeMode(value)).toEqual({ mode: "demo" });
    const extended = {
      mode: "private",
      packageSource: "local-file",
      identity: "SYNTHETIC_PRIVATE_SENTINEL",
      origin: [0, 0],
    };
    const response = runtimeResponse(extended as RuntimeMode, "GET");
    expect(await response.json()).toEqual({ mode: "private", packageSource: "local-file" });
    const failed = await privateRuntimeResponse(
      new Request("https://synthetic.invalid/api/private-runtime"),
      syntheticEnv,
      async () => {
        throw Error("SYNTHETIC_PRIVATE_SENTINEL");
      },
    );
    expect(await failed.json()).toEqual({ mode: "demo" });
  });
});

it("rejects a redirecting JWKS endpoint without following it", async () => {
  const fetcher = vi.fn(
    async () =>
      new Response(null, {
        status: 302,
        headers: { location: "https://synthetic.invalid/untrusted-keys" },
      }),
  );
  const verify = createAccessVerifier({ fetcher: fetcher as typeof fetch, now: () => start });
  expect(await verify(await token(), syntheticEnv)).toBe(false);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(
    `${config.issuer}/cdn-cgi/access/certs`,
    expect.objectContaining({ redirect: "manual" }),
  );
});
it("handles runtime verification before assets and serves only the same public asset binding", async () => {
  const assets = { fetch: vi.fn(async () => new Response("SYNTHETIC_STATIC")) };
  const application = { fetch: vi.fn(async () => new Response("SYNTHETIC_SSR")) };
  const verify = vi.fn(async () => new Response("SYNTHETIC_RUNTIME"));
  const worker = createPrivateWorker(application, verify);
  expect(
    await (
      await worker.fetch(
        new Request("https://synthetic.invalid/api/private-runtime"),
        { ASSETS: assets },
        {},
      )
    ).text(),
  ).toBe("SYNTHETIC_RUNTIME");
  expect(assets.fetch).not.toHaveBeenCalled();
  expect(
    await (
      await worker.fetch(new Request("https://synthetic.invalid/sw.js"), { ASSETS: assets }, {})
    ).text(),
  ).toBe("SYNTHETIC_STATIC");
  expect(application.fetch).not.toHaveBeenCalled();
  assets.fetch.mockResolvedValueOnce(new Response(null, { status: 404 }));
  expect(
    await (
      await worker.fetch(new Request("https://synthetic.invalid/"), { ASSETS: assets }, {})
    ).text(),
  ).toBe("SYNTHETIC_SSR");
});
