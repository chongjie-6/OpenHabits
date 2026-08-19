# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev              # next dev
npm run build            # next build
npm start                # next start (use for Lighthouse / perf checks)
npm run lint             # eslint (flat config, eslint-config-next core-web-vitals + typescript)
npm test                 # vitest run — tests/**/*.test.ts only
npm run test:watch
npx vitest run tests/sync/merge.test.ts          # single file
npx vitest run -t "takes the later write"        # single case by name
npm run icons            # regenerate public/icon-*.png + app/apple-icon.png
npm run db:generate      # drizzle-kit generate — write a migration
npm run db:migrate       # drizzle-kit migrate — apply committed migrations
npm run db:studio
```

There is no typecheck script; `npm run build` is the typecheck.

Tests all live under `tests/`, mirroring the `lib/` tree they cover (`lib/sync/merge.ts` → `tests/sync/merge.test.ts`), and reach their subjects through the `@/` alias rather than relative paths. They cover pure logic only — there are no component or E2E tests. `tests/server/sync-store.test.ts` boots a real Postgres in-process (PGlite, WASM) per case and applies the committed `drizzle/` migrations verbatim, hence the 30s `testTimeout`. Vitest aliases `server-only` to its empty module so `lib/server/*` is importable in tests.

`DATABASE_URL` etc. are all optional — see `.env.example`. With none set, the app runs exactly as it did before sync existed.

## Conventions

- **Components are PascalCase — the file and the export.** `components/DownloadAppButton.tsx` exporting `DownloadAppButton`. All of `components/` follows this. A file exporting several components takes the name of its primary one, or of the group when they are peers (`AppChrome.tsx` → `Hydrator` + `BottomNav`). Modules under `lib/` stay kebab-case (`use-today.ts`).

## Architecture

`DESIGN.md` is the authoritative design document and is kept current; section numbers (§7.1, §13.2, …) are referenced from module headers throughout the source. Read the relevant section before changing anything in `lib/`.

**Local-first.** IndexedDB is the source of truth. Every route prerenders to static HTML; `POST /api/sync` is the only endpoint and the only dynamic route. Sync is replication between copies of the local store, not server-authoritative data — with `DATABASE_URL` unset the endpoint answers 503 and the app is fully functional.

Data flow: React client components → `lib/store.ts` (in-memory cache + `useSyncExternalStore`) → `lib/db.ts` (IndexedDB, fire-and-forget writes) → `lib/sync/client.ts` merges server state in later. **The dependency runs one way**: sync imports the store; the store knows nothing about sync.

### Invariants that will bite

- **Mutations are synchronous and optimistic; the UI never awaits a write.** A habit tick that spins is a habit that dies (§7.2). Persist with the fire-and-forget `persist()` helper.
- **Two clocks (§13.2).** `updatedAt` (client epoch ms) decides merge conflicts; `seq` (one Postgres sequence) drives the pull cursor. Never compare or conflate them. `lib/db.ts:SyncMeta` keeps `cursor` (a `seq`) and `pushedThrough` (an `updatedAt` watermark) separate for this reason.
- **Last-write-wins ties break on content fingerprint**, not on "incoming wins" — otherwise two devices swap values forever instead of converging. The rule lives once, in `lib/sync/protocol.ts:wins`, and the server calls the same function the client does. Do not re-express it as SQL.
- **Deletes write tombstones**, never remove rows. Tombstones live in `state.tombstones`, out of `state.habits`, so no screen has to remember to filter them. Entries deliberately have no tombstone.
- **Dates are local civil `YYYY-MM-DD` strings (`DayKey`).** `lib/dates.ts` is the only module that should call `new Date()` to produce one; day maths is done in UTC-space to keep DST from shifting a boundary. It carries the largest share of the test suite.
- **Derived data is never persisted** — `lib/history.ts` and `lib/streaks.ts` rebuild a full year well inside the frame budget, pinned by `tests/history.bench.test.ts`.
- **Nothing user- or date-dependent may render on the server.** Routes are static, and the service worker caches that HTML — a server-computed date would pin every visitor to the build day's quote. Gate data-dependent subtrees on `store.hydrated`; read the clock through `useToday()`, not a `setState` in an effect. For state that lives in the browser rather than the store — `display-mode`, `beforeinstallprompt` — the `useSyncExternalStore` **server snapshot deliberately reports the hidden case**, so the UI only ever appears after hydration and never disappears. Writing it the honest way round makes the SW cache an install banner for someone who already installed.
- **The theme is the one exception**: a blocking inline script in `<head>` (`lib/theme.ts:THEME_SCRIPT`) reads `localStorage` pre-paint, so theme is mirrored there as well as into IndexedDB. Any code path that changes theme must call `applyTheme`.
- **`--muted` passes WCAG AA with no headroom.** Never apply an opacity modifier to it (`text-muted/80` and friends were all removed in an audit). If something needs to recede further, give it a smaller role, not a thinner colour.

### Server side

`lib/server/` is the only server code. `auth.ts` is an unfilled seam: `resolveUser` returns null (401) unless `HAPI_DEV_USER_ID` is set in non-production, so **sync does not run for anyone until an identity provider is wired in** — fill in `resolveUser` and no other file changes. Every table is keyed by `(userId, …)`; `runSync` takes `pg_advisory_xact_lock` on the account so commit order matches `seq` assignment order.

Migrations are generated, reviewed and committed — never `drizzle-kit push`, which can resolve a rename by dropping the column, and these tables hold history that exists nowhere else.

### Known gaps

`lib/sync/client.ts` gates on `NEXT_PUBLIC_SYNC_ENABLED` as a placeholder for a real session check (§13.6). Open questions are listed in DESIGN.md §12 and §13.8 — check them before "fixing" something that was decided deliberately.

DESIGN.md records reversals rather than overwriting them: §8.4 now intercepts `beforeinstallprompt` after originally refusing to. When a section reads as a reversal, the current behaviour is the one described second.
