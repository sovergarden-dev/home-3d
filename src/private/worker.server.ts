import { PRIVATE_RUNTIME_PATH } from "./contract";
import { privateRuntimeResponse } from "./runtime.server";

export interface BuiltApplication {
  fetch(request: Request, env: unknown, context: unknown): Response | Promise<Response>;
}
export function createPrivateWorker(
  application: BuiltApplication,
  respond: (request: Request, env: unknown) => Promise<Response> = privateRuntimeResponse,
) {
  return {
    async fetch(request: Request, env: unknown, context: unknown) {
      if (new URL(request.url).pathname === PRIVATE_RUNTIME_PATH) return respond(request, env);
      // Cloudflare Access protects the hostname. These are public build assets only;
      // the runtime endpoint above is always verified before any asset lookup.
      if (
        (request.method === "GET" || request.method === "HEAD") &&
        env &&
        typeof env === "object" &&
        "ASSETS" in env
      ) {
        const assets = (env as { ASSETS?: { fetch(request: Request): Promise<Response> } }).ASSETS;
        if (assets && typeof assets.fetch === "function") {
          const response = await assets.fetch(request);
          if (response.status !== 404) return response;
        }
      }
      return application.fetch(request, env, context);
    },
  };
}
