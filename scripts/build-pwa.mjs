import { createHash } from "node:crypto";
import { readFile, writeFile, readdir, rename, rm, rmdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readBuildOutput } from "../build/output.mjs";

const output = await readBuildOutput();
const root = output.root;
const { default: application } = await import(pathToFileURL(output.serverEntry).href);
if (typeof application?.fetch !== "function") throw Error("BUILT_FETCH_APPLICATION_REQUIRED");
// Render only the public initial shell from the same built app, without starting a server.
for (const [route, file] of [
  ["/", "offline-home.html"],
  ["/gioi-thieu", "offline-about.html"],
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
  await writeFile(path.join(root, file), await response.text());
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
async function add(file) {
  const bytes = await readFile(path.join(root, file));
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
  await add(`assets/${file}`);
}
// A rerun renders new shell bytes; drop hashed shells from earlier runs so only referenced ones ship.
for (const file of await readdir(root)) {
  if (/^offline-(?:home|about)-[a-f0-9]{16}\.html$/.test(file)) await rm(path.join(root, file));
}
const shells = {};
for (const [route, source] of [
  ["/", "offline-home.html"],
  ["/gioi-thieu", "offline-about.html"],
]) {
  const bytes = await readFile(path.join(root, source));
  const html = bytes.toString("utf8");
  if (
    !html.includes("<html") ||
    !html.includes("/assets/") ||
    html.includes("SYNTHETIC_PRIVATE_SENTINEL")
  )
    throw Error("PUBLIC_PRERENDERED_SHELL_REQUIRED");
  const file = source.replace(".html", `-${digest(bytes).slice(0, 16)}.html`);
  await writeFile(path.join(root, file), bytes);
  await add(file);
  shells[route] = `/${file}`;
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
await writeFile(path.join(root, "manifest.webmanifest"), JSON.stringify(manifest, null, 2) + "\n");
assets.sort((a, b) => a.path.localeCompare(b.path));
const template = await readFile("src/pwa/service-worker.template.js", "utf8");
const version = digest(JSON.stringify({ assets, shells, template })).slice(0, 20);
const prefix = "home3d-public-static-v1-";
await writeFile(
  path.join(root, "sw.js"),
  `const CACHE_PREFIX=${JSON.stringify(prefix)};\nconst CACHE_NAME=${JSON.stringify(prefix + version)};\nconst OWNED_ASSETS=${JSON.stringify(assets)};\nconst OFFLINE_SHELLS=${JSON.stringify(shells)};\n${template}`,
);
const headers = path.join(root, "_headers");
const existing = await readFile(headers, "utf8").catch(() => "");
const pwaHeaders =
  "\n/sw.js\n  Cache-Control: no-cache\n  Service-Worker-Allowed: /\n/manifest.webmanifest\n  Cache-Control: no-cache\n";
// Safe to rerun on the same output: the PWA header block is appended once.
if (!existing.includes(pwaHeaders)) await writeFile(headers, existing + pwaHeaders);
// Vite's internal manifest may include absolute build paths; it is tooling input, not a public asset.
const exists = (file) =>
  stat(file).then(
    () => true,
    () => false,
  );
const viteDirectory = path.join(root, ".vite");
const internalManifest = path.join(viteDirectory, "manifest.json");
const privateManifest = path.join(path.dirname(output.serverEntry), "client-manifest.json");
if (await exists(internalManifest)) await rename(internalManifest, privateManifest);
else if (!(await exists(privateManifest))) throw Error("VITE_CLIENT_MANIFEST_REQUIRED");
if (await exists(viteDirectory)) {
  // Never publish other Vite internals; an unexpected file stops the build instead of shipping it.
  if ((await readdir(viteDirectory)).length) throw Error("UNEXPECTED_PUBLIC_VITE_FILES");
  await rmdir(viteDirectory);
}
console.log(
  JSON.stringify({
    pwa: "generated",
    version,
    ownedAssets: assets.length,
    ownedBytes: assets.reduce((sum, asset) => sum + asset.bytes, 0),
    offlineRoutes: Object.keys(shells),
  }),
);
