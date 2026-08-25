# OpenHabits

A local-first PWA that pairs a **daily quote from someone worth quoting** with a **habit tracker whose history renders as a GitHub-style contribution grid**.

Ticking a habit takes one tap, zero latency and zero network. Your data lives in IndexedDB on your device, works fully offline, and needs no account. An account is available and buys exactly one thing: the same habits on a second device.

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

**No environment variables are required.** With none set, the app is fully functional: `/api/sync` and `/api/auth/*` answer 503, the client treats sync as switched off, and nothing else changes except the Account card, which explains itself.

Node 22 (`.nvmrc`, and `engines` in `package.json`). CI runs on the same version.

## Screens

| Route | Name | Purpose |
|---|---|---|
| `/` | **Today** | Quote card + today's scheduled habits as tappable rows |
| `/week` | **Week** | 7-day × N-habit grid; backfill and correct past days |
| `/stats` | **Stats** | The full contribution heatmap, streaks, completion rates |
| `/settings` | **Settings** | Theme, week start, habits, account, export/import, danger zone |
| `/habit?id=` | **Habit detail** | Single-habit heatmap, rename, cadence, archive, delete |
| `/quotes` | **Collection** | Saved quotes, searchable by author, source and tag |

Navigation is a fixed bottom tab bar (Today · Week · Stats · Settings). `/quotes` and habit detail are pushed views reached from within a tab.

## Stack

Next.js 16.3.1 (App Router) · React 19.2 · Tailwind CSS v4 · TypeScript 5 · Vitest
Accounts and sync: Better Auth + Postgres + Drizzle, two endpoints, PGlite (Postgres-in-WASM) for tests.

## How it works

**IndexedDB is the source of truth.** Every route prerenders to static HTML; the only dynamic routes in the build are `POST /api/sync` and Better Auth's `/api/auth/[...all]`. Neither sits on the path of a habit tick. Data flows one way:

```
React client components
  → lib/store.ts       in-memory cache + useSyncExternalStore
  → lib/db.ts          IndexedDB, fire-and-forget writes
  ← lib/sync/client.ts merges server state in later
```

Sync imports the store; the store knows nothing about sync.

A few decisions worth knowing before you change anything:

- **Mutations are synchronous and optimistic.** The UI never awaits a write. A habit tick that spins is a habit that dies.
- **Quotes are a deck, not a hash.** Fisher–Yates per cycle, seeded deterministically, so every quote appears once per pass and none repeats within 21 days — identical on every device, with no server call. 168 attributed quotes ship in `data/quotes.ts`.
- **Dates are local civil `YYYY-MM-DD` strings.** `lib/dates.ts` is the only module that calls `new Date()` to produce one, and it carries the largest share of the test suite (month/year boundaries, leap years, DST in both directions).
- **Derived data is never persisted.** `lib/history.ts` and `lib/streaks.ts` rebuild a full year well inside the frame budget, pinned by a benchmark test.
- **Nothing user- or date-dependent renders on the server.** Routes are static and the service worker caches that HTML, so a server-computed date would pin every visitor to the build day's quote, and a server-read session would hand one visitor's account state to the next. Anything browser-shaped — the account card, the install prompt, display mode — is gated on a `useSyncExternalStore` whose *server snapshot reports the hidden case*, so that UI only ever appears after hydration and never flashes out of cached HTML and vanishes.
- **`public/sw.js` must never cache `/api/`.** Its stale-while-revalidate rule covers every same-origin GET, and a cached session response tells a signed-out browser it is signed in — offline, where nothing corrects it. The early return for the API prefix is load-bearing.
- **The theme is the one server-side exception:** a blocking inline script in `<head>` reads `localStorage` pre-paint, so theme is mirrored there as well as into IndexedDB.

`DESIGN.md` is the authoritative design document, kept current, and its section numbers (§7.1, §13.2, …) are referenced from module headers throughout the source. Read the relevant section before changing anything in `lib/`.

## Accounts and sync (optional)

Sync is **replication between copies of the local store**, not a move to server-authoritative data. Leaving it off costs you a second device and nothing else.

**Identity goes through one function**, `lib/server/auth.ts:resolveUser`, with Better Auth behind it (email + password, self-hosted on the same Postgres the habits live in). It fails closed: anything but a valid session is 401. Swapping providers rewrites that function and no other file.

**Whether a client syncs is "is someone signed in"**, answered per device from a localStorage hint in `lib/session.ts`. The hint has no authority — it only buys permission to make a request the server may still 401, and the 401 path clears it. Never gate anything security-relevant on it.

**Two clocks drive replication, and they are never compared:** `updatedAt` (client epoch ms) decides merge conflicts; `seq` (one Postgres sequence) drives the pull cursor. Conflicts are last-write-wins per record, with ties broken on a content fingerprint so two devices converge instead of swapping values forever — one function, `lib/sync/protocol.ts:wins`, called by the server and the client alike. Deletes write tombstones rather than removing rows. Signing out wipes the device, having synced first. See DESIGN.md §13.

### Configuration

Setting nothing is a supported configuration. `DATABASE_URL` is what turns accounts on, and in production it brings two obligations with it: `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, each fatal when missing. `.env.example` carries the full commentary.

```bash
DATABASE_URL=postgres://…   # turns on both sync and accounts; unset → 503, app unaffected
BETTER_AUTH_SECRET=         # signs session cookies; required in production
BETTER_AUTH_URL=            # the app's public origin; required in production
BETTER_AUTH_ALLOWED_HOSTS=  # instead of the above, for a multi-host deployment
SMTP_USER=                  # a Gmail app password, not the account password
SMTP_PASSWORD=

npm run db:migrate
```

**The app is told its own origin rather than working it out.** Inferring it means reading the request's `Host` header, and that origin is what verification links are built from — while `/api/auth/send-verification-email` takes any address and no session. A forged `Host` would have this app mail a genuine link into an attacker's server, carrying a token that `autoSignInAfterVerification` turns into a session. Development still infers; production fails to start accounts until `BETTER_AUTH_URL` (or `BETTER_AUTH_ALLOWED_HOSTS`, for several hosts) is set. See DESIGN.md §13.11.

**Email verification follows the mailer, not a flag.** With SMTP credentials set, sign-up creates no session — the link in the mail does (`autoSignInAfterVerification`), an unverified sign-in 403s and resends on the way out, and a failed send fails the sign-up so the address is not held hostage against a retry. With no credentials, requiring a click that no mail can deliver would break sign-up entirely, so verification is off and a send error is logged and swallowed.

For local development against a real database without signing in:

```bash
OPENHABITS_DEV_USER_ID=dev                  # every request becomes this account
OPENHABITS_DEV_USER_EMAIL=you@example.com   # optional; defaults to <id>@openhabits.local
```

This is a bypass, not a stand-in, and is ignored when `NODE_ENV=production`.

## Commands

```bash
npm run dev              # next dev
npm run build            # next build
npm start                # next start (use for Lighthouse / perf checks)
npm run lint             # eslint (flat config)
npm run typecheck        # tsc --noEmit
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

117 tests across 10 files, covering pure logic only — there are no component or E2E tests.

Tests live under `tests/`, mirroring the `lib/` tree they cover (`lib/sync/merge.ts` → `tests/sync/merge.test.ts`), and reach their subjects through the `@/` alias. `tests/server/sync-store.test.ts` boots a real Postgres in-process per case (PGlite) and applies the committed `drizzle/` migrations verbatim — hence the 30s timeout. The delicate parts of sync are all SQL-level (a sequence assigned inside `ON CONFLICT DO UPDATE`, a row-value `IN`, a composite foreign key, an advisory lock), and a test double would check none of them.

## Layout

```
app/            routes (all static) + the two endpoints:
                  api/sync/route.ts    replication — the only one touching user data
                  api/auth/[...all]/   sign-up, sign-in, sign-out, session
components/     PascalCase files exporting PascalCase components
lib/            kebab-case modules — the domain logic
  sync/         wire protocol, merge rules, client runner
  server/       the only server-side code: schema, db, auth seam, sync store
data/quotes.ts  168 attributed quotes
drizzle/        generated, reviewed, committed migrations
tests/          mirrors lib/
public/sw.js    runtime-caching service worker (no build-time precache)
```

**`lib/server/auth-schema.ts` tables are separate from `schema.ts:users` on purpose.** `user` is the identity Better Auth owns; `users` is the account sync rows cascade from. Same id, no foreign key, linked by the upsert in `sync-store.ts`. Merging them would give a dependency's migrations authority over the table every habit hangs off.

**Migrations are generated, reviewed and committed — never `drizzle-kit push`.** Push can resolve a rename by dropping the column, and these tables hold history that exists nowhere else.

**Four storage keys still say `hapi`, deliberately** — `lib/db.ts:DB_NAME`, `lib/theme.ts:THEME_KEY`, `lib/session.ts:HINT_KEY` and the `hapi_sync_seq` sequence. Each names data that already exists on a device or in Postgres; renaming them orphans habits, flashes the wrong theme, or migrates a live counter. They are not leftovers to tidy up.

## Known gaps

- **No password reset.** A confirmed address was the prerequisite and now exists; the flow does not. Until it does, a forgotten password means the habits on that device are reachable only through Export backup — which the sign-up form says out loud rather than leaving to be discovered.
- **Signing in merges whatever is on the device into the account** (§13.8 #8). Right for the common case — someone who used the app signed out and then made an account — and wrong for a borrowed phone.
- **Settings sync as one blob, `theme` included**, so a device-local look becomes a global one.
- Reminders, conflict surfacing and tombstone collection are absent by decision, not oversight. DESIGN.md §12 and §13.8 hold the reasoning.

`ROADMAP.md` sequences all of the above — what is worth doing, in what order, and which of these gaps are decisions to leave alone rather than work to pick up.

## Contributing

- `.github/workflows/ci.yml` runs `lint` → `typecheck` → `test` → `build` on every push and pull request, with no environment supplied — a build that needs a variable has broken the promise that all of them are optional. Run the same four locally before pushing.
- Read the relevant `DESIGN.md` section first. §12 and §13.8 list open questions — check them before "fixing" something that was decided deliberately.
- DESIGN.md records reversals rather than overwriting them. When a section reads as a reversal, the current behaviour is the one described second (§13.10 reverses §13.9 on verification; §8.4 reverses its own original refusal to intercept `beforeinstallprompt`).
- Comments explain the non-obvious — an invariant, a workaround, a reason the straightforward version is wrong. If a comment would only paraphrase the line under it, delete it.
- Components are PascalCase (file and export); `lib/` modules stay kebab-case.
- `--muted` passes WCAG AA with no headroom. Never apply an opacity modifier to it — if something needs to recede further, give it a smaller role, not a thinner colour.
