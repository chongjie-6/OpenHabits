# OpenHabits

A daily quote and a habit tracker, in one small app that works with the network
off and without an account. Your data lives in your browser's IndexedDB and never
leaves the device unless you export it.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # 73 unit tests
npm run build    # bundles, then prerenders every route to static HTML
npm run preview  # serves dist/ the way a static host would
npm run test:e2e # builds, serves, pulls the plug, checks it still works
```

## Screens

| Route | What it does |
| --- | --- |
| `/` | A check-in ring showing "N of M done", today's habits as tick or counter rows, your longest running streak, add-habit form, the day's quote, install prompt |
| `/week` | A 7-day × all-habits grid. Tick any cell to backfill or correct a past day; arrow back through previous weeks; per-day totals along the bottom |
| `/stats` | Contribution heatmap (20 weeks on a phone, 53 expanded), current and longest streak, perfect days, completion rate, per-habit totals. Click a day for its detail — and to fix it |
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

The same build step stamps the hashed bundle filenames into the worker, because
a shell without its script is a screenshot: the right pixels, and every button
inert. [`e2e/offline.spec.ts`](e2e/offline.spec.ts) is what keeps that honest —
it drives the built app in a real browser with the network cut, and fails on any
request the worker could not answer.

**Deleting is a tombstone, not a removal.** Every record carries `updatedAt` and
`deletedAt`, and entries are keyed `habitId:date`. That is what makes importing
the same backup twice a no-op, and what will make replication a drop-in rather
than a migration.

## Backup

Export writes one JSON file with every habit, tick and setting. Import accepts
that format and the older v1 shape, in two modes:

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
src/lib/db.test.ts          the schema ladder, at a version not yet shipped
src/screens.test.tsx        every screen renders, empty and with real data
src/interactions.test.tsx   ticking, counting, adding, backfilling, a crashed screen
e2e/offline.spec.ts         the built app, served, with the network switched off
```

## Not built yet

Accounts, sync and push reminders. Each is designed to degrade to *off* rather
than to broken: with no server configured, `syncStatus()` reports "off",
`AccountCard` says so plainly, and everything else on the device carries on
working. The data model is already replication-ready — see the tombstone note
above and [`src/lib/sync/index.ts`](src/lib/sync/index.ts).

One decision is already made and binding: **sync will be end-to-end encrypted or
it will not ship.** The server relays ciphertext it cannot open, merging happens
on the device, and a lost passphrase means lost server data. The reasoning, and
what it rules out, is written down at the top of
[`src/lib/sync/index.ts`](src/lib/sync/index.ts) — the file that would otherwise
be where the promise on line 3 of this README quietly stops being true.

## Contributing

Issues and pull requests are welcome. Everything CI runs on a push, you can run
first:

```bash
npm run lint     # eslint, no warnings
npx tsc -b       # no type errors
npm test         # all green
npm run build    # must succeed — the prerender pass checks the service worker
npm run test:e2e # the offline promise, in a real browser
```

Beyond that:

- **Derive, don't store.** If a number can be computed from habits and entries,
  compute it during render. Nothing goes in the database that could disagree with
  something else in the database.
- **Tombstone, don't delete.** Every mutation stamps `updatedAt`; every removal
  sets `deletedAt`. This is what keeps import idempotent and sync possible.
- **New colours come from [`src/index.css`](src/index.css).** No hex values in
  components — see [CLAUDE.md](CLAUDE.md) for what each role means.
- **A new route goes in [`src/route-list.ts`](src/route-list.ts) *and*
  `SHELL` in [`public/sw.js`](public/sw.js).** The build fails if they disagree
  in either direction.

## Licence

[MIT](LICENSE).
