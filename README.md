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

<sub>Real screenshots, seeded with a year of demo data — see <code>scripts/screenshots/</code>.</sub>

---

## Why this one

Most habit apps make you wait: a tick posts to a server, a spinner appears, and the thing you were supposed to do in half a second becomes a thing you stop doing. **OpenHabits never waits.** IndexedDB is the source of truth, every route is static HTML, and a tick is a synchronous write on your own device.

|  | |
|---|---|
| ⚡ **Zero-latency ticks** | Mutations are synchronous and optimistic. The UI never awaits a write. |
| 📴 **Genuinely offline** | Installable PWA with a service worker. Nothing is fetched to render a day. |
| 🔒 **Your data, your device** | No account required, no telemetry, no third party. Export the lot as JSON. |
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

Every square is a day, shaded by how much of it you finished. Rest days are a different thing from failed ones and are drawn that way; a month with nothing scheduled is an empty track, never a zero-width bar. Nothing here is stored — a full year of streaks, rates and trends is rebuilt on every render, inside the frame budget.

And the whole thing goes out as one image, drawn by `lib/share-card.ts` onto a canvas in your browser, from your own data:

<p align="center">
  <img alt="The generated share card: title, date range, the year's grid, and three figures — 23 day streak, 61% completed, 156 perfect days" src="docs/media/share-card.png" width="88%">
</p>

---

## Three skins, and then your own colours

A skin is a **layout** decision, not a palette swap: `grid` puts your year above the fold and gives every habit its own history strip, `blocks` throws away the soft edges for tiles you can hit without looking. The mutation underneath all three is the same function.

<table>
<tr>
<td width="33%" align="center" valign="middle">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/today-dark.png"><img alt="The classic skin: a serif quote card above roomy habit rows" src="docs/media/today-light.png" width="100%"></picture>
</td>
<td width="33%" align="center" valign="middle">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/skin-grid-dark.png"><img alt="The grid skin: the year's heatmap on top, dense habit rows with per-habit history strips, the quote demoted to a footnote" src="docs/media/skin-grid-light.png" width="100%"></picture>
</td>
<td width="33%" align="center" valign="middle">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/skin-blocks-dark.png"><img alt="The blocks skin: hard edges, an inverted quote panel and big two-column habit tiles" src="docs/media/skin-blocks-light.png" width="100%"></picture>
</td>
</tr>
<tr>
<td align="center"><b><code>classic</code></b><br><sub>Cards, soft edges, one column.</sub></td>
<td align="center"><b><code>grid</code></b><br><sub>Your year up top, dense rows below.</sub></td>
<td align="center"><b><code>blocks</code></b><br><sub>Hard edges and big tiles.</sub></td>
</tr>
</table>

<table>
<tr>
<td width="40%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/palette-editor-dark.png"><img alt="The Colours screen: six preset seeds, a live preview showing a quote card and a habit row, and the derived surface hexes beneath" src="docs/media/palette-editor-light.png" width="100%"></picture>
</td>
<td valign="top">

**One colour builds the whole set.** Pick a seed and `lib/palette.ts` derives all 20 tokens from it — surfaces take a trace of the hue, text and accents are solved *against* the surface they land on, and the result is checked so it clears WCAG AA whichever colour you picked. A palette is always complete for both light and dark; a partial one is rejected rather than left to fall through to the skin underneath.

It wins by being inline on `<html>`, which beats every skin's stylesheet without a single `!important` — so no skin has to know palettes exist.

**None of this syncs, on any axis.** Theme, skin and palette are device-local and read by one blocking script before first paint — your phone can be dark `blocks` while your laptop is light `classic`. Only *behaviour* rides the synced settings blob.

</td>
</tr>
</table>

---

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

**No environment variables are required.** With none set the app is fully functional: `/api/sync` and `/api/auth/*` answer 503, the client treats sync as switched off, and the only thing that changes is the Account card, which explains itself. Node 24 (`.nvmrc`, and `engines` in `package.json`).

To turn on accounts, sync or reminders, see **[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)** and `.env.example`.

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

## How it works

**Next.js 16.3.1** (App Router) · **React 19.2** · **Tailwind CSS v4** · **TypeScript 5** · **Vitest**. Optional accounts and sync: **Better Auth** + **Postgres** + **Drizzle**, two endpoints, **PGlite** (Postgres-in-WASM) for tests.

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
- **Every table is under row-level security**, and `lib/server/scope.ts` is the only way in. A query outside a scope reads nothing rather than everything. `habits`, `entries` and `users` have no bypass anywhere.
- **Passwords can be reset** where a mailer is configured: one hour, one use, every session revoked — and the same answer whether or not the address has an account.

Configuration, the hourly reminder cron and the Vercel deployment are all in **[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**.

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

npx vitest run tests/sync/merge.test.ts     # one file
npx vitest run -t "takes the later write"   # one case
```

---

## Tests

**353 tests across 28 files.** No component or E2E tests — everything here is logic, reached through its own exports, and there is no jsdom in the suite. Tests mirror the `lib/` tree they cover (`lib/sync/merge.ts` → `tests/sync/merge.test.ts`).

`tests/server/sync-store.test.ts` boots a real Postgres in-process per case (PGlite) and applies the committed `drizzle/` migrations verbatim — the delicate parts of sync are all SQL-level (a sequence assigned inside `ON CONFLICT DO UPDATE`, a row-value `IN`, a composite foreign key, an advisory lock), and a test double would check none of them. `tests/server/rls.test.ts` is the only test that runs as a non-superuser role, because a superuser passes every RLS test ever written.

**Still uncovered: `lib/db.ts`.** Testing it means a fake IndexedDB, and the only practical one is a dependency — in a module hand-rolled specifically so the persistence layer wouldn't have one. That trade is worth making deliberately rather than in passing, so it hasn't been made.

---

## Contributing

Start with **[`CONTRIBUTING.md`](.github/CONTRIBUTING.md)**. `DESIGN.md` is the authoritative design document and `ROADMAP.md` puts the open questions in order — including which are settled decisions rather than pending work. Check both before "fixing" something that was decided deliberately.

By taking part you agree to the [Code of Conduct](.github/CODE_OF_CONDUCT.md). Security vulnerabilities go through [`SECURITY.md`](.github/SECURITY.md), never a public issue.

## License

MIT © [chongjie-6](https://github.com/chongjie-6)
