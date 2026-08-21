/**
 * Better Auth's endpoints. See DESIGN.md §13.6.
 *
 * The second dynamic route in the app, and the first since §7.1 claimed there
 * would only ever be one. That claim was about *user data* — there is still no
 * `GET /habits`, nothing renders a habit on the server, and IndexedDB is still
 * the source of truth. Sign-in is the one thing a local-first app cannot do
 * locally, because the whole point of an identity is that another machine
 * agrees about it.
 *
 * `force-dynamic` is not decoration. A catch-all route whose GET Next decided
 * to prerender would bake one visitor's `/api/auth/get-session` response into
 * the build output and hand it to everybody.
 *
 * Note also `public/sw.js`, which excludes `/api/` from its caches. Without that
 * the service worker's stale-while-revalidate would answer a session check from
 * cache — telling a signed-out browser it is signed in, and doing it offline
 * where nothing can correct it.
 */

import { toNextJsHandler } from "better-auth/next-js";
import { syncConfigured } from "@/lib/server/db";
import { getAuth } from "@/lib/server/better-auth";

/** postgres.js opens a TCP socket, which the edge runtime does not provide. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Wrapped in a function rather than passed as `getAuth()` so the instance — and
 * with it a database connection — is built on the first request instead of at
 * module load. A deployment with no `DATABASE_URL` has no accounts to sign in
 * to, and says so rather than failing to boot.
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
