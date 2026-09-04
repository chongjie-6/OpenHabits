import type { NextConfig } from "next";

/**
 * Content-Security-Policy for the app itself. See DESIGN.md §8.7.
 *
 * **`script-src` carries `'unsafe-inline'`, and it is not an oversight.** Three
 * scripts are inlined into every prerendered document: `lib/theme.ts`'s
 * pre-paint block, and two of Next's own flight-data pushes whose contents
 * differ per page and change on every build. Neither of the two ways out is
 * available here:
 *
 * - **A nonce** requires rendering the document per request, and every route in
 *   this app is static (§8.1) — `public/sw.js` then caches that HTML, so a nonce
 *   would be cached with it and mismatch the header on the next load. The
 *   offline app would break itself.
 * - **Hashes** would have to cover Next's flight scripts, which are per-page and
 *   per-build. A static header cannot name them.
 *
 * What is left still pays for itself. `connect-src 'self'` is the directive that
 * matters most: injected script can run, but it cannot post a year of habits to
 * an origin the user has never heard of. `base-uri`, `form-action`,
 * `object-src` and the external-origin ban on `script-src` close the rest of the
 * common escalation paths.
 *
 * `style-src` keeps `'unsafe-inline'` for Next's built-in error and not-found
 * documents, which are the only pages here that ship a `<style>` block or a
 * style attribute. This app's own seven pages prerender with neither — the
 * palette writes custom properties through CSSOM (`applyPaletteVars`), which CSP
 * does not govern.
 */
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const nextConfig: NextConfig = {
  experimental: {
    /**
     * Connectivity detection for `lib/sync/client.ts`. It does **not** retry
     * sync for us — the framework retries its own navigations, prefetches and
     * Server Actions, and `POST /api/sync` is a plain `fetch` from a client
     * component, so its retry stays hand-rolled. What this buys is a truthful
     * answer to "are we offline": `navigator.onLine` reports true for a device
     * on wifi with no route to the internet, and this polls the origin.
     */
    useOffline: true,
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Content-Security-Policy", value: CSP },
        ],
      },
      {
        // The worker must never be served stale, or a bad one pins itself.
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
