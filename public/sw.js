/**
 * OpenHabits service worker — DESIGN.md §8.2.
 *
 * Runtime caching plus a **route precache**, which is the one piece of build
 * coupling this worker carries. `ROUTES` is the app's complete list of
 * prerendered pages, and `tests/sw.test.ts` fails if `app/` grows one this file
 * does not name.
 *
 * Runtime caching alone was not enough, and the reason is the router rather
 * than the data. Every screen is offline by construction — habits live in
 * IndexedDB — but reaching a screen is a fetch. A tab tap asks for that route's
 * flight payload, and a relaunch asks for its HTML, so a route the browser
 * never happened to request while online was simply missing: the tap did
 * nothing (`experimental.useOffline` keeps a failed navigation pending rather
 * than throwing) and a relaunch on `/stats` fell through to the `/` fallback
 * and drew Today under the Stats URL. Seven static documents is a cheap price
 * for an app that calls itself local-first.
 */

const VERSION = "openhabits-v2";
const SHELL = `${VERSION}-shell`;
const ASSETS = `${VERSION}-assets`;
const FLIGHT = `${VERSION}-flight`;
const KEEP = new Set([SHELL, ASSETS, FLIGHT]);

/**
 * Every route reachable from inside the app. `/reset-password` is deliberately
 * absent: it is an online-only flow — the link arrives by mail and the form
 * posts to the server — so precaching it would buy a shell with nothing behind
 * it.
 */
const ROUTES = ["/", "/week", "/stats", "/settings", "/settings/colours", "/quotes", "/habit"];

self.addEventListener("install", (event) => {
  // Precaching must not gate activation: a worker that fails to install leaves
  // the previous one in charge, and a partial precache is worth more than none.
  event.waitUntil(Promise.all([self.skipWaiting(), precache("reload")]));
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

/**
 * Both halves of a route: the document a relaunch or a shared link asks for,
 * and the flight payload a tab tap asks for. Failures are swallowed per route —
 * offline at install time is the normal case for a reinstall, and the next
 * online navigation refreshes what is missing.
 */
async function precache(cacheMode) {
  const [shell, flight] = await Promise.all([caches.open(SHELL), caches.open(FLIGHT)]);

  await Promise.all(
    ROUTES.map(async (path) => {
      await Promise.all([
        fetch(path, { cache: cacheMode })
          .then((r) => (r.ok ? shell.put(routeKey(path), r) : null))
          .catch(() => null),
        fetch(path, { cache: cacheMode, headers: { RSC: "1" } })
          .then((r) => (r.ok ? putFlight(flight, path, r) : null))
          .catch(() => null),
      ]);
    }),
  );
}

/**
 * A deploy does not bump `VERSION`, so nothing else would ever re-run the
 * precache: `install` fires when this file changes, not when the app behind it
 * does. Kicked off once per worker startup off the back of a network response,
 * which in a standalone app is about once per launch.
 */
let revalidated = false;
function revalidate() {
  if (revalidated) return;
  revalidated = true;
  // Conditional requests, not `reload` — the routes carry ETags and only the
  // ones that actually changed cost a body.
  precache("no-cache").catch(() => null);
}

/**
 * Routes are keyed by pathname, without the query. `/habit?id=…` is one static
 * page parameterised at runtime (see its own header), so one entry answers
 * every habit — which is the whole reason that screen is a search parameter
 * rather than a dynamic segment.
 */
function routeKey(path) {
  return new Request(new URL(path, self.location.origin).pathname);
}

/**
 * Two things stop a flight response being stored as it arrives. Next answers an
 * RSC request with a 307 to a hash-stamped `?_rsc=` URL — the hash differs
 * between a prefetch and a navigation, and changes every build — and `cache.put`
 * refuses a response that followed a redirect. Rebuilding it drops both the
 * redirect and the `Vary` header, which otherwise makes the entry unmatchable:
 * `Vary` names the router's own state-tree and prefetch headers, so a stored
 * payload would only ever match a repeat of the exact request that fetched it.
 */
async function putFlight(cache, path, response) {
  const headers = new Headers(response.headers);
  headers.delete("vary");
  const body = await response.blob();
  await cache.put(routeKey(path), new Response(body, { status: 200, headers }));
}

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
  // precached document as the offline fallback. Falling back to `/` is the last
  // resort for a URL this app does not serve — every route it does serve is in
  // `ROUTES`, so no tab can land on Today's HTML under another tab's address.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL);
          cache.put(routeKey(url.pathname), response.clone());
          revalidate();
          return response;
        } catch {
          const shell = await caches.open(SHELL);
          const cached =
            (await shell.match(routeKey(url.pathname))) || (await shell.match(routeKey("/")));
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // The router's own fetches — a prefetch or a tab tap. Stale-while-revalidate
  // rather than network-first, because these are on the path of every soft
  // navigation and a static route has nothing to be fresh about; the background
  // refresh picks a deploy up by the next tap.
  if (url.searchParams.has("_rsc") || request.headers.get("RSC") === "1") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(FLIGHT);
        const key = routeKey(url.pathname);
        const cached = await cache.match(key);
        const network = fetch(request)
          .then(async (response) => {
            if (response.ok) {
              await putFlight(cache, url.pathname, response.clone());
              revalidate();
            }
            return response;
          })
          .catch(() => cached);

        // The refresh has to outlive the response, or a cache hit lets the
        // worker be killed before the new payload lands.
        event.waitUntil(network);
        return (cached ?? (await network)) ?? Response.error();
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
