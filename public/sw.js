/**
 * hapi service worker. See DESIGN.md §8.2.
 *
 * Runtime caching only — no build-time precache manifest, and therefore no
 * build integration to keep in sync. That is affordable here because the data
 * layer is entirely client-side: the worker's only job is delivering the shell,
 * and there is no sync protocol for it to get wrong. It never touches user
 * data, which lives in IndexedDB and is already offline by construction.
 *
 * Swap this for Serwist if precise precaching and revision-hashed invalidation
 * become worth the build-time coupling.
 */

const VERSION = "hapi-v1";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const KEEP = new Set([SHELL, ASSETS]);

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => !KEEP.has(n)).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Navigations: network first, so a deploy is picked up immediately, with the
  // cached shell as the offline fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put(request, response.clone());
          return response;
        } catch {
          const cached =
            (await caches.match(request)) || (await caches.match("/"));
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Build output is content-hashed, so it can be served from cache forever.
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        const cache = await caches.open(ASSETS);
        cache.put(request, response.clone());
        return response;
      })(),
    );
    return;
  }

  // Everything else same-origin: serve stale, refresh in the background.
  event.respondWith(
    (async () => {
      const cached = await caches.match(request);
      const network = fetch(request)
        .then(async (response) => {
          if (response.ok) {
            const cache = await caches.open(ASSETS);
            cache.put(request, response.clone());
          }
          return response;
        })
        .catch(() => cached);

      return cached ?? network;
    })(),
  );
});
