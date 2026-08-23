/**
 * The identity contract, alone in a file with no imports, so `sync-store.ts` does
 * not pull Better Auth — and through it a database adapter — into its import
 * graph just to name its argument. That is what lets
 * `tests/server/sync-store.test.ts` run the real store against PGlite with no
 * auth configured at all.
 */
export type SyncUser = {
  /** Stable, opaque account id. Half of every primary key. */
  id: string;
  email: string;
};
