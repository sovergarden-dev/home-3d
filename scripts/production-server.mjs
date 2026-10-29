// Local QA adapter for the built Cloudflare module. No deploy or account access.
import { resolve, relative, sep } from "node:path";
import { readFile, stat } from "node:fs/promises";
import worker from "../.output/server/index.mjs";
const root = resolve(".output/public");
const port = Number(process.env.PRODUCTION_QA_PORT ?? 4193);
let revision = 0;
const assets = {
  async fetch(request) {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url).pathname);
    } catch {
      return new Response(null, { status: 400 });
    }
    const filePath = resolve(root, `.${pathname}`),
      rel = relative(root, filePath);
    if (rel === ".." || rel.startsWith(`..${sep}`)) return new Response(null, { status: 404 });
    const file = Bun.file(filePath);
    if (!(await stat(filePath).catch(() => null))?.isFile())
      return new Response(null, { status: 404 });
    if (pathname === "/sw.js") {
      let text = await readFile(filePath, "utf8");
      if (revision) text = text.replace(/(const CACHE_NAME="[^"]+)(")/, `$1-qa${revision}$2`);
      return new Response(text, {
        headers: {
          "Content-Type": "application/javascript",
          "Cache-Control": "no-store",
          "Service-Worker-Allowed": "/",
        },
      });
    }
    return new Response(file, {
      headers: {
        "Cache-Control": pathname.startsWith("/assets/")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      },
    });
  },
};
Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const pathname = new URL(request.url).pathname;
    if (process.env.PRODUCTION_QA_UPDATE === "1" && pathname === "/__qa__/iframe")
      return new Response(
        '<html lang="vi"><title>Home 3D iframe fixture</title><iframe src="/gioi-thieu" title="Synthetic preview"></iframe></html>',
        { headers: { "Content-Type": "text/html" } },
      );
    if (
      process.env.PRODUCTION_QA_UPDATE === "1" &&
      pathname === "/__qa__/update" &&
      request.method === "POST"
    ) {
      revision++;
      return new Response("OK");
    }
    const asset = await assets.fetch(request);
    if (asset.status !== 404) return asset;
    return worker.fetch(
      request,
      { ASSETS: assets },
      {
        waitUntil(p) {
          void p.catch(() => {});
        },
      },
    );
  },
});
console.log(`HOME3D_PRODUCTION_QA_READY ${port}`);
