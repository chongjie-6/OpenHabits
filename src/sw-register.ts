/**
 * Service worker registration.
 *
 * Kept out of `main.tsx` so the failure modes are all in one place: no service
 * worker support, a registration that throws, and the dev server (where a stale
 * cached shell would fight hot reload) are all simply "no offline support this
 * session" rather than anything the user has to see.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('Offline support is unavailable', error)
    })
  })
}
