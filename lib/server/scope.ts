import "server-only";

/**
 * The other half of row-level security. See DESIGN.md §13.15.
 *
 * The policies in `schema.ts` compare each row against
 * `current_setting('openhabits.user_id')`, so a statement only sees anything at
 * all if the transaction it runs in has said whose statement it is. These two
 * functions are how it says so — not a convenience wrapper around
 * `db.transaction`, but the only way to reach a replicated table.
 *
 * **Transaction-local, always** — the third argument to `set_config`. The
 * alternative is a session variable left behind on a pooled connection for
 * whichever request checks it out next, and `db.ts` runs a pool of one: a
 * session-scoped identity there is not a stale value, it is *the next
 * request's* identity.
 *
 * The check fails closed. An unset setting reads as NULL, `user_id = NULL` is
 * NULL, and a policy that is not true denies the row — so code that forgets to
 * open a scope gets an empty result and a rejected insert, rather than
 * everybody's rows.
 *
 * None of this replaces the `where user_id = …` clauses the queries already
 * carry. RLS is the backstop for the day one of them is dropped in a refactor,
 * which is a class of bug no amount of care in `sync-store.ts` can rule out.
 */

import { sql } from "drizzle-orm";
import type { Db } from "./db";

/** The transaction handle Drizzle hands a callback. Every query runs on one. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run `work` as `userId`. Everything inside sees exactly that account's rows,
 * and can write no others.
 */
export function asUser<T>(db: Db, userId: string, work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('openhabits.user_id', ${userId}, true)`);
    return work(tx);
  });
}

/**
 * Run `work` with no account: the scope the reminder sweep and the subscribe
 * upsert need, and nothing else should. It reaches `push_subscriptions` and
 * reads `settings`; `habits`, `entries` and `users` stay invisible to it, which
 * is the point — see the `server` policy comment in `schema.ts`.
 *
 * Every call site owes a comment saying why it cannot name an account.
 */
export function asServer<T>(db: Db, work: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('openhabits.scope', 'server', true)`);
    return work(tx);
  });
}
