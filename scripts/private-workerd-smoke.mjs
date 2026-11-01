import assert from "node:assert/strict";
import { generateKeyPairSync, sign, createHash } from "node:crypto";
import { readFile, stat, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
const qaRoot = process.env.HOME3D_QA_TOOLS;
if (!qaRoot) throw Error("HOME3D_QA_TOOLS_REQUIRED");
const qaRequire = createRequire(path.join(qaRoot, "package.json"));
const { Miniflare, convertV4MiniflareOptions, Log, LogLevel } = qaRequire("miniflare");
const { Response } = qaRequire("undici");
const repo = process.argv[2],
  bundle = process.argv[3],
  output = process.argv[4];
if (!repo || !bundle || !output) throw Error("EXPLICIT_QA_PATHS_REQUIRED");
const source = await readFile(bundle, "utf8");
assert(source.includes("HOME3D_PRIVATE_ENABLED"));
const publicRoot = path.resolve(repo, ".output/public");
const env = {
  HOME3D_PRIVATE_ENABLED: "1",
  HOME3D_ACCESS_TEAM_DOMAIN: "synthetic-fixture.cloudflareaccess.com",
  HOME3D_ACCESS_AUD: "a".repeat(64),
};
const pair = generateKeyPairSync("rsa", { modulusLength: 2048 });
const publicKey = {
  ...pair.publicKey.export({ format: "jwk" }),
  kid: "ephemeral-workerd-key",
  use: "sig",
  alg: "RS256",
};
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const token = (overrides = {}) => {
  const data =
    encode({ alg: "RS256", kid: publicKey.kid, typ: "JWT" }) +
    "." +
    encode({
      iss: `https://${env.HOME3D_ACCESS_TEAM_DOMAIN}`,
      aud: [env.HOME3D_ACCESS_AUD],
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
      email: "SYNTHETIC_PRIVATE_SENTINEL@example.invalid",
      ...overrides,
    });
  return data + "." + sign("RSA-SHA256", Buffer.from(data), pair.privateKey).toString("base64url");
};
let jwksRequests = 0,
  unexpectedOutbound = 0;
const options = convertV4MiniflareOptions({
  host: "127.0.0.1",
  port: 0,
  cf: false,
  log: new Log(LogLevel.ERROR),
  name: "home3d-private-local-qa",
  modules: true,
  // QA bundles live outside the checkout; module names must not traverse above the Worker root.
  modulesRoot: path.dirname(path.resolve(bundle)),
  scriptPath: bundle,
  compatibilityDate: "2026-06-01",
  compatibilityFlags: ["nodejs_compat"],
  bindings: env,
  serviceBindings: {
    ASSETS: async (request) => {
      const filename = path.resolve(
          publicRoot,
          `.${decodeURIComponent(new URL(request.url).pathname)}`,
        ),
        relative = path.relative(publicRoot, filename);
      if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative))
        return new Response(null, { status: 404 });
      if (!(await stat(filename).catch(() => null))?.isFile())
        return new Response(null, { status: 404 });
      return new Response(await readFile(filename));
    },
  },
  outboundService: async (request) => {
    if (request.url !== `https://${env.HOME3D_ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`) {
      unexpectedOutbound++;
      throw Error("UNEXPECTED_OUTBOUND_DENIED");
    }
    jwksRequests++;
    return Response.json({ keys: [publicKey] });
  },
});
const mf = new Miniflare(options);
const checks = [];
try {
  const query = async (jwt) => {
    const response = await mf.dispatchFetch("https://synthetic.invalid/api/private-runtime", {
      headers: jwt ? { "Cf-Access-Jwt-Assertion": jwt } : {},
    });
    assert.equal(response.headers.get("cache-control"), "no-store, private");
    return response.json();
  };
  for (const invalid of [
    undefined,
    "invalid",
    token({ aud: "b".repeat(64) }),
    token({ iss: "https://wrong-fixture.cloudflareaccess.com" }),
    token({ exp: Math.floor(Date.now() / 1000) - 1 }),
  ])
    assert.deepEqual(await query(invalid), { mode: "demo" });
  checks.push("missing/malformed/wrong-audience/wrong-issuer/expired return neutral demo");
  const valid = token();
  assert.deepEqual(await query(valid), { mode: "private", packageSource: "local-file" });
  checks.push("native Workerd verifies genuine ephemeral RS256 through locally intercepted JWKS");
  const mutated = valid.slice(0, -8) + "AAAAAAAA";
  assert.deepEqual(await query(mutated), { mode: "demo" });
  checks.push("modified signature denied");
  const html = await (
    await mf.dispatchFetch("https://synthetic.invalid/", {
      headers: { "Cf-Access-Jwt-Assertion": valid },
    })
  ).text();
  assert(!html.includes(valid));
  assert(!html.includes("SYNTHETIC_PRIVATE_SENTINEL"));
  assert(html.includes("Phố Nhà Mình"));
  checks.push("same built application SSR excludes token and identity");
  assert.equal(unexpectedOutbound, 0);
  assert.equal(jwksRequests, 1);
  await mkdir(output, { recursive: true });
  await writeFile(
    path.join(output, "workerd-smoke.json"),
    JSON.stringify(
      {
        status: "PASS",
        syntheticOnly: true,
        runtime: "workerd 1.20261019.1 via Miniflare5.20261019.1-beta",
        bundleSha256: createHash("sha256").update(source).digest("hex"),
        jwksRequestsInterceptedLocally: jwksRequests,
        unexpectedOutboundDenied: unexpectedOutbound,
        externalPlatformAccess: "NONE",
        checks,
        limitations: [
          "Ephemeral synthetic keys and mocked JWKS transport; no real Access login or deployment.",
          "ASSETS binding uses a local file-backed service; actual hosted Access policies are not tested.",
        ],
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ status: "PASS", checks: checks.length, jwksRequests }));
} catch (error) {
  console.log(JSON.stringify({ syntheticDiagnostic: true, jwksRequests, unexpectedOutbound }));
  throw error;
} finally {
  await mf.dispose();
}
