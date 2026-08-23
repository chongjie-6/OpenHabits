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
  return getAuth().handler(request);
};

export const { GET, POST } = toNextJsHandler(handler);
