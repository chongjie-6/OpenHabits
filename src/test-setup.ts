/**
 * Test environment shims.
 *
 * jsdom implements no CSS Object Model media queries, so `window.matchMedia`
 * is simply absent. Every real browser has had it for over a decade, so the app
 * calls it directly rather than guarding each use; the stub belongs here, in the
 * environment that is missing it, not in production code.
 *
 * It reports "does not match" for everything, which puts tests in light theme on
 * a narrow screen — the phone layout, and the more interesting one to cover.
 */
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList
}
