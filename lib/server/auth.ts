import "server-only";

/**
 * Identity for the sync endpoint — the seam, not the implementation.
 *
 * Sync needs exactly one thing from auth: a stable account id to scope rows by.
 * Everything else about signing in — providers, magic links, password resets,
 * the account screen — is a separate piece of work with its own decisions, and
 * the sync layer does not have to wait for it. So this module defines the
 * contract and nothing more: fill in `resolveUser` when the provider is chosen
 * and no other file has to change.
 *
 * ## It fails closed
 *
 * With no provider wired up and no dev override, `resolveUser` returns null and
 * the endpoint answers 401. That is the correct default: the alternative — a
 * shared or guessable account id — would silently pool every visitor's habits
 * into one row set, and the first symptom would be a stranger's data appearing
 * on someone's phone. An unconfigured sync endpoint should be useless, not
 * permissive.
 *
 * ## Wiring a real provider
 *
 * Whatever the choice, the shape of the work is the same:
 *
 *   const session = await getSession();            // provider's server helper
 *   if (!session?.user?.email) return null;
 *   return { id: session.user.id, email: session.user.email };
 *
 * The `id` must be stable for the life of the account. It becomes half of every
 * primary key in `schema.ts`, so a provider that recycles or reassigns ids would
 * hand one user another's history.
 */

export type SyncUser = {
  /** Stable, opaque account id. Half of every primary key. */
  id: string;
  email: string;
};

/**
 * Resolve the account this request syncs to, or null to refuse it.
 *
 * `request` is threaded through — unused by the dev override, but a real
 * provider reads cookies or an Authorization header off it, and a signature that
 * has to change later is a signature that touches the route again.
 */
export async function resolveUser(request: Request): Promise<SyncUser | null> {
  const override = devUser();
  if (override) return override;

  void request;
  return null;
}

/**
 * A fixed single-user identity for local development, from the environment.
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
