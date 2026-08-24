import "server-only";

/**
 * Identity for the sync endpoint — the seam the rest of the server imports, with
 * `better-auth.ts` behind it. Swapping providers rewrites `resolveUser` and
 * nothing else. See DESIGN.md §13.6.
 *
 * It fails closed: anything but a valid session returns null and the endpoint
 * answers 401. A shared or guessable account id would silently pool every
 * visitor's habits into one row set.
 *
 * `id` becomes half of every primary key in `schema.ts`, so it must be stable
 * for the life of the account — which is why `auth-schema.ts:user` and
 * `schema.ts:users` are separate tables holding the same id.
 */

import type { SyncUser } from "./auth-types";
import { getAuth } from "./better-auth";

export type { SyncUser };

/**
 * Resolve the account this request syncs to, or null to refuse it. Reads the
 * cookie off `request` rather than `next/headers`, so it is callable from
 * anywhere with a Request in hand.
 */
export async function resolveUser(request: Request): Promise<SyncUser | null> {
  const override = devUser();
  if (override) return override;

  try {
    const session = await getAuth().api.getSession({ headers: request.headers });
    if (!session?.user?.email) return null;

    return { id: session.user.id, email: session.user.email };
  } catch (cause) {
    // Logged rather than thrown: the caller answers 401, and a 500 here would
    // tell the client to keep retrying against a broken dependency.
    console.error("openhabits: session lookup failed", cause);
    return null;
  }
}

/**
 * A fixed single-user identity for local development. A bypass, not a stand-in:
 * set it and every request is that account, whoever is signed in.
 *
 * Guarded on `NODE_ENV` as well, because the failure to prevent is the variable
 * surviving into production and turning every visitor into the same account.
 */
function devUser(): SyncUser | null {
  if (process.env.NODE_ENV === "production") return null;

  const id = process.env.OPENHABITS_DEV_USER_ID;
  if (!id) return null;

  return { id, email: process.env.OPENHABITS_DEV_USER_EMAIL ?? `${id}@openhabits.local` };
}
