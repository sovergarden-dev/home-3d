import { createAccessVerifier } from "./access.server";
import { DEMO_RUNTIME, PRIVATE_LOCAL_RUNTIME, runtimeResponse } from "./contract";

const verify = createAccessVerifier();
export async function privateRuntimeResponse(request: Request, env: unknown, verifier = verify) {
  if (request.method !== "GET") return runtimeResponse(DEMO_RUNTIME, request.method);
  try {
    const allowed = await verifier(request.headers.get("Cf-Access-Jwt-Assertion"), env);
    // The package and its georeference remain explicit local files, never server configuration.
    return runtimeResponse(allowed ? PRIVATE_LOCAL_RUNTIME : DEMO_RUNTIME, request.method);
  } catch {
    return runtimeResponse(DEMO_RUNTIME, request.method);
  }
}
