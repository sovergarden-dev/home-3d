export const PRIVATE_RUNTIME_PATH = "/api/private-runtime";
export type RuntimeMode = { mode: "demo" } | { mode: "private"; packageSource: "local-file" };
export const DEMO_RUNTIME: RuntimeMode = Object.freeze({ mode: "demo" });
export const PRIVATE_LOCAL_RUNTIME: RuntimeMode = Object.freeze({
  mode: "private",
  packageSource: "local-file",
});

export function decodeRuntimeMode(value: unknown): RuntimeMode {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    "mode" in value &&
    value.mode === "private" &&
    "packageSource" in value &&
    value.packageSource === "local-file"
  )
    return PRIVATE_LOCAL_RUNTIME;
  return DEMO_RUNTIME;
}

export function runtimeResponse(mode: RuntimeMode, method: string) {
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store, private",
    "x-content-type-options": "nosniff",
    vary: "Cf-Access-Jwt-Assertion",
  };
  if (method !== "GET")
    return new Response(null, { status: 405, headers: { ...headers, allow: "GET" } });
  return new Response(JSON.stringify(decodeRuntimeMode(mode)), { headers });
}
