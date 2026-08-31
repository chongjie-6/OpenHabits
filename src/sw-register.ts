/**
 * Service worker registration.
 *
 * Kept out of `main.tsx` so the failure modes are all in one place: no service
 * worker support, a registration that throws, and the dev server (where a stale
 * cached shell would fight hot reload) are all simply "no offline support this
 * session" rather than anything the user has to see.
 *
 * Registration is deferred to `load` so it does not compete with first paint —
 * but only if `load` is still ahead of us. This function is called after the
 * first IndexedDB read, and that read routinely finishes *after* the load event
 * on a warm start. Waiting for an event that has already fired is how offline
 * support silently never installs at all: no error, no worker, no cache, and an
 * app that quietly stops working on a plane.
 */
export function registerServiceWorker(): void {
  if (!('serviceWorker' in navigator)) return
  if (import.meta.env.DEV) return

  const register = () => {
    navigator.serviceWorker.register('/sw.js').catch((error: unknown) => {
      console.warn('Offline support is unavailable', error)
    })
  }

  if (document.readyState === 'complete') register()
  else window.addEventListener('load', register, { once: true })
}
