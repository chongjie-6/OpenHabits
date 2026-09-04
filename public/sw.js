/**
 * OpenHabits service worker.
 *
 * Runtime caching only — no precache manifest, and therefore no build
 * integration to keep in sync. Affordable because the worker's only job is
 * delivering the shell: user data lives in IndexedDB and is already offline by
 * construction.
 */

const VERSION = "openhabits-v1";
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

/**
 * Reminders — DESIGN.md §8.5.
 *
 * The worker cannot schedule these itself; that is the whole reason a server and
 * an hourly cron exist. Its job here is only to render what arrives and to put
 * the user back in the app when they tap it.
 */

const FALLBACK_TITLE = "OpenHabits";

self.addEventListener("push", (event) => {
  event.waitUntil(
    (async () => {
      let payload = {};
      try {
        payload = event.data ? event.data.json() : {};
      } catch {
        // Not our payload, or not JSON. A notification is shown regardless:
        // every push a browser delivers must produce one, and staying silent
        // costs the app its push permission on Chrome.
      }

      const title = typeof payload.title === "string" ? payload.title : FALLBACK_TITLE;
      const body =
        typeof payload.body === "string" ? payload.body : "You have habits left today.";

      await self.registration.showNotification(title, {
        body,
        // Same tag every day, so a missed morning is replaced rather than
        // stacked. `renotify` is off for the same reason — a replacement is not
        // news.
        tag: typeof payload.tag === "string" ? payload.tag : "openhabits-daily",
        icon: "/icon-192.png",
        badge: "/icon-192.png",
        data: { url: safePath(payload.url) },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const path = safePath(event.notification.data && event.notification.data.url);

  event.waitUntil(
    (async () => {
      const target = new URL(path, self.location.origin);
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // Focus a tab that is already open rather than stacking another copy of a
      // standalone app on top of itself.
      for (const client of clients) {
        if (new URL(client.url).origin !== target.origin) continue;
        await client.focus();
        // Best effort: `navigate` rejects on a client this worker does not
        // control, and the focus above has already done the useful half.
        if ("navigate" in client && client.url !== target.href) {
          await client.navigate(target.href).catch(() => null);
        }
        return;
      }

      await self.clients.openWindow(target.href);
    })(),
  );
});

/**
 * The payload is server-authored, but it arrives over a third-party push service
 * and ends up in `openWindow` — so it is treated as a same-origin path or not at
 * all. A leading `//` is rejected because `new URL("//evil.example", origin)`
 * resolves to another origin entirely.
 */
function safePath(value) {
  if (typeof value !== "string") return "/";
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}
