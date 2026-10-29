import { z } from "zod";
import { createLocalJWKSet, decodeJwt, decodeProtectedHeader, jwtVerify } from "jose";

const RuntimeSchema = z.object({
  HOME3D_PRIVATE_ENABLED: z.literal("1"),
  HOME3D_ACCESS_TEAM_DOMAIN: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.cloudflareaccess\.com$/),
  HOME3D_ACCESS_AUD: z.string().regex(/^[a-f0-9]{64}$/),
});
export function readPrivateRuntime(env: unknown) {
  const result = RuntimeSchema.safeParse(env);
  return result.success
    ? {
        issuer: `https://${result.data.HOME3D_ACCESS_TEAM_DOMAIN}`,
        audience: result.data.HOME3D_ACCESS_AUD,
      }
    : null;
}
export type PrivateRuntime = NonNullable<ReturnType<typeof readPrivateRuntime>>;

const base64url = /^[A-Za-z0-9_-]+$/;
const HeaderSchema = z
  .object({
    alg: z.literal("RS256"),
    kid: z.string().min(1).max(128).regex(base64url),
    typ: z.literal("JWT").optional(),
  })
  .strict();
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const ClaimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string()).min(1).max(16)]),
  exp: timestamp,
  nbf: timestamp.optional(),
  iat: timestamp.optional(),
});
const KeySchema = z.object({
  kty: z.literal("RSA"),
  kid: z.string().min(1).max(128).regex(base64url),
  alg: z.literal("RS256").optional(),
  use: z.literal("sig").optional(),
  key_ops: z.array(z.literal("verify")).min(1).max(1).optional(),
  n: z.string().min(342).max(683).regex(base64url),
  e: z.string().min(1).max(16).regex(base64url),
});
const KeysSchema = z.object({ keys: z.array(KeySchema).min(1).max(8) });
function validTimes(claims: z.infer<typeof ClaimsSchema>, now: number) {
  return (
    claims.exp > now &&
    (claims.nbf === undefined || claims.nbf <= now) &&
    (claims.iat === undefined || (claims.iat <= now && claims.iat < claims.exp))
  );
}

export function createAccessVerifier(options: { fetcher?: typeof fetch; now?: () => number } = {}) {
  const fetcher = options.fetcher ?? fetch;
  const now = options.now ?? Date.now;
  let cached:
    { issuer: string; expires: number; keys: ReturnType<typeof createLocalJWKSet> } | undefined;
  let pending:
    { issuer: string; promise: Promise<ReturnType<typeof createLocalJWKSet>> } | undefined;
  async function download(issuer: string): Promise<ReturnType<typeof createLocalJWKSet>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try {
      const response = await fetcher(`${issuer}/cdn-cgi/access/certs`, {
        redirect: "manual",
        signal: controller.signal,
        cache: "no-store",
      });
      if (!response.ok || !response.body) throw Error("KEYS_UNAVAILABLE");
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let length = 0;
      try {
        while (true) {
          const chunk = await reader.read();
          if (chunk.done) break;
          length += chunk.value.byteLength;
          if (length > 65536) throw Error("KEYS_TOO_LARGE");
          chunks.push(chunk.value);
        }
      } finally {
        await reader.cancel().catch(() => {});
      }
      const bytes = new Uint8Array(length);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      const { keys } = KeysSchema.parse(
        JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)),
      );
      if (new Set(keys.map((key) => key.kid)).size !== keys.length) throw Error("AMBIGUOUS_KEY_ID");
      const resolver = createLocalJWKSet({
        keys: keys.map((key) => ({
          kty: "RSA",
          kid: key.kid,
          n: key.n,
          e: key.e,
          alg: "RS256",
          use: "sig",
          key_ops: ["verify"],
        })),
      });
      cached = { issuer, expires: now() + 300000, keys: resolver };
      return resolver;
    } finally {
      clearTimeout(timer);
    }
  }
  async function keysFor(issuer: string) {
    if (cached?.issuer === issuer && cached.expires > now()) return cached.keys;
    if (pending?.issuer === issuer) return pending.promise;
    const request = { issuer, promise: download(issuer) };
    pending = request;
    try {
      return await request.promise;
    } finally {
      if (pending === request) pending = undefined;
    }
  }
  return async (token: string | null, env: unknown): Promise<boolean> => {
    if (!token || token.length > 16384) return false;
    try {
      const config = readPrivateRuntime(env);
      if (!config) return false;
      const parts = token.split(".");
      if (parts.length !== 3 || parts[0]!.length > 2048) return false;
      HeaderSchema.parse(decodeProtectedHeader(token));
      const claims = ClaimsSchema.parse(decodeJwt(token));
      const audiences = typeof claims.aud === "string" ? [claims.aud] : claims.aud;
      if (
        claims.iss !== config.issuer ||
        !audiences.includes(config.audience) ||
        !validTimes(claims, Math.floor(now() / 1000))
      )
        return false;
      const { payload } = await jwtVerify(token, await keysFor(config.issuer), {
        algorithms: ["RS256"],
        issuer: config.issuer,
        audience: config.audience,
        currentDate: new Date(now()),
        clockTolerance: 0,
        requiredClaims: ["iss", "aud", "exp"],
      });
      return validTimes(ClaimsSchema.parse(payload), Math.floor(now() / 1000));
    } catch {
      return false;
    }
  };
}
