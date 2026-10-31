// Local QA adapter for the built Cloudflare module. No deploy or account access.
import { resolve, relative, sep } from "node:path";
import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import worker from "../.output/server/index.mjs";
const root = resolve(".output/public");
const port = Number(process.env.PRODUCTION_QA_PORT ?? 4193);
let revision = 0;
let failInstall = false;
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
      if (failInstall) text = text.replace(/("sha256":")[a-f0-9]{64}/, `$1${"0".repeat(64)}`);
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
function acceptsGzip(value) {
  const offers = new Map();
  for (const item of (value ?? "").split(",")) {
    const [rawName, ...parameters] = item.trim().toLowerCase().split(";");
    const quality = parameters
      .map((p) => p.trim())
      .find((p) => p.startsWith("q="))
      ?.slice(2);
    const q =
      quality === undefined
        ? 1
        : /^(?:0(?:\.\d{0,3})?|1(?:\.0{0,3})?)$/.test(quality)
          ? Number(quality)
          : 0;
    offers.set(rawName.trim(), q);
  }
  const gzip = offers.get("gzip") ?? offers.get("*") ?? 0;
  return gzip > 0 && gzip >= (offers.get("identity") ?? 0);
}
async function transport(response, request) {
  if (
    process.env.PRODUCTION_QA_COMPRESSION !== "gzip" ||
    response.status !== 200 ||
    !acceptsGzip(request.headers.get("accept-encoding")) ||
    !/^(text\/(html|css|javascript)|application\/javascript)/.test(
      response.headers.get("content-type") ?? "",
    ) ||
    response.headers.has("content-encoding")
  )
    return response;
  const headers = new Headers(response.headers);
  headers.set("Content-Encoding", "gzip");
  headers.set("Vary", "Accept-Encoding");
  headers.delete("Content-Length");
  return new Response(gzipSync(new Uint8Array(await response.arrayBuffer()), { level: 6 }), {
    status: response.status,
    headers,
  });
}
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
      const selected = new URL(request.url).searchParams.get("revision");
      if (selected !== null && !/^\d{1,3}$/.test(selected))
        return new Response(null, { status: 400 });
      revision = selected === null ? revision + 1 : Number(selected);
      failInstall = new URL(request.url).searchParams.get("fail") === "1";
      return new Response("OK");
    }
    const asset = await assets.fetch(request);
    if (asset.status !== 404) return transport(asset, request);
    return transport(
      await worker.fetch(
        request,
        { ASSETS: assets },
        {
          waitUntil(p) {
            void p.catch(() => {});
          },
        },
      ),
      request,
    );
  },
});
console.log(`HOME3D_PRODUCTION_QA_READY ${port}`);
