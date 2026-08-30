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
 * served as-is and cannot import from src/. The build checks the two agree and
 * fails if a route is missing here.
 */
const SHELL = [
  '/',
  '/week',
  '/stats',
  '/quotes',
  '/settings',
  '/habit',
  '/manifest.webmanifest',
  '/icon.svg',
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE)
      // One failed URL must not fail the whole install, so add them individually.
      await Promise.allSettled(SHELL.map((url) => cache.add(url)))
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
        const cached = (await cache.match(url.pathname)) ?? (await cache.match('/'))
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
      const cached = await cache.match(request)
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
