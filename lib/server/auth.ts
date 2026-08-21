import "server-only";

/**
 * Identity for the sync endpoint. See DESIGN.md §13.6.
 *
 * Sync needs exactly one thing from auth: a stable account id to scope rows by.
 * This module is the seam that was left unfilled for it, and Better Auth is what
 * now fills it — `better-auth.ts` holds the configuration, and this file stays
 * the only thing the rest of the server imports. Swapping providers means
 * rewriting `resolveUser` and nothing else.
 *
 * ## It still fails closed
 *
 * Anything other than a valid session returns null and the endpoint answers 401:
 * no cookie, an expired one, a forged one, a database that cannot be reached.
 * The alternative — a shared or guessable account id — would silently pool every
 * visitor's habits into one row set, and the first symptom would be a stranger's
 * data appearing on someone's phone.
 *
 * ## The id is load-bearing
 *
 * `id` becomes half of every primary key in `schema.ts`, so it must be stable
 * for the life of the account. Better Auth's user ids are opaque and never
 * reassigned, and `sync-store.ts` upserts `users` from what this returns — which
 * is why `auth-schema.ts:user` and `schema.ts:users` are separate tables holding
 * the same id rather than one table with two owners.
 */

import type { SyncUser } from "./auth-types";
import { getAuth } from "./better-auth";

export type { SyncUser };

/**
 * Resolve the account this request syncs to, or null to refuse it.
 *
 * Reads the session cookie off `request` — no `next/headers`, no request-scoped
 * globals — so this is callable from anywhere with a Request in hand and stays
 * trivially testable.
 */
export async function resolveUser(request: Request): Promise<SyncUser | null> {
  const override = devUser();
  if (override) return override;

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.email) return null;

    return { id: session.user.id, email: session.user.email };
  } catch (cause) {
    // A database that cannot be reached is not an authenticated request. Logged
    // rather than thrown: the caller's job is to answer 401, and a 500 here
    // would tell the client to keep retrying against a broken dependency.
    console.error("hapi: session lookup failed", cause);
    return null;
  }
}

/**
 * A fixed single-user identity for local development, from the environment.
 *
 * Now that a real provider is wired in this is a bypass, not a stand-in: set it
 * and every request is that account, whoever is actually signed in. Leave it
 * unset unless you are deliberately working on sync without touching sign-in.
 *
 * Guarded on `NODE_ENV` as well as on the variable being present, because the
 * failure this prevents is not a mistake in dev — it is the variable surviving
 * into a production environment, where it would turn every visitor into the same
 * account. Two conditions to get that wrong instead of one.
 */
function devUser(): SyncUser | null {
  if (process.env.NODE_ENV === "production") return null;

  const id = process.env.HAPI_DEV_USER_ID;
  if (!id) return null;

  return { id, email: process.env.HAPI_DEV_USER_EMAIL ?? `${id}@hapi.local` };
}
