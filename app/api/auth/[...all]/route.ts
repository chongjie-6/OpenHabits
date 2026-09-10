/**
 * Better Auth's endpoints. See DESIGN.md §13.6.
 *
 * The second dynamic route in an app that claimed to need one. §7.1's claim was
 * about *user data*, and sign-in is the one thing a local-first app cannot do
 * locally — the point of an identity is that another machine agrees about it.
 *
 * `force-dynamic` is load-bearing: a catch-all route whose GET Next decided to
 * prerender would bake one visitor's `/api/auth/get-session` response into the
 * build output and hand it to everybody. So is `public/sw.js` excluding `/api/`
 * from its caches, or stale-while-revalidate would answer a session check from
 * cache, offline, where nothing can correct it.
 */

import { toNextJsHandler } from "better-auth/next-js";
import { syncConfigured } from "@/lib/server/db";
import { getAuth } from "@/lib/server/better-auth";
import { readJson } from "@/lib/server/json";
import { authTier, check, checkMail, clientIp, tooMany } from "@/lib/server/ratelimit";

/** postgres.js opens a TCP socket, which the edge runtime does not provide. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wrapped rather than passed as `getAuth()`, so the instance — and with it a
 * database connection — is built on the first request instead of at module load.
 * A deployment with no `DATABASE_URL` says so rather than failing to boot.
 */
const handler = async (request: Request): Promise<Response> => {
  if (!syncConfigured()) {
    return Response.json(
      { error: "server-error", message: "Accounts are not configured on this deployment." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const refusal = await meter(request);
  if (refusal) return refusal;

  return getAuth().handler(request);
};

/**
 * The tiers this catch-all needs beyond the generous per-IP one `proxy.ts`
 * already applied. See DESIGN.md §13.17.
 *
 * Two paths under here spend something that is not ours. `send-verification-email`
 * takes any address with no session at all — deliberately, so that "resend"
 * needs no second endpoint and cannot be used to enumerate accounts (§13.12) —
 * and `request-password-reset` answers the same way for an address it has never
 * seen. Both therefore mail whoever is named, which makes them an outbound-mail
 * primitive with somebody else's inbox on the far end, and until now an unmetered
 * one. The credential paths are metered for the ordinary reason: each is a
 * password hash verify.
 *
 * Returns the refusal, or `null` to continue.
 */
async function meter(request: Request): Promise<Response | null> {
  const tier = authTier(new URL(request.url).pathname);
  if (!tier) return null;

  const ip = clientIp(request.headers);

  if (tier === "credential") {
    const verdict = await check("credential", ip);
    return verdict.ok
      ? null
      : tooMany("Too many attempts. Wait a moment and try again.", verdict.retryAfter);
  }

  const verdict = await checkMail(ip, await addressOf(request));
  return verdict.ok
    ? null
    : tooMany(
        "Too many emails requested. Check your inbox and spam folder — one may already be there.",
        verdict.retryAfter,
      );
}

/**
 * The address the mail would go to, so the day-long half of the mail tier can
 * follow the *recipient* rather than the caller — three a minute per IP is
 * trivially defeated by rotating them, and being mailed repeatedly is the thing
 * worth preventing.
 *
 * A clone, so the original body still reaches Better Auth unread. A body that
 * does not parse is not an error here: it is Better Auth's to answer for, and
 * the per-IP half of the tier has already been spent either way.
 */
async function addressOf(request: Request): Promise<string | null> {
  const body = await readJson(request.clone());
  const email = (body as { email?: unknown } | null | undefined)?.email;
  return typeof email === "string" && email.length > 0 && email.length <= 320 ? email : null;
}

export const { GET, POST } = toNextJsHandler(handler);
