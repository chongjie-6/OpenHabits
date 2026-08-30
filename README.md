# OpenHabits

A daily quote and a habit tracker, in one small app that works with the network
off and without an account. Your data lives in your browser's IndexedDB and never
leaves the device unless you export it.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 72 tests
npm run build    # bundles, then prerenders every route to static HTML
npm run preview  # serves dist/ the way a static host would
```

## Screens

| Route | What it does |
| --- | --- |
| `/` | The day's quote (save it or don't), today's habits with tick or counter rows, "N of M done", your longest running streak, the last seven days, add-habit form, install prompt |
| `/week` | A 7-day × all-habits grid. Tick any cell to backfill or correct a past day; arrow back through previous weeks; per-day totals along the bottom |
| `/stats` | Contribution heatmap (20 weeks on a phone, 53 expanded), current and longest streak, perfect days, completion rate, per-habit totals. Click a day for its detail — and to fix it |
| `/quotes` | All 168 quotes plus a saved tab. Search text, author or source, filter by tag, and see when each quote next comes round |
| `/settings` | Theme, week start, day-rollover hour, habit reorder and archive, account, reminders, JSON export/import, reset |
| `/habit?id=` | One habit's own year heatmap, streaks, cadence in plain English, edit, archive, delete |

## How it works

**IndexedDB is the source of truth.** The whole dataset — a year of ten habits is
a few thousand rows — is read into memory once at boot and written back behind
the UI. That is what lets streaks, heatmaps and completion rates be *derived
during render* rather than cached. Nothing that can be computed is stored, so
nothing can go stale or disagree with itself.

**The daily quote is arithmetic, not a request.** The corpus is a deck, shuffled
by a seed derived from the cycle number and dealt one card a day
([`src/lib/quotes.ts`](src/lib/quotes.ts)). Every cycle deals all 168 quotes, no
quote reappears within 30 days (the seams between cycles are repaired to
guarantee it), and every device computes the same answer for the same date with
no network at all.

**Streaks forgive what they should.** Rest days step over a streak rather than
breaking it — a Mon/Wed/Fri habit is not "missed" on a Tuesday. Today is forgiven
while it is still in progress, so an untouched morning never shows a broken
streak. An n-times-per-week habit is judged by the *week*, not the day: no single
day can be a miss, and the streak counts satisfied weeks
([`src/lib/streaks.ts`](src/lib/streaks.ts)).

**Every route is real static HTML.** After the bundle is built,
[`scripts/prerender.mjs`](scripts/prerender.mjs) does an SSR pass and writes
`dist/week/index.html`, `dist/stats/index.html` and so on. The service worker
([`public/sw.js`](public/sw.js)) caches that shell stale-while-revalidate, so
every route opens offline, straight from the cache, before any JavaScript runs.

**Deleting is a tombstone, not a removal.** Every record carries `updatedAt` and
`deletedAt`, and entries are keyed `habitId:date`. That is what makes importing
the same backup twice a no-op, and what will make replication a drop-in rather
than a migration.

## Backup

Export writes one JSON file with every habit, tick, saved quote and setting.
Import accepts that format and the older v1 shape, in two modes:

- **Merge** — per-record last-write-wins on `updatedAt`, tombstones respected.
  Importing the same file twice changes nothing.
- **Replace** — wipe, then install the file. No undo.

## Layout

```
src/
  lib/
    types.ts       the vocabulary: Habit, Entry, Cadence, Settings
    date.ts        local-calendar maths, noon-anchored against DST
    db.ts          IndexedDB, with an ordered write queue
    store.ts       the in-memory mirror React subscribes to
    repo.ts        every mutation, each stamping updatedAt
    quotes.ts      the deck shuffle + quotes-data.ts (the 168)
    streaks.ts     current/longest streaks, rest days, cadences
    history.ts     day totals, perfect days, heatmap grids
    backup.ts      export, parse, merge
    sync/          the seam where replication will go
  components/      QuoteCard, HabitRow, Heatmap, DayDetail, HabitForm, …
  routes/          one file per screen
public/
  sw.js            hand-written service worker
  manifest.webmanifest, icon.svg + generated PNGs
scripts/
  prerender.mjs    SSR pass → one HTML file per route
  gen-icons.mjs    icon.svg → PNGs (run only when the icon changes)
```

## Tests

```
src/lib/date.test.ts        rollover hour, week start, DST boundaries
src/lib/quotes.test.ts      permutation, minimum gap, seams, next appearance
src/lib/streaks.test.ts     rest days, today forgiven, the three cadences
src/lib/backup.test.ts      v1 migration, merge idempotency, tombstones
src/screens.test.tsx        every screen renders, empty and with real data
src/interactions.test.tsx   ticking, counting, adding, backfilling, archiving
```

## Not built yet

Accounts, sync and push reminders. Each is designed to degrade to *off* rather
than to broken: with no server configured, `syncStatus()` reports "off",
`AccountCard` says so plainly, and everything else on the device carries on
working. The data model is already replication-ready — see the tombstone note
above and [`src/lib/sync/index.ts`](src/lib/sync/index.ts).
