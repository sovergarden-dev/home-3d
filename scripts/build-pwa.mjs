import { createHash } from "node:crypto";
import { readFile, writeFile, readdir, rename, rm, rmdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readBuildOutput } from "../build/output.mjs";

const output = await readBuildOutput();
const root = output.root;
const exists = (file) =>
  stat(file).then(
    () => true,
    () => false,
  );
// Vite's internal manifest may include absolute build paths; it is tooling input, not a public
// asset. Only check it here: it moves next to the server entry in the write phase below, so a
// stop at any check leaves `.vite` as the build left it.
const viteDirectory = path.join(root, ".vite");
const internalManifest = path.join(viteDirectory, "manifest.json");
const privateManifest = path.join(path.dirname(output.serverEntry), "client-manifest.json");
// Never publish other Vite internals; an unexpected file stops the build instead of shipping it.
if (
  (await exists(viteDirectory)) &&
  (await readdir(viteDirectory)).some((file) => file !== "manifest.json")
)
  throw Error("UNEXPECTED_PUBLIC_VITE_FILES");
const moveInternalManifest = await exists(internalManifest);
if (!moveInternalManifest && !(await exists(privateManifest)))
  throw Error("VITE_CLIENT_MANIFEST_REQUIRED");
const { default: application } = await import(pathToFileURL(output.serverEntry).href);
if (typeof application?.fetch !== "function") throw Error("BUILT_FETCH_APPLICATION_REQUIRED");
// Render only the public initial shell from the same built app, without starting a server.
// Shells stay in memory: only the hashed copies that `sw.js` references are written.
const rendered = [];
for (const [route, name] of [
  ["/", "offline-home"],
  ["/gioi-thieu", "offline-about"],
]) {
  const request = new Request(`https://home3d-build.invalid${route}`);
  Object.defineProperty(request, "ip", { value: undefined, writable: true, configurable: true });
  const response = await application.fetch(
    request,
    {},
    {
      waitUntil(promise) {
        void promise.catch(() => {});
      },
    },
  );
  if (response.status !== 200 || !response.headers.get("content-type")?.includes("text/html"))
    throw Error("PUBLIC_SHELL_RENDER_FAILED");
  const html = await response.text();
  if (
    !html.includes("<html") ||
    !html.includes("/assets/") ||
    html.includes("SYNTHETIC_PRIVATE_SENTINEL")
  )
    throw Error("PUBLIC_PRERENDERED_SHELL_REQUIRED");
  rendered.push({ route, name, bytes: Buffer.from(html, "utf8") });
}
const digest = (bytes) => createHash("sha256").update(bytes).digest("hex");
const contentTypes = {
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".woff2": "font/woff2",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".jpg": "image/jpeg",
  ".webp": "image/webp",
  ".html": "text/html; charset=utf-8",
};
const assets = [];
function record(file, bytes) {
  const contentType = contentTypes[path.extname(file)];
  if (!contentType) throw Error("UNEXPECTED_OFFLINE_ASSET_TYPE");
  assets.push({
    path: `/${file.replaceAll("\\", "/")}`,
    sha256: digest(bytes),
    bytes: bytes.length,
    contentType,
  });
}
for (const file of await readdir(path.join(root, "assets"))) {
  if (!/^[\w.-]+-[\w-]{8,}\.(?:js|css|woff2|png|svg|jpg|webp)$/.test(file))
    throw Error("HASHED_PUBLIC_ASSET_REQUIRED");
  record(`assets/${file}`, await readFile(path.join(root, "assets", file)));
}
const icons = [192, 512].map((size) => {
  const matches = assets.filter((asset) =>
    new RegExp(`/icon-${size}-[\\w-]+\\.png$`).test(asset.path),
  );
  if (matches.length !== 1) throw Error("PWA_ICON_REQUIRED");
  return {
    src: matches[0].path,
    sizes: `${size}x${size}`,
    type: "image/png",
    purpose: "any maskable",
  };
});
// Shell names come from their bytes, which can differ between runs; `sw.js` lists exactly these.
const shells = {};
const shellFiles = rendered.map(({ route, name, bytes }) => {
  const file = `${name}-${digest(bytes).slice(0, 16)}.html`;
  record(file, bytes);
  shells[route] = `/${file}`;
  return { file, bytes };
});
const manifest = {
  id: "/",
  name: "Phố Nhà Mình",
  short_name: "Phố Nhà Mình",
  lang: "vi",
  start_url: "/",
  scope: "/",
  display: "standalone",
  background_color: "#F3F1EA",
  theme_color: "#F3F1EA",
  icons,
};
assets.sort((a, b) => a.path.localeCompare(b.path));
const template = await readFile("src/pwa/service-worker.template.js", "utf8");
const version = digest(JSON.stringify({ assets, shells, template })).slice(0, 20);
const prefix = "home3d-public-static-v1-";
const serviceWorker = `const CACHE_PREFIX=${JSON.stringify(prefix)};\nconst CACHE_NAME=${JSON.stringify(prefix + version)};\nconst OWNED_ASSETS=${JSON.stringify(assets)};\nconst OFFLINE_SHELLS=${JSON.stringify(shells)};\n${template}`;
const headers = path.join(root, "_headers");
const existing = await readFile(headers, "utf8").catch(() => "");
const pwaHeaders =
  "\n/sw.js\n  Cache-Control: no-cache\n  Service-Worker-Allowed: /\n/manifest.webmanifest\n  Cache-Control: no-cache\n";
// Every check is above: a stop leaves the build output as it was, `.vite` included, and only an
// I/O error can interrupt the writes below. The Vite manifest moves first, so a rerun after an
// interrupted write finds it next to the server entry. Shells from earlier runs go next,
// including unhashed copies that older builds wrote, so only the ones `sw.js` references ship.
if (moveInternalManifest) await rename(internalManifest, privateManifest);
if (await exists(viteDirectory)) await rmdir(viteDirectory);
for (const file of await readdir(root)) {
  if (/^offline-(?:home|about)(?:-[a-f0-9]{16})?\.html$/.test(file))
    await rm(path.join(root, file));
}
for (const { file, bytes } of shellFiles) await writeFile(path.join(root, file), bytes);
await writeFile(path.join(root, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
await writeFile(path.join(root, "sw.js"), serviceWorker);
// Safe to rerun on the same output: the PWA header block is appended once.
if (!existing.includes(pwaHeaders)) await writeFile(headers, existing + pwaHeaders);
console.log(
  JSON.stringify({
    pwa: "generated",
    version,
    ownedAssets: assets.length,
    ownedBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    offlineRoutes: Object.keys(shells),
  }),
);
