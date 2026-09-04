/**
 * The app's own public origin, for metadata. See DESIGN.md §8.6.
 *
 * Separate from `lib/server/base-url.ts` on purpose, and the split is not
 * cosmetic. That module answers "where may Better Auth mail a verification
 * link", which is a security question and throws in production rather than
 * guess. This one answers "what should an OG card's image URL say", which is
 * cosmetic — a deployment with no accounts at all still wants link previews,
 * and it has no `BETTER_AUTH_URL` to borrow.
 *
 * No `NEXT_PUBLIC_` prefix: every read happens while metadata is being built on
 * the server, so inlining the value into the client bundle would buy nothing.
 */

/**
 * Vercel names the production domain without a scheme. Preview deployments get
 * their own per-deployment host, which is deliberately *not* consulted — an OG
 * card is scraped from whatever URL was shared, and a preview URL in a shared
 * card outlives the deployment it names.
 */
function fromVercel(env: NodeJS.ProcessEnv): string | undefined {
  const host = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  return host ? `https://${host}` : undefined;
}

/**
 * The fallback is `localhost`, which is also what Next infers when
 * `metadataBase` is unset — the difference is that stating it explicitly keeps
 * the build silent. §8.6 made warning-free-with-no-environment a property worth
 * having, and every variable in `.env.example` is optional.
 */
export const FALLBACK_SITE_URL = "http://localhost:3000";

export function siteURL(env: NodeJS.ProcessEnv = process.env): URL {
  const candidate =
    env.SITE_URL?.trim() || env.BETTER_AUTH_URL?.trim() || fromVercel(env) || FALLBACK_SITE_URL;

  try {
    return new URL(candidate);
  } catch {
    // A typo'd origin should not fail a build that would otherwise be fine:
    // the cost is a wrong image URL in a link preview, not a broken app.
    console.warn(`[openhabits] SITE_URL is not a valid URL (${candidate}); falling back.`);
    return new URL(FALLBACK_SITE_URL);
  }
}
