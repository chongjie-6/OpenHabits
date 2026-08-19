# hapi

A local-first PWA that pairs a **daily quote from someone worth quoting** with a **habit tracker whose history renders as a GitHub-style contribution grid**.

Ticking a habit takes one tap, zero latency and zero network. Your data lives in IndexedDB on your device, works fully offline, and needs no account.

```
  morning                     during the day                evening
  ┌──────────────┐            ┌──────────────┐             ┌──────────────┐
  │ open app     │            │ tap to tick  │             │ see the grid │
  │ read quote   │  ───────►  │ a habit done │  ─────────► │ gain a square│
  └──────────────┘            └──────────────┘             └──────────────┘
         ▲                                                        │
         └────────────────── streak pressure ─────────────────────┘
```

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

No environment variables are required. With none set, the app is fully functional — sync is the only thing that turns off.

## Screens

| Route | Name | Purpose |
|---|---|---|
| `/` | **Today** | Quote card + today's scheduled habits as tappable rows |
| `/week` | **Week** | 7-day × N-habit grid; backfill and correct past days |
| `/stats` | **Stats** | The full contribution heatmap, streaks, completion rates |
| `/settings` | **Settings** | Theme, week start, habits, export/import, danger zone |
| `/habit?id=` | **Habit detail** | Single-habit heatmap, rename, cadence, archive, delete |
| `/quotes` | **Collection** | Saved quotes, searchable by author, source and tag |

Navigation is a fixed bottom tab bar (Today · Week · Stats · Settings). `/quotes` and habit detail are pushed views reached from within a tab.

## Stack

Next.js 16.3.1 (App Router) · React 19.2 · Tailwind CSS v4 · TypeScript 5 · Vitest
Sync: Postgres + Drizzle, one endpoint, PGlite (Postgres-in-WASM) for tests.

## How it works

**IndexedDB is the source of truth.** Every route prerenders to static HTML; `POST /api/sync` is the only dynamic route in the build. Data flows one way:

```
React client components
  → lib/store.ts     in-memory cache + useSyncExternalStore
  → lib/db.ts        IndexedDB, fire-and-forget writes
  ← lib/sync/client.ts merges server state in later
```

Sync imports the store; the store knows nothing about sync.

A few decisions worth knowing before you change anything:

- **Mutations are synchronous and optimistic.** The UI never awaits a write. A habit tick that spins is a habit that dies.
- **Quotes are a deck, not a hash.** Fisher–Yates per cycle, seeded deterministically, so every quote appears once per pass and none repeats within 21 days — identical on every device, with no server call. 168 attributed quotes ship in `data/quotes.ts`.
- **Dates are local civil `YYYY-MM-DD` strings.** `lib/dates.ts` is the only module that calls `new Date()` to produce one, and it carries the largest share of the test suite (month/year boundaries, leap years, DST in both directions).
- **Derived data is never persisted.** `lib/history.ts` and `lib/streaks.ts` rebuild a full year well inside the frame budget, pinned by a benchmark test.
- **Nothing user- or date-dependent renders on the server.** Routes are static and the service worker caches that HTML, so a server-computed date would pin every visitor to the build day's quote. The theme is the one exception: a blocking inline script reads `localStorage` pre-paint.

`DESIGN.md` is the authoritative design document, kept current, and its section numbers (§7.1, §13.2, …) are referenced from module headers throughout the source. Read the relevant section before changing anything in `lib/`.

## Sync (optional, and currently off)

Sync is **replication between copies of the local store**, not a move to server-authoritative data. It is built and tested below an auth seam, but **does not run for anyone yet**: `lib/server/auth.ts:resolveUser` returns null until an identity provider is wired in, and the endpoint answers 401. Fill in that one function and no other file changes.

Two clocks drive it, and they are never compared: `updatedAt` (client epoch ms) decides merge conflicts, `seq` (one Postgres sequence) drives the pull cursor. Conflicts are last-write-wins per record, with ties broken on a content fingerprint so two devices converge instead of swapping values forever. Deletes write tombstones rather than removing rows. See DESIGN.md §13.

To run it locally:

```bash
DATABASE_URL=postgres://…        # unset → /api/sync answers 503, app unaffected
NEXT_PUBLIC_SYNC_ENABLED=1       # client-side gate (placeholder for a session check)
HAPI_DEV_USER_ID=dev             # single-user dev identity; ignored when NODE_ENV=production
HAPI_DEV_USER_EMAIL=you@example.com   # optional, defaults to <id>@hapi.local

npm run db:migrate
```

## Commands

```bash
npm run dev              # next dev
npm run build            # next build — also the typecheck; there is no separate script
npm start                # next start (use for Lighthouse / perf checks)
npm run lint             # eslint (flat config)
npm test                 # vitest run
npm run test:watch

npm run icons            # regenerate public/icon-*.png + app/apple-icon.png
npm run db:generate      # drizzle-kit generate — write a migration
npm run db:migrate       # drizzle-kit migrate — apply committed migrations
npm run db:studio
```

Single test file or case:

```bash
npx vitest run tests/sync/merge.test.ts
npx vitest run -t "takes the later write"
```

## Tests

113 tests across 9 files, covering pure logic only — there are no component or E2E tests.

Tests live under `tests/`, mirroring the `lib/` tree they cover (`lib/sync/merge.ts` → `tests/sync/merge.test.ts`), and reach their subjects through the `@/` alias. `tests/server/sync-store.test.ts` boots a real Postgres in-process per case (PGlite) and applies the committed `drizzle/` migrations verbatim — hence the 30s timeout. The delicate parts of sync are all SQL-level, and a test double would check none of them.

## Layout

```
app/            routes (all static) + app/api/sync/route.ts, the only endpoint
components/     PascalCase files exporting PascalCase components
lib/            kebab-case modules — the domain logic
  sync/         wire protocol, merge rules, client runner
  server/       the only server-side code: schema, db, auth seam, sync store
data/quotes.ts  168 attributed quotes
drizzle/        generated, reviewed, committed migrations
tests/          mirrors lib/
public/sw.js    runtime-caching service worker (no build-time precache)
```

**Migrations are generated, reviewed and committed — never `drizzle-kit push`.** Push can resolve a rename by dropping the column, and these tables hold history that exists nowhere else.

## Contributing

- Read the relevant `DESIGN.md` section first. §12 and §13.8 list open questions — check them before "fixing" something that was decided deliberately.
- DESIGN.md records reversals rather than overwriting them. When a section reads as a reversal, the current behaviour is the one described second.
- Components are PascalCase (file and export); `lib/` modules stay kebab-case.
- `--muted` passes WCAG AA with no headroom. Never apply an opacity modifier to it — if something needs to recede further, give it a smaller role, not a thinner colour.
