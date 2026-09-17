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
  try {
    const session = await getAuth().api.getSession({
      headers: request.headers,
    });
    if (!session?.user?.email) return null;

    return { id: session.user.id, email: session.user.email };
  } catch (cause) {
    // Logged rather than thrown: the caller answers 401, and a 500 here would
    // tell the client to keep retrying against a broken dependency.
    console.error("openhabits: session lookup failed", cause);
    return null;
  }
}
