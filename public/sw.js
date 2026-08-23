/**
 * hapi service worker.
 *
 * Runtime caching only — no precache manifest, and therefore no build
 * integration to keep in sync. Affordable because the worker's only job is
 * delivering the shell: user data lives in IndexedDB and is already offline by
 * construction.
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

  // Never cache the API. `/api/auth/*` has GET endpoints, a session check among
  // them, and served stale that tells a signed-out browser it is signed in —
  // offline, where nothing corrects it. Falling through means an offline session
  // check fails, which is right: this app needs the network to prove who you
  // are, not to show a habit.
  if (url.pathname.startsWith("/api/")) return;

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
