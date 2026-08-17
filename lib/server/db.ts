import "server-only";

/**
 * The Postgres connection.
 *
 * Two things this file is careful about, both consequences of running inside a
 * serverless function rather than a long-lived server:
 *
 * - **The client is cached on `globalThis`.** Route handler modules are
 *   re-evaluated across hot reloads in dev and across some cold starts in prod;
 *   a fresh pool per evaluation exhausts Postgres' connection limit long before
 *   it exhausts the request volume.
 *
 * - **The pool is tiny and `prepare` is off.** Each function instance handles one
 *   request at a time, so a large pool buys nothing and costs a connection slot
 *   per instance. Prepared statements are disabled because they are per-session
 *   state, and a pooler handing out a different backend per checkout invalidates
 *   them — the failure looks like intermittent "prepared statement does not
 *   exist" errors under load, which is a miserable thing to debug.
 */

import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

function connectionString(): string {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error(
      "DATABASE_URL is not set. Sync is unavailable; see .env.example. " +
        "The app itself does not need it — IndexedDB remains the source of truth.",
    );
  }
  return url;
}

const globalForDb = globalThis as unknown as {
  hapiSql?: ReturnType<typeof postgres>;
};

function client(): ReturnType<typeof postgres> {
  globalForDb.hapiSql ??= postgres(connectionString(), {
    max: 1,
    prepare: false,
    idle_timeout: 20,
    connect_timeout: 10,
  });
  return globalForDb.hapiSql;
}

/**
 * Lazily constructed, so importing anything from this module does not require a
 * database. Without that, a build-time trace of the route would fail on a
 * machine with no `DATABASE_URL`.
 */
export function getDb() {
  return drizzle(client(), { schema });
}

export type Db = ReturnType<typeof getDb>;

/** Whether sync is configured at all. Used to answer honestly rather than 500. */
export function syncConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}
