<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/banner-dark.svg">
  <img alt="OpenHabits — a quote worth reading, a habit worth keeping, and the year you actually had." src="docs/media/banner-light.svg" width="100%">
</picture>

<br>

**A daily quote that earns its place, and a habit tracker that draws your year as a contribution grid.**

No account. No network. No spinner between you and a tick.

<br>

![MIT](https://img.shields.io/badge/license-MIT-216e39?style=flat-square)
![Next.js 16](https://img.shields.io/badge/Next.js-16.3-000?style=flat-square&logo=nextdotjs)
![React 19](https://img.shields.io/badge/React-19.2-087ea4?style=flat-square&logo=react)
![Tests](https://img.shields.io/badge/tests-353%20passing-30a14e?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-installable-6741d9?style=flat-square)

</div>

---

## Three screens, one habit loop

<table>
<tr>
<td width="33%" align="center" valign="middle">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/today-dark.png"><img alt="The Today screen: a serif quote card above five tappable habit rows" src="docs/media/today-light.png" width="100%"></picture>
</td>
<td width="33%" align="center" valign="middle">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/week-dark.png"><img alt="The Week screen: a seven-day grid of habits you can backfill" src="docs/media/week-light.png" width="100%"></picture>
</td>
<td width="33%" align="center" valign="middle">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/stats-dark.png"><img alt="The Stats screen: streak tiles above a contribution heatmap" src="docs/media/stats-light.png" width="100%"></picture>
</td>
</tr>
<tr>
<td align="center"><b>Today</b><br><sub>Read something good. Tap what you did.</sub></td>
<td align="center"><b>Week</b><br><sub>Backfill yesterday. Fix last Thursday.</sub></td>
<td align="center"><b>Stats</b><br><sub>A year of you, one square per day.</sub></td>
</tr>
</table>

<sub>Real screenshots of the app, seeded with a year of demo data — see <code>scripts/screenshots/</code>.</sub>

---

## Why this one

Most habit apps make you wait. A tick posts to a server, a spinner appears, and the thing you were supposed to do in half a second becomes a thing you stop doing.

**OpenHabits never waits.** IndexedDB is the source of truth, every route is static HTML, and a tick is a synchronous write on your own device. Aeroplane, basement, dead Wi-Fi — it does not notice.

|  | |
|---|---|
| ⚡ **Zero-latency ticks** | Mutations are synchronous and optimistic. The UI never awaits a write. |
| 📴 **Genuinely offline** | Installable PWA with a service worker. Nothing is fetched to render a day. |
| 🔒 **Your data, your device** | No account required, no telemetry, no third party. Export the lot as JSON whenever you like. |
| 🟩 **The year you had** | A GitHub-style contribution grid, streaks, perfect days, weekday and monthly trends. |
| 💬 **168 quotes, 85 facts** | Every one traceably attributed — or it doesn't ship. Swap corpora with one setting. |
| 🎨 **Three skins, any palette** | `classic`, `grid`, `blocks` × light/dark, plus a 20-token custom palette editor. |
| 🔔 **Reminders that know your clock** | 9am means 9am *where you are*, not 9am in the server's timezone. |
| ☁️ **Sync, if you want it** | Optional accounts. Turning it off costs you a second device and nothing else. |

---

## A year, one square per day

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/year-dark.png">
  <img alt="A full year of habit completions as a contribution heatmap, with a Share button" src="docs/media/year-light.png" width="100%">
</picture>

Every square is a day, shaded by how much of that day you actually finished. Rest days are a different thing from failed ones and are drawn that way; a month with nothing scheduled is an empty track, never a zero-width bar. Nothing here is stored — a full year of streaks, rates and trends is rebuilt from your entries on every render, inside the frame budget.

And the whole thing goes out as one image:

<p align="center">
  <img alt="The generated share card: title, date range, the year's grid, and three figures — 23 day streak, 61% completed, 156 perfect days" src="docs/media/share-card.png" width="88%">
</p>

<sub>Drawn by <code>lib/share-card.ts</code> onto a canvas, in your browser, from your own data.</sub>

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

**No environment variables are required.** With none set the app is fully functional: `/api/sync` and `/api/auth/*` answer 503, the client treats sync as switched off, and the only thing that changes is the Account card, which explains itself.

Node 24 (`.nvmrc`, and `engines` in `package.json`). CI runs the same version.

---

## The daily card is a deck, not a hash

<table>
<tr>
<td width="42%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/collection-dark.png"><img alt="The Collection screen: quotes and fun facts toggles, saved count, search, tag filters, and saved quotes each showing when it next comes round" src="docs/media/collection-light.png" width="100%"></picture>
</td>
<td valign="top">

Most quote apps hash the date and call it a day — which means repeats, gaps, and a different quote on your phone than on your laptop.

OpenHabits shuffles the corpus with a seeded Fisher–Yates per cycle. **Every entry appears exactly once per pass, nothing repeats within 21 days, and every device lands on the same card with no server call.** The Collection screen can tell you when a saved quote next comes round — *in 5 weeks*, *in 12 weeks* — because the sequence is knowable in advance rather than rolled on the day.

Narrow it by tag if you like; filter it down to nothing a corpus has and it falls back to the whole corpus, because the one thing the card must never be is empty.

Prefer facts to exhortation? One setting swaps the corpus. Facts run their own sequence, share one favourites list, and are held to the same sourcing bar: no traceable source, no ship.

</td>
</tr>
</table>

---

## Screens

| Route | Name | What it's for |
|---|---|---|
| `/` | **Today** | The daily card, plus today's scheduled habits as tappable rows |
| `/week` | **Week** | 7-day × N-habit grid; backfill and correct the past |
| `/stats` | **Stats** | The full contribution heatmap, streaks, completion rates, share card |
| `/settings` | **Settings** | Appearance, week start, habits, account, reminders, export/import |
| `/habit?id=` | **Habit detail** | One habit's heatmap, cadence, rename, archive, delete |
| `/quotes` | **Collection** | Everything you saved, searchable by author, source and tag |

Navigation is a fixed bottom tab bar — Today · Week · Stats · Settings. The other two are pushed views reached from within a tab.

---

## Stack

**Next.js 16.3.1** (App Router) · **React 19.2** · **Tailwind CSS v4** · **TypeScript 5** · **Vitest**
Optional accounts and sync: **Better Auth** + **Postgres** + **Drizzle**, two endpoints, **PGlite** (Postgres-in-WASM) for tests.

---

## How it works

Every route prerenders to static HTML. The only dynamic routes in the build are `POST /api/sync`, Better Auth's `/api/auth/[...all]` and the two reminder routes — none of which sit on the path of a habit tick.

```
React client components
  → lib/store.ts        in-memory cache + useSyncExternalStore
  → lib/db.ts           IndexedDB, fire-and-forget writes
  ← lib/sync/client.ts  merges server state in later
```

**The dependency runs one way**: sync imports the store; the store knows nothing about sync.

<details>
<summary><b>Decisions worth knowing before you change anything</b></summary>

<br>

- **Mutations are synchronous and optimistic.** The UI never awaits a write. A habit tick that spins is a habit that dies.
- **Dates are local civil `YYYY-MM-DD` strings.** `lib/dates.ts` is the only module that calls `new Date()` to produce one, day maths happens in UTC-space so DST can't shift a boundary, and it carries the largest share of the test suite.
- **Derived data is never persisted.** `lib/history.ts` and `lib/streaks.ts` rebuild a full year well inside the frame budget, pinned by a benchmark test.
- **Nothing user- or date-dependent renders on the server.** Routes are static and the service worker caches that HTML, so a server-computed date would pin every visitor to the build day's quote. Browser-shaped UI — the account card, the install prompt, display mode — is gated on a `useSyncExternalStore` whose *server snapshot reports the hidden case*, so it only ever appears after hydration and never flashes out of cached HTML and vanishes.
- **`public/sw.js` must never cache `/api/`.** Its stale-while-revalidate rule covers every same-origin GET, and a cached session response tells a signed-out browser it is signed in — offline, where nothing corrects it.
- **A null completion rate means "nothing was scheduled"** and is drawn as an empty track, never a zero-width bar. `weekdayExtremes` refuses to name a best and worst day below a minimum sample and spread, and that reticence is the feature.
- **Appearance never syncs.** Theme, skin and palette are device-local, read by one blocking script before first paint. A custom palette wins by being inline on `<html>`, not by specificity — which is why nothing else may write inline styles there.
- **Deletes write tombstones**, never remove rows, and the six-month TTL bounds *resurrection*, not storage.
- **Undo is one slot with a TTL**, and the store doesn't import it — `deleteHabit` returns what it removed and the caller decides whether to offer an undo.

`DESIGN.md` is the authoritative design document, kept current, and its section numbers (§7.1, §13.2, …) are referenced from module headers throughout the source. Read the relevant section before changing anything in `lib/`.

</details>

---

## Accounts and sync — optional, and it stays that way

Sync is **replication between copies of the local store**, not a move to server-authoritative data. Leaving it off costs you a second device and nothing else.

- **Identity goes through one function.** `lib/server/auth.ts:resolveUser`, with Better Auth behind it (email + password, self-hosted on the same Postgres the habits live in). It fails closed: anything but a valid session is 401. Swapping providers rewrites that function and no other file.
- **Two clocks, never compared.** `updatedAt` (client epoch ms) decides merge conflicts; `seq` (one Postgres sequence) drives the pull cursor. Conflicts are last-write-wins per record, with ties broken on a **content fingerprint** so two devices converge instead of swapping values forever — one function, `lib/sync/protocol.ts:wins`, called by the server and the client alike.
- **Signing in on a device that already has habits asks first.** The common case wants those habits in the account, and that's one button. A borrowed phone doesn't — and until it's answered nothing has been uploaded. Neither answer deletes anything.
- **Every table is under row-level security** (§13.15), and `lib/server/scope.ts` is the only way in. A query outside a scope reads nothing rather than everything. `habits`, `entries` and `users` have no bypass anywhere.
- **Passwords can be reset** where a mailer is configured: one hour, one use, every session revoked — and the same answer whether or not the address has an account.

<details>
<summary><b>Configuration</b></summary>

<br>

Setting nothing is a supported configuration. `DATABASE_URL` is what turns accounts on, and in production it brings two obligations with it: `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, each fatal when missing. `.env.example` carries the full commentary.

```bash
DATABASE_URL=postgres://…   # turns on sync and accounts; unset → 503, app unaffected
BETTER_AUTH_SECRET=         # signs session cookies; required in production
BETTER_AUTH_URL=            # the app's public origin; required in production
BETTER_AUTH_ALLOWED_HOSTS=  # instead of the above, for a multi-host deployment
SMTP_USER=                  # a Gmail app password, not the account password
SMTP_PASSWORD=
MAIL_FROM=                  # From header; defaults to "OpenHabits <SMTP_USER>"
VAPID_PUBLIC_KEY=           # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=              # mailto: or https: contact; falls back to BETTER_AUTH_URL
CRON_SECRET=                # authenticates the hourly reminder sweep

npm run db:migrate
```

**Daily reminders are an hourly cron plus a per-device timezone.** "9am" is a wall clock, so one daily invocation would only ever be nine o'clock in a single timezone; `.github/workflows/reminders.yml` calls `/api/cron/reminders` every hour and the sweep asks each subscription whether it is that user's hour *there*. Without the VAPID pair the Settings card says the deployment cannot send rather than offering a switch, and without `CRON_SECRET` the cron route refuses to run at all — it reads every account's habits, so unset means disabled, not open.

**The app is told its own origin rather than working it out.** Inferring it means reading the request's `Host` header, and that origin is what verification links are built from — while `/api/auth/send-verification-email` takes any address and no session. A forged `Host` would have this app mail a genuine link into an attacker's server. Development still infers; production fails to start accounts until `BETTER_AUTH_URL` (or `BETTER_AUTH_ALLOWED_HOSTS`) is set.

**Email verification follows the mailer, not a flag.** With SMTP credentials set, sign-up creates no session — the link in the mail does, an unverified sign-in 403s and resends on the way out, and a failed send fails the sign-up so the address isn't held hostage against a retry. With no credentials, requiring a click that no mail can deliver would break sign-up entirely, so verification is off.

For local development against a real database without signing in:

```bash
OPENHABITS_DEV_USER_ID=dev                  # every request becomes this account
OPENHABITS_DEV_USER_EMAIL=you@example.com   # optional; defaults to <id>@openhabits.local
```

This is a bypass, not a stand-in, and is ignored when `NODE_ENV=production`.

</details>

<details>
<summary><b>Deploying to Vercel</b></summary>

<br>

Zero-config: it's a stock Next app and it builds with no environment set at all — a first deploy works before the database exists, with sync and accounts answering 503. Node comes from `engines` in `package.json` (Vercel doesn't read `.nvmrc`; CI does).

Set these on the project, for Production **and** Preview:

```bash
DATABASE_URL=                # Neon's *pooled* connection string, ?sslmode=require
BETTER_AUTH_SECRET=          # a different value per environment
BETTER_AUTH_ALLOWED_HOSTS=openhabits.example,*.vercel.app
SITE_URL=https://openhabits.example   # link previews only; Production, not Preview
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=OpenHabits <you@example.com>
VAPID_PUBLIC_KEY=            # omit the pair to ship with reminders switched off
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
CRON_SECRET=                 # the scheduler sends this as the cron's Authorization header
```

**One cron job, hourly — from GitHub Actions, not Vercel.** A single entry is enough because the fan-out across timezones happens inside the sweep. What it needs is a scheduler allowing a sub-daily interval, and Vercel Cron is capped at daily below Pro. So `.github/workflows/reminders.yml` holds the schedule and curls the endpoint; it needs the repository variable `SITE_URL`, the secret `CRON_SECRET`, and the production deployment reachable without Vercel Authentication.

**`BETTER_AUTH_ALLOWED_HOSTS`, not `BETTER_AUTH_URL`.** Every preview deployment answers on its own `*.vercel.app` host, and one pinned origin would mail a preview's visitors a verification link into production.

**`regions` in `vercel.json` must match the Neon region.** It's pinned to `iad1` — every sync request is several round trips to Postgres inside one advisory-locked transaction, so a function in Virginia talking to a database in Frankfurt pays that latency several times over.

**`SITE_URL` is Production-only.** It decides what a link preview's image URL says, and a preview deployment stamping its own `*.vercel.app` host into a card that gets shared outlives the deployment it names.

**Pool through Neon's `-pooler` host.** `lib/server/db.ts` opens one connection per instance with `prepare: false` precisely so a pooler can hand out a different backend per checkout.

**Migrations do not run on deploy.** Run `npm run db:migrate` against the production `DATABASE_URL` before promoting a build that needs it — the alternative is a build step with authority over tables holding history that exists nowhere else. Give previews their own Neon branch unless you want them writing to real accounts.

**`DATABASE_URL` must not be a superuser.** Every table is under row-level security, and a role with `BYPASSRLS` ignores the lot with no error to notice. Neon's default role is fine; `postgres` on a local install is not. `db:migrate` warns when the role applying it is a superuser.

**Production is deployed from CI, not from the Git integration.** `vercel.json` sets `git.deploymentEnabled.master` to `false`, because Vercel and GitHub Actions subscribe to the same push webhook independently — left on, Vercel ships a build whose tests are still running, or have already failed. The `deploy` job in `.github/workflows/ci.yml` runs `needs: verify` and does what the integration did:

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

It needs three repository secrets — `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`. Preview branches still deploy from Git, ungated.

</details>

---

## Commands

```bash
npm run dev              # next dev
npm run build            # next build
npm start                # next start (use for Lighthouse / perf checks)
npm run lint             # eslint (flat config)
npm run typecheck        # tsc --noEmit
npm test                 # vitest run
npm run test:watch

npm run media            # regenerate the README banner in docs/media/
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

---

## Tests

**353 tests across 28 files.** No component or E2E tests — everything here is logic, reached through its own exports.

Tests live under `tests/`, mirroring the `lib/` tree they cover (`lib/sync/merge.ts` → `tests/sync/merge.test.ts`). `tests/server/sync-store.test.ts` boots a real Postgres in-process per case (PGlite) and applies the committed `drizzle/` migrations verbatim — the delicate parts of sync are all SQL-level (a sequence assigned inside `ON CONFLICT DO UPDATE`, a row-value `IN`, a composite foreign key, an advisory lock), and a test double would check none of them. `tests/server/rls.test.ts` is the only test that runs as a non-superuser role, because a superuser passes every RLS test ever written.

`tests/store.test.ts` covers the file most able to lose a year of habits. `lib/store.ts` is nearly pure — a module-level object plus `useSyncExternalStore` — so each case re-imports the module for a fresh store and stands a fake in for `lib/db.ts`; no React, and no jsdom anywhere in the suite.

**Still uncovered: `lib/db.ts`.** Testing it means a fake IndexedDB, and the only practical one is a dependency — in a module hand-rolled specifically so the persistence layer wouldn't have one. That trade is worth making deliberately rather than in passing, so it hasn't been made.

---

## Contributing

`DESIGN.md` is the authoritative design document and `ROADMAP.md` puts the open questions in order — including which are settled decisions rather than pending work. Check both before "fixing" something that was decided deliberately.

## License

MIT © [chongjie-6](https://github.com/chongjie-6)
