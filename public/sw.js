/**
 * OpenHabits service worker.
 *
 * The shell is cached stale-while-revalidate: a navigation is served from the
 * cache immediately — so the app opens at once, and opens at all with no network
 * — while a fresh copy is fetched in the background for next time.
 *
 * Note what is *not* here: your habits. They live in IndexedDB, which needs no
 * caching and is never touched by this file. A cache miss can cost you a slower
 * load; it can never cost you data.
 */

// Stamped with a fresh value on every build by scripts/prerender.mjs, so each
// deploy gets its own cache and `activate` can delete the previous one.
const VERSION = 'v1'
const CACHE = `openhabits-${VERSION}`

/**
 * The routes prerendered at build time, plus what the shell references.
 *
 * This duplicates the router's list because a service worker is plain JavaScript
 * served as-is and cannot import from src/. The build checks the two agree in
 * both directions and fails on a route missing here, or one left here after the
 * router dropped it.
 */
const SHELL = [
  '/',
  '/week',
  '/stats',
  '/settings',
  '/habit',
  '/manifest.webmanifest',
  '/icon.svg',
]

/**
 * The hashed JS and CSS the shell loads. Stamped in at build time by
 * scripts/prerender.mjs, because the filenames change with every build.
 *
 * Without this, offline worked from the *second* visit and not the first. The
 * shell HTML was precached at install, but the bundle it pulls in was only
 * cached opportunistically, by the fetch handler, on a request that had already
 * gone to the network before this worker was controlling anything. So the first
 * offline load served the prerendered HTML and then failed to fetch the script:
 * the right pixels, none of the app — buttons that do nothing when tapped.
 *
 * A precache is only honest if it covers what the page actually needs to run.
 */
const ASSETS = []

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // One failed URL must not fail the whole install, so add them individually.
      await Promise.allSettled([...SHELL, ...ASSETS].map((url) => cache.add(url)))
      await self.skipWaiting()
    })(),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys()
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)))
      await self.clients.claim()
    })(),
  )
})

self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') void self.skipWaiting()
})

/**
 * Cache lookups ignore `Vary`.
 *
 * Static hosts commonly answer with `Vary: Origin`, and a cached response that
 * carries it is only returned to a request whose `Origin` header matches the one
 * that filled the cache. Those do not line up here: the shell is precached by
 * `cache.add` during install, while the page later asks for the same file as a
 * module script — a CORS-mode request that sends `Origin`. Same URL, same bytes,
 * no match, and the fallback below answers a 504 that reads as "offline" when the
 * file was sitting in the cache the whole time.
 *
 * Every URL cached here is same-origin and hash-named, so its content does not
 * depend on request headers and ignoring `Vary` cannot serve the wrong bytes.
 */
const MATCH = { ignoreVary: true }

/** Fetch and cache in the background; failure is silent and expected offline. */
function revalidate(request, cache) {
  return fetch(request)
    .then((response) => {
      if (response.ok && response.type === 'basic') {
        void cache.put(request, response.clone())
      }
      return response
    })
    .catch(() => undefined)
}

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return
  // Anything server-backed is left entirely alone: a stale sync response is
  // worse than no response, and this app is designed to work without one.
  if (url.pathname.startsWith('/api/')) return

  // Navigations resolve to that route's prerendered HTML.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE)
        const cached =
          (await cache.match(url.pathname, MATCH)) ?? (await cache.match('/', MATCH))
        if (cached) {
          void revalidate(request, cache)
          return cached
        }
        const fresh = await revalidate(request, cache)
        return fresh ?? new Response('Offline', { status: 503, statusText: 'Offline' })
      })(),
    )
    return
  }

  // Static assets: hashed filenames, so a cache hit is always correct.
  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE)
      const cached = await cache.match(request, MATCH)
      if (cached) {
        void revalidate(request, cache)
        return cached
      }
      const fresh = await revalidate(request, cache)
      if (fresh) return fresh
      return new Response('', { status: 504, statusText: 'Offline' })
    })(),
  )
})
