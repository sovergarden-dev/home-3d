/* Generated constants are prepended by scripts/build-pwa.mjs. */
const allowed = new Map(OWNED_ASSETS.map((asset) => [asset.path, asset]));
const hex = (bytes) =>
  [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");

async function ownedResponse(asset) {
  const response = await fetch(asset.path, {
    credentials: "same-origin",
    redirect: "error",
    cache: "force-cache",
  });
  if (!response.ok || response.redirected || !["basic", "default"].includes(response.type))
    throw Error("PUBLIC_ASSET_UNAVAILABLE");
  const bytes = await response.arrayBuffer();
  if (hex(await crypto.subtle.digest("SHA-256", bytes)) !== asset.sha256)
    throw Error("PUBLIC_ASSET_INTEGRITY_FAILED");
  return new Response(bytes, {
    headers: {
      "Content-Type": asset.contentType,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "same-origin",
    },
  });
}
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);
      await Promise.all(
        OWNED_ASSETS.map(async (asset) => cache.put(asset.path, await ownedResponse(asset))),
      );
    })(),
  );
});
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX));
      const keep = new Set([CACHE_NAME, ...names.filter((name) => name !== CACHE_NAME).slice(-1)]);
      await Promise.all(names.filter((name) => !keep.has(name)).map((name) => caches.delete(name)));
      await self.clients.claim();
    })(),
  );
});
self.addEventListener("message", (event) => {
  if (event.data?.type === "ACTIVATE_UPDATE") event.waitUntil(self.skipWaiting());
});
self.addEventListener("fetch", (event) => {
  const request = event.request,
    url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          return await fetch(request);
        } catch {
          const key = OFFLINE_SHELLS[url.pathname.replace(/\/$/, "") || "/"];
          if (!key) return Response.redirect(new URL("/", self.location.origin).href);
          return (await (await caches.open(CACHE_NAME)).match(key)) ?? Response.error();
        }
      })(),
    );
    return;
  }
  if (url.search) return;
  const currentAsset = allowed.get(url.pathname);
  const hashedPath = /^\/assets\/[\w.-]+-[\w-]{8,}\.(?:js|css|woff2|png|svg|jpg|webp)$/.test(
    url.pathname,
  );
  if (!currentAsset && !hashedPath) return;
  event.respondWith(
    (async () => {
      if (!currentAsset) {
        for (const name of (await caches.keys()).filter((name) => name.startsWith(CACHE_PREFIX))) {
          const previous = await (await caches.open(name)).match(url.pathname);
          if (previous) return previous;
        }
        return fetch(request);
      }
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url.pathname);
      if (hit) return hit;
      const response = await ownedResponse(currentAsset);
      await cache.put(url.pathname, response.clone());
      return response;
    })(),
  );
});
