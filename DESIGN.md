# hapi — Design Document

A local-first PWA that pairs a **daily quote from someone worth quoting** with a **habit tracker** whose history renders as a GitHub-style contribution grid.

- **Status:** phases 0–6 built and passing; §11 has what remains. Sync (§13) runs: the auth seam is filled (§13.6) and an account is created from the Settings screen.
- **Stack:** Next.js 16.3.1 (App Router), React 19.2, Tailwind CSS v4, TypeScript 5, Vitest
- **Sync stack:** Postgres + Drizzle, Better Auth for identity, PGlite for tests (§13)
- **Last updated:** 2026-08-23

> Sections marked **Revised during build** record where implementation contradicted the plan. They are kept rather than overwritten — the reasoning that turned out to be wrong is usually the reasoning most worth having on the record.

---

## 1. Goals

| # | Goal | Why it matters |
|---|---|---|
| G1 | Ticking a habit takes **one tap, zero latency, zero network** | The single most common action in the app. If it ever spins, the habit dies. |
| G2 | The history heatmap is the **emotional payoff** | People keep streaks because they can *see* them. The grid is the product, not a stats page. |
| G3 | A quote every day that feels **chosen, not random** | No repeats until the deck is exhausted; same quote on every device the user owns. |
| G4 | Installs to the home screen and **works fully offline** | It's a morning-routine app. It gets opened on a train, in a gym, on airplane mode. |
| G5 | The user's data is **theirs** — exportable, no account required | Removes signup friction entirely and sidesteps a whole class of privacy work in v1. |

### Non-goals (v1)

- Accounts, login, or cross-device sync (see §12 for the v2 path that the schema already accommodates) — **both halves have since been built: sync in §13, and the accounts it hangs off in §13.6. Still optional in the sense that matters: signed out, the app is exactly the app described here.**
- Social features — sharing, friends, leaderboards
- Quantified goals beyond a simple per-day count (no durations, no timers)
- Native app store distribution

---

## 2. Product shape

### 2.1 The core loop

```
  morning                     during the day                evening
  ┌──────────────┐            ┌──────────────┐             ┌──────────────┐
  │ open app     │            │ tap to tick  │             │ see the grid │
  │ read quote   │  ───────►  │ a habit done │  ─────────► │ gain a square│
  └──────────────┘            └──────────────┘             └──────────────┘
         ▲                                                        │
         └────────────────── streak pressure ─────────────────────┘
```

Everything else in the app is in service of that loop. A screen that doesn't feed it is a candidate for deletion.

### 2.2 Screens

| Route | Name | Purpose | Built |
|---|---|---|---|
| `/` | **Today** | Quote card + today's scheduled habits as tappable rows | ✅ |
| `/week` | **Week** | 7-day × N-habit grid; backfill and correct past days | ✅ |
| `/stats` | **Stats** | The full contribution heatmap, streaks, completion rates | ✅ |
| `/settings` | **Settings** | Theme, week start, habits, export/import, danger zone | ✅ |
| `/habit?id=` | **Habit detail** | Single-habit heatmap, rename, cadence, archive, delete | ✅ |
| `/quotes` | **Collection** | Saved quotes, searchable by author, source and tag | ✅ |

> **Revised during build.** Habit detail is `/habit?id=…`, not `/habit/[id]`. Habit ids are client-generated UUIDs the server has never heard of, so a dynamic segment could never be prerendered: every new habit would become a server round-trip, and opening one offline would fail until the service worker happened to have cached that exact URL. A search parameter keeps it a single static page, available offline the moment the shell is.

Navigation is a fixed bottom tab bar (**Today · Week · Stats · Settings**) with `padding-bottom: env(safe-area-inset-bottom)` so it clears the iOS home indicator in standalone mode. `/quotes` and `/habit/[id]` are pushed views reached from within a tab, not tabs themselves.

### 2.3 Wireframes

**Today (mobile, 390px)**

```
┌─────────────────────────────────┐
│  Thursday, 14 August        ⚙︎  │
│                                 │
│  ┌───────────────────────────┐  │
│  │ "It is not that we have   │  │  ← quote card
│  │  a short time to live,    │  │    serif, generous leading
│  │  but that we waste a lot  │  │    tap ♡ to save to collection
│  │  of it."                  │  │
│  │                           │  │
│  │  — SENECA          ♡  ⤴︎  │  │
│  └───────────────────────────┘  │
│                                 │
│  TODAY            3 of 5 done   │
│  ┌───────────────────────────┐  │
│  │ 🏃  Run            ● ✓    │  │  ← 56px row, whole row is the
│  │ 📖  Read 20 pages  ● ✓    │  │    tap target
│  │ 🧘  Meditate       ● ✓    │  │
│  │ 💧  Water × 8    ○ 5/8 +  │  │  ← counted habit: + increments
│  │ ✍️  Journal        ○      │  │
│  └───────────────────────────┘  │
│                                 │
│  ▓▓▒▓▓░▓  7-day streak 🔥       │  ← mini strip, taps → /stats
│                                 │
│ ┌───┬───┬───┬───┐               │
│ │Tdy│Wk │Sts│Set│               │
│ └───┴───┴───┴───┘               │
└─────────────────────────────────┘
```

**Week**

```
        Mon Tue Wed Thu Fri Sat Sun
🏃 Run   ✓   ✓   ·   ✓   ·   ✓   ○     ← "·" = not scheduled (rest day)
📖 Read  ✓   ✓   ✓   ✓   ✓   ✓   ○     ← "○" = future, not yet actionable
🧘 Med   ✓   ✗   ✓   ✓   ○   ○   ○     ← "✗" = scheduled and missed
💧 Water 8   6   8   5   ○   ○   ○
        ───────────────────────────
        100% 75% 100% 88%
```

Any cell up to and including today is tappable to toggle. Future cells are inert and rendered at 40% opacity.

---

## 3. Data model

All dates are **local civil dates**, serialized `YYYY-MM-DD`. Never store UTC timestamps for day membership — a 23:00 tick in UTC+11 must land on the local day the user experienced, not the day before.

```ts
// lib/types.ts

/** 'YYYY-MM-DD' in the user's local timezone. */
type DayKey = string;

type Cadence =
  | { kind: "daily" }
  | { kind: "weekdays"; days: number[] }   // 0=Sun … 6=Sat
  | { kind: "weekly"; times: number };     // n times per week, any days

type Habit = {
  id: string;              // crypto.randomUUID()
  name: string;
  emoji: string;
  color: HabitColorKey;    // key into the palette in §6.2
  cadence: Cadence;
  target: number;          // 1 for a simple tick; >1 for counted habits
  order: number;           // manual sort position
  createdAt: DayKey;
  archivedAt: DayKey | null;
  updatedAt: number;       // epoch ms — added by §13; LWW merge key
  deletedAt: number | null;// epoch ms — tombstone, see §13.4
};

type Entry = {
  habitId: string;
  date: DayKey;
  count: number;           // 0 … target (or beyond; overachieving is allowed)
  updatedAt: number;       // epoch ms — last-write-wins merge key for v2 sync
};

type Quote = {
  id: string;              // stable slug, e.g. "seneca-short-time"
  text: string;
  author: string;
  source?: string;         // "On the Shortness of Life", 49 AD
  tags: QuoteTag[];        // "discipline" | "resilience" | "craft" | …
};

type Settings = {
  theme: "system" | "light" | "dark";
  weekStartsOn: 0 | 1;     // Sunday or Monday
  dayStartHour: number;    // 0–6; 4 means "the day rolls over at 4am"
  favourites: string[];    // saved quote ids
};
```

**Entry key is `${habitId}:${date}`** — a compound primary key. This makes "did I do X on day D" an O(1) point lookup and makes an idempotent toggle trivially safe to replay.

**Absence is meaningful.** No `Entry` row means "not logged", which is distinct from `count: 0` ("explicitly un-ticked"). Only the compound key exists.

> **Revised by §13.** "There are no tombstones" held only while the data lived on one device. Once it replicates, a missing row and a row the peer has not seen yet are the same observation, so `Habit` gained `deletedAt` and deleting writes a tombstone. Entries still have none, and for a reason worth reading: see §13.4.

### 3.1 Derived data (never stored)

| Value | Derivation |
|---|---|
| `isScheduled(habit, day)` | Pure function of `cadence` + weekday + `createdAt`/`archivedAt` bounds |
| `dayScore(day)` | `completed / scheduled`, or `null` if nothing was scheduled |
| `level(day)` | `dayScore` bucketed to 0–4 (§4.2) |
| `currentStreak` | Consecutive days back from today where `dayScore === 1`, skipping `null` days |
| `longestStreak` | Same scan over the full history |

Storing derived values is the main way this kind of app rots. A single `recomputeStats()` over ~5,000 entries runs in under 2ms, which is well inside a frame budget, so it is recomputed from scratch on every mutation and memoized on the store version counter.

---

## 4. The contribution heatmap

This is the signature component. It gets its own section because "GitHub squares" hides a half-dozen real decisions.

### 4.1 Geometry

**Desktop / ≥640px — classic horizontal.** Columns are weeks, rows are weekdays.

```
       Sep   Oct   Nov   Dec   Jan   Feb   Mar
 Mon   ░▓▒░░ ▓▓░▒▓ ░░▓▓▒ ▒▓░░▓ ▓▒░▓░ ░▓▓▒░ ▓░▒▓
       ░░▓▒▓ ░▒▓▓░ ▓▒░░▓ ░▓▓▒░ ▒░▓░▓ ▓▓░▒▒ ░▓▓░
 Wed   ▓▒░░▓ ▓░▒░▓ ░▓▒▓░ ▓░░▓▒ ░▓▒▓▓ ░▒▓░▓ ▒░▓▓
       ▒▓▓░░ ░▓▓▒░ ▓░▓▒▓ ▒▓░▒░ ▓░░▓▒ ▓░▒▓░ ▓▒░░
 Fri   ░░▒▓▓ ▒░░▓▓ ▒▓░░▒ ░▒▓▓░ ▒▓▓░░ ░▓░▒▓ ░▓▒▓
       ▓▓░▒░ ▓▒▓░▒ ▓░▒▓▓ ▓░▒░▓ ░░▓▒▓ ▒▓░░▒ ▓░░▒
       ░▒▓▓▒ ░░▓▒░ ▒▓▓░░ ▓▒░▓▓ ▓▒░░▒ ░░▓▓▒ ▒▓▓░
                            Less ░▒▓█ More
```

- Cell 11px, gap 3px, `rx: 2`. 53 columns × 7 rows = 371 cells.
- Month labels sit above the first column whose week contains the 1st of that month.
- Weekday labels on alternating rows only (Mon/Wed/Fri), matching GitHub — full labels crowd the gutter.

**Mobile / <640px — transposed.** 7 columns (weekdays) × N rows (weeks), flowing **vertically** with the rest of the page, oldest week at the top.

A horizontally-scrolling year grid on a phone is a well-known annoyance: it traps vertical scroll, hides most of the data, and fights the page. Transposing costs one media query and makes the whole thing a natural part of the page flow. Cells go to 18px with a 5px gap for thumb-sized hit areas, and the mobile view defaults to the trailing 20 weeks with a "Show full year" expander.

> **Revised during build.** An earlier draft put the newest week at the top, on the theory that recent activity should not need scrolling. That was solving a problem the layout does not have: because the grid sits in normal page flow rather than its own scroller, the whole block is reachable with the page scroll, and reversing time only makes the calendar harder to read. Chronological order stands.

### 4.2 Level mapping

```ts
function level(score: number | null): 0 | 1 | 2 | 3 | 4 | "rest" {
  if (score === null) return "rest";   // nothing was scheduled that day
  if (score === 0) return 0;
  if (score < 0.34) return 1;
  if (score < 0.67) return 2;
  if (score < 1) return 3;
  return 4;                             // everything scheduled, done
}
```

**Rest days are not failures.** A day with no scheduled habits renders as a hollow square with a 1px border rather than an empty fill, so a deliberate rest reads visually differently from a skipped day. Streaks step over rest days without breaking.

**Two grids, two rules for counted habits.** In the aggregate grid a counted habit is all-or-nothing: it is either done or it isn't, and it contributes one unit to the day's score. In a single habit's own grid (`buildHabitHistory`) the level comes straight from `count / target`, so 5-of-8 is visibly different from 1-of-8. The distinction is not arbitrary — the aggregate score is *already* a fraction, and a fraction of a fraction is not readable off an 11px square. Per-habit, there is only one fraction to show.

**Per-habit ramps are mixed, not hand-tuned.** Rather than six hand-built five-step scales in two themes, the habit grid mixes its accent toward the empty-cell colour in `oklab` at 30 / 55 / 78 / 100%. One formula, perceptually even steps, and both themes fall out of it.

Days before `createdAt` of every habit — i.e. before the user started — render at level `"rest"` with no tooltip. The grid should not imply a year of failure to someone who installed the app yesterday.

### 4.3 Rendering

**One `<svg>`, 371 `<rect>` elements, one delegated event listener on the root.** Not 371 React components with 371 handlers — that's ~15ms of hydration and a needlessly large commit on every tick. The rects are keyed by `data-date`; the listener reads `event.target.dataset.date`.

The grid re-renders only when the store version changes. `useMemo` keys on `[storeVersion, habitFilter, weekStartsOn]`.

**Selection, not a tooltip.** An earlier draft specified a hover tooltip on desktop and a bottom sheet on touch — two mechanisms for one job, and the hover half is unreachable on the platform most users are on. Instead a cell click selects the day and opens one panel below the grid, on every input type. The panel lists that day's habits as live rows, so the grid doubles as the backfill surface: seeing a gap and fixing it are the same gesture. The accessible name on each cell already carries the summary a tooltip would have shown.

### 4.4 Accessibility

Color alone must never carry the level. The grid is a `role="grid"` with `role="gridcell"` rects, each with:

```
aria-label="14 August 2026: 3 of 4 habits completed"
```

Keyboard support uses **roving tabindex** — the grid holds a single tab stop, and arrow keys move a virtual cursor between cells (`←/→` by day, `↑/↓` by week, `Home`/`End` to week bounds, `PageUp`/`PageDown` by month). `Enter` opens that day's detail sheet.

A visually-hidden `<table>` alternative is *not* needed; the labelled grid is sufficient and cheaper. But the Stats page must also present the same information as text ("You completed 82% of scheduled habits over the last 30 days"), because a 371-cell grid is a poor primary read for a screen reader user regardless of labelling.

---

## 5. Quote selection

### 5.1 The deck algorithm

The requirement is "feels chosen": no repeat until every quote has been shown, identical output on every device, and no server call.

A plain `hash(date) % N` fails this — the birthday problem means duplicates appear within weeks. Instead, treat the corpus as a deck that is reshuffled once per full pass:

```ts
const EPOCH = "2026-01-01";

function quoteForDay(day: DayKey, deck: Quote[]): Quote {
  const i = daysBetween(EPOCH, day);       // integer day index
  const cycle = Math.floor(i / deck.length);
  const pos = ((i % deck.length) + deck.length) % deck.length;  // handles i < 0
  const shuffled = shuffle(deck, mulberry32(hashCycle(cycle)));
  return shuffled[pos];
}
```

`shuffle` is Fisher–Yates driven by `mulberry32`, a 32-bit PRNG that is ~10 lines and deterministic across engines.

> **Revised during build — the seam.** A per-cycle shuffle guarantees each quote appears once per pass, and says *nothing* about the join between passes. The last quote of one cycle can open the next, and "I read that two days ago" is exactly the experience the deck exists to prevent. `deckForCycle` therefore pushes anything shown in the closing `k` days of the previous cycle out of the opening `k` positions of this one, with `k = ⌊size / 8⌋`.
>
> To avoid recursing back through every cycle that ever was, swap targets are drawn from `[k, size − k)` and never touch the final `k` slots — which is what makes the previous cycle's tail readable off its *raw* shuffle. The guarantee is now stated exactly, in both the code and the UI: every quote appears once per pass, and no quote can repeat within `k` days (currently 21).
>
> This was found by a test written for something else. `upcomingSchedule` originally scanned one deck length forward and asserted full coverage; it reached 131 of 168, because a window starting mid-cycle is the tail of one shuffle plus the head of a different one. It now scans two cycles, which is guaranteed to contain one whole aligned cycle.

Consequences worth noting:
- **Stateless.** Nothing is persisted about which quotes have been seen. Reinstalling the app doesn't reset or disturb the sequence.
- **Time travel works.** "Yesterday's quote" and next week's are computable, which makes the `/quotes` archive view free.
- **Filtering by tag changes the deck**, and therefore the sequence. Accepted: a user who filters is asking for a different stream. The filtered deck is derived at boot and cached.

### 5.2 Corpus

`data/quotes.ts` — a typed module rather than JSON, so the tag union is checked at compile time instead of trusted at runtime.

It ships in the client bundle. The original plan kept it server-side and sent only the rendered quote across the boundary, but the day has to be resolved on the client (§7.1), so the selection function has to run there too. At roughly 150 bytes an entry this is a few KB gzipped — cheap enough that the archive view gets to be free as well.

**Sourcing constraint:** every quote must have a verifiable attribution with a `source` field where one exists. Misattributed quotes are the standard failure mode of this genre of app (Einstein, Twain, Gandhi and Emerson get credited with roughly everything). A quote whose attribution can't be traced doesn't ship, and where a popular attribution is *wrong* but the line is worth keeping, a `note` field carries the correction rather than propagating the error — "We are what we repeatedly do" is filed under Will Durant, who wrote it, not Aristotle, who didn't. `lib/quotes.test.ts` asserts that specific correction so it can't silently regress.

The corpus is **168 verified quotes**, spanning antiquity through the twentieth century. That is a full pass every 168 days with a guaranteed 21-day minimum gap — short of the ~400 the algorithm would like, and the remaining distance is the honest limit of what could be attributed with confidence rather than a lack of effort. Getting to 400 means checking candidates against primary sources; padding it with plausible-sounding lines would defeat the point of having the constraint at all.

Two tests guard the corpus: ids are unique, and no two entries share the same opening text (a duplicate slipping in would quietly break the no-repeat property).

---

## 6. Visual design

### 6.1 Foundations

| Token | Value | Use |
|---|---|---|
| Type — display | Geist Sans, 600, `-0.02em` | Screen titles, numbers |
| Type — quote | A serif (Newsreader or Lora), 400, `1.55` leading | Quote body only |
| Type — UI | Geist Sans, 400/500 | Everything else |
| Type — numeric | Geist Mono, `tabular-nums` | Streak counts, percentages |
| Radius | `8px` controls, `16px` cards, `2px` heatmap cells | |
| Spacing | 4px base scale: 4 · 8 · 12 · 16 · 24 · 32 · 48 | |
| Min hit target | 44 × 44px | Non-negotiable on touch |

The serif for quotes is deliberate — it separates "something to think about" from "something to do" without needing a border or a label.

### 6.2 Color

Defined as CSS custom properties on `:root` in `app/globals.css`, consumed through Tailwind v4's `@theme`. Light is the base definition; dark overrides only the tokens that change, under both `@media (prefers-color-scheme: dark)` and `[data-theme="dark"]` so the manual toggle wins in both directions.

Heatmap ramp (the neutral "all habits" scale):

```
level 0   #ebedf0 / dark #161b22   ← empty
level 1   #9be9a8 / dark #0e4429
level 2   #40c463 / dark #006d32
level 3   #30a14e / dark #26a641
level 4   #216e39 / dark #39d353
rest      transparent + 1px border in --border
```

Per-habit views recolor the ramp using the habit's `color` key. Six habit colors ship (green, blue, violet, amber, rose, teal), each with a validated 5-step ramp in both themes. Level 1 must clear 3:1 contrast against the page background in both themes — the palest step is where these ramps normally fail.

### 6.3 Motion

Motion exists to confirm the tick and to reward the streak. Everything else is instant.

| Interaction | Treatment |
|---|---|
| Tick a habit | Checkbox scales `1 → 1.15 → 1` over 180ms, `cubic-bezier(.34,1.56,.64,1)`; row background flashes the habit color at 8% opacity |
| Completing the last habit of a day | Grid cell pulses once; a brief confetti burst, capped at 12 particles and once per day |
| Tab change | Cross-fade 120ms, no slide (slides fight the browser's back gesture) |
| Streak increment | Number rolls up with `tabular-nums` so the layout doesn't jitter |

All of the above is wrapped in `@media (prefers-reduced-motion: reduce)` → duration 0, state change only. The reduced-motion path must still *confirm* the action; it just does it without animating.

---

## 7. Architecture

### 7.1 Local-first, with a static shell

IndexedDB is the source of truth. There is no server-side data in v1, which shapes how the Next.js layer is used:

```
┌─ Server Components (static, prerendered) ─────────────┐
│  • App shell: nav, layout, headers                     │
│  • Nothing user- or date-dependent (see below)         │
└───────────────────────┬────────────────────────────────┘
                        │ children / props
┌───────────────────────▼────────────────────────────────┐
│  Client Components                                     │
│  • <StoreProvider> hydrates from IndexedDB on mount    │
│  • Habit list, week grid, heatmap, all mutations       │
└───────────────────────┬────────────────────────────────┘
                        │ read/write
┌───────────────────────▼────────────────────────────────┐
│  lib/store.ts — in-memory cache + write-through to IDB  │
│  useSyncExternalStore subscription, version counter     │
└────────────────────────────────────────────────────────┘
```

**Hydration safety.** Server Components cannot read IndexedDB, so any component whose output depends on user data must render a skeleton on the server and the real value after mount. Mismatches here produce exactly the flash this app can least afford — a checked box appearing unchecked for 200ms reads as data loss. The store exposes `hydrated`; every data-dependent subtree gates on it.

**The date is client state too, and this is the trap.** The quote card was originally specified as a Server Component so it would land in the first paint. It cannot be. Every route here prerenders to static HTML, so a server-computed date pins *every* visitor to the build day's quote until the next deploy — and request-time rendering would not save it either, because the service worker serves that HTML from cache afterwards. Showing the wrong quote and then correcting it is worse than showing none for a beat, so the card renders a fixed-height placeholder until mount. The selection is pure and synchronous, so it lands on the first client render rather than waiting on IndexedDB.

The current day is exposed through `useToday()`, a `useSyncExternalStore` subscription rather than a `setState` in an effect. The clock genuinely is an external system: React uses the server snapshot (`null`) through hydration and switches over cleanly afterwards, with no mismatch and no cascading render — and subscribing to `visibilitychange` means an app left open on a bedside table at 23:59 rolls over correctly at 00:01. React 19's `react-hooks/set-state-in-effect` rule flags the effect-based version, and it is right to.

The theme class is the one thing that must beat hydration entirely, and it is set by a tiny blocking inline script in `<head>` before paint, per the Next guide at `01-app/02-guides/preventing-flash-before-hydration.md`. Because IndexedDB is async and cannot be read before paint, the theme is mirrored to `localStorage` purely so that script has something synchronous to read.

### 7.2 The store

```ts
// lib/store.ts
let state: { habits: Habit[]; entries: Map<string, Entry>; settings: Settings };
let version = 0;

export function toggle(habitId: string, date: DayKey) {
  const key = `${habitId}:${date}`;
  const cur = state.entries.get(key)?.count ?? 0;
  const habit = getHabit(habitId);
  const next = cur >= habit.target ? 0 : cur + 1;   // cycles 0→1→…→target→0

  state.entries.set(key, { habitId, date, count: next, updatedAt: Date.now() });
  version++;
  emit();                    // synchronous — UI updates this frame
  void persist(key);         // fire-and-forget IDB write
}
```

The optimistic path is the *only* path. The UI never awaits the write. An IDB failure surfaces as a non-blocking toast and a retry queue; it does not roll back the UI, because on a local database a failed write is a bug to fix rather than a state the user should have to reason about.

Subscription goes through `useSyncExternalStore` — correct under React 19 concurrent rendering, and free of the tearing that an ad-hoc `useState` + event emitter would introduce.

### 7.3 Persistence

- **No wrapper library.** The original plan called for `idb`. The surface actually needed — open, `getAll` ×3, `put`, `delete`, `clear` — came to about 60 lines of `lib/db.ts`, which is less than the supply chain costs. Object stores: `habits` (keyPath `id`), `entries` (keyPath `["habitId","date"]`), `kv` (settings and other singletons). Deleting a habit's entries uses a bounded `IDBKeyRange` on the compound key rather than scanning the store.
- **Request persistent storage** on first habit creation: `navigator.storage.persist()`. Without it, IndexedDB sits in the evictable bucket and a year of streaks can be reclaimed under storage pressure. This is the single highest-value line of code in the persistence layer.
- **Export/import** as a versioned JSON blob (`{ version: 1, habits, entries, settings }`) from Settings. This is the v1 backup story and the v1 device-migration story. Import is offered as merge-by-`updatedAt` or full replace.
- **Migrations** keyed on the IDB `version` integer, with a documented upgrade function per version bump.

---

## 8. PWA layer

Per `01-app/02-guides/progressive-web-apps.md` in this Next version.

### 8.1 Manifest

`app/manifest.ts` — the App Router file convention, typed as `MetadataRoute.Manifest`.

```ts
{
  name: "hapi — daily quotes & habits",
  short_name: "hapi",
  start_url: "/",
  display: "standalone",
  background_color: "#ffffff",
  theme_color: "#216e39",
  icons: [
    { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ],
  shortcuts: [{ name: "Log today", url: "/" }, { name: "Stats", url: "/stats" }],
}
```

A **maskable** icon is required, not optional — Android crops non-maskable icons into a circle and will eat the logo's edges. Keep the mark inside the 40% safe zone.

### 8.2 Service worker

A hand-written worker at `public/sw.js`, ~80 lines, **runtime caching only**:

| Request | Strategy |
|---|---|
| Navigations | Network-first, falling back to the cached shell |
| `/_next/static/*` | Cache-first — the filenames are content-hashed, so they are immutable |
| Other same-origin GETs | Stale-while-revalidate |
| User data | **Never touched by the SW** — it lives in IndexedDB |

The plan named **Serwist**, which the Next PWA guide points to. It is the right tool when you need a precise precache manifest with revision-hashed invalidation, and it is the documented upgrade path here. It is not what this app needs yet: precaching buys correctness in the gap between "asset changed" and "cache noticed", and content-hashed filenames already close that gap. Runtime caching gets full offline after one visit with no build-time coupling to keep in sync.

Because the data layer is entirely client-side, "offline" is nearly the whole app for free. The SW's only job is delivering the shell; there is no data-sync layer to reconcile.

It is registered only in production builds — a caching worker in development turns every HMR update into a debugging session about stale assets.

`next.config.ts` gets the headers block from the guide's §8: `no-cache` on the service worker file, `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: strict-origin-when-cross-origin`.

### 8.3 `useOffline`

Not needed in v1 — there are no server round-trips to fail. It becomes relevant the moment v2 sync lands, at which point `experimental.useOffline` in `next.config.ts` plus the `useOffline()` hook from `next/offline` gives connectivity-aware fallbacks and automatic retry of failed Server Actions. Noted here so the v2 work knows the hook exists rather than hand-rolling retries.

### 8.4 Install prompt

**Reversed.** The original decision, per the guide's recommendation, was no `beforeinstallprompt` interception: it isn't supported on iOS Safari, so a hand-rolled button produces a two-tier experience — a real button on Chromium and nothing on the platform that most needs the help. What shipped instead was a passive text hint (`InstallHint`).

That reasoning holds only if the second tier is *nothing*. `components/DownloadAppButton.tsx` handles the split rather than avoiding it, so the app now does intercept:

- **Chromium** — `beforeinstallprompt` is caught at module scope (it fires before React hydrates, and only once) and `preventDefault()`ed, so the browser's own bar does not compete with ours. The button replays it on click. The event is one-shot: once spent, the state falls back to the manual sheet.
- **Everywhere else** — a `<dialog>` with the actual steps, keyed off the user agent, because "tap Share" is wrong advice in Chrome on iOS (the menu is under ⋯) and useless inside the Instagram or TikTok webview, which cannot install at all. That last case gets a **Copy link** button instead, which is the only thing that helps there.

Install state is exposed through `useSyncExternalStore` over `matchMedia("(display-mode: standalone)")` plus iOS Safari's older `navigator.standalone`. **The server snapshot claims "already installed"**, so no install UI is in the prerendered HTML — it only ever appears, never disappears, which keeps §2's static-prerender rule intact. `InstallCard` (same module) is the Settings-screen presentation and is gated on the same state, so the card never wraps a button that rendered null.

### 8.5 Reminders — a known limitation

**The web cannot reliably schedule a purely local notification.** The Notification Triggers API never shipped broadly, and a service worker cannot wake itself on a timer. There are two honest options:

1. **v1 — in-app only.** A gentle "you haven't logged today" banner when the app is opened after the reminder time. Zero infrastructure, zero permissions, no false promises.
2. **v2 — real push.** Web Push with VAPID keys, `web-push` on the server, and a stored subscription per device. Works on iOS 16.4+ *only for home-screen-installed apps*. This requires a server and a scheduler, which pulls the app out of its zero-backend posture — hence v2.

**Shipped:** neither, and the Settings screen says so in plain words. The Today tab already surfaces what is outstanding the moment the app opens, which is option 1 without pretending it is a reminder. A "Daily reminder at 8:00" toggle that silently doesn't fire would be the worst available outcome.

### 8.6 Page metadata

The root layout owns the shared half: `title.template` (`"%s · hapi"`), the description, `applicationName`, `appleWebApp`, `formatDetection`, and an `openGraph`/`twitter` pair. Each route then adds its own `title` and `description`.

Two constraints shape where that per-route metadata lives.

1. **`title.template` applies to child segments, never to the segment that declares it.** So the root `title.default` *is* the Today title; `app/page.tsx` exports no metadata of its own.
2. **`metadata` is only read from Server Components**, and `/week`, `/stats`, `/settings` and `/quotes` are all client components — they own screen-local state (selected week, expanded habit, search text). Rather than split each screen into a server shell plus a client body, each gets a `layout.tsx` that exports the metadata and returns `children` unchanged. It adds a segment and no markup.

`/habit` is `robots: { index: false, follow: false }`: the habit comes from `?id=`, so the bare URL a crawler would index renders nothing.

**No `metadataBase`, and no OG image.** There is no canonical origin for the app yet, and every URL-based metadata field — `alternates.canonical`, `openGraph.images` — needs one, resolving against `localhost` and warning at build time without it. The OG cards carry title, description and `siteName` only, which is honest and warning-free. Setting `metadataBase` is the first thing to do when a domain exists.

---

## 9. File structure

As built:

```
app/
  layout.tsx              root shell, theme script, hydrator, bottom nav
  page.tsx                Today
  manifest.ts             MetadataRoute.Manifest
  apple-icon.png          generated
  week/page.tsx
  week/layout.tsx         route Metadata only — see §8.6
  stats/page.tsx
  stats/layout.tsx        route Metadata only
  habit/page.tsx          Suspense wrapper + Metadata — see the note in §2.2
  quotes/page.tsx
  quotes/layout.tsx       route Metadata only
  settings/page.tsx
  settings/layout.tsx     route Metadata only
  globals.css             tokens, ramps, @theme mapping, safe-area utilities

components/
  AppChrome.tsx           Hydrator + BottomNav
  QuoteCard.tsx           client — see §7.1 for why
  TodayList.tsx
  HabitRow.tsx            the tick target
  HabitForm.tsx           shared by create and edit, plus describeCadence
  AddHabit.tsx            thin wrapper over HabitForm
  HabitDetail.tsx         per-habit grid, editing, archive, delete
  Heatmap.tsx             SVG, delegated events, both orientations, legend
  DownloadAppButton.tsx   install prompt, per-browser instructions sheet, InstallCard

lib/
  types.ts                domain types + DEFAULT_SETTINGS + Synced metadata
  store.ts                in-memory cache + useSyncExternalStore + mutations
  db.ts                   IndexedDB, migrations, requestPersistence
  dates.ts                DayKey maths, week bounds, dayStartHour, formatting
  history.ts              cadence evaluation, day rollups, per-habit history
  streaks.ts
  quotes.ts               deck algorithm, seam repair, upcoming schedule
  colors.ts               ramp lookups, neutral and per-habit
  theme.ts                pre-paint script + localStorage mirror
  session.ts              the auth client + the local signed-in hint (§13.6)
  email.ts                nodemailer SMTP transport, built per send (§13.9)
  verification-email.ts   the verification mail: tables, inline styles, no images
  use-today.ts            the clock as external state
  use-media-query.ts
  *.test.ts               tests over the pure logic

  sync/                   §13 — replication between copies of the local store
    protocol.ts           wire types, the two clocks, LWW + tiebreaker
    merge.ts              pure merge and push selection
    validate.ts           hand-written payload validation for a public endpoint
    client.ts             single-flight runner + useSync triggers

  server/                 the only server-side code in the app
    schema.ts             Drizzle/Postgres tables
    db.ts                 lazily built, globally cached connection
    auth.ts               the identity seam — see §13.6
    auth-types.ts         SyncUser alone, so sync-store imports no auth
    better-auth.ts        what fills the seam: config + lazy instance
    auth-schema.ts        Better Auth's tables, kept apart from `users`
    sync-store.ts         push/pull inside one locked transaction

app/api/sync/route.ts     replication — the only endpoint touching user data
app/api/auth/[...all]/    sign-up, sign-in, sign-out, session

drizzle/                  generated, reviewed, committed migrations
data/quotes.ts            168 attributed quotes
scripts/generate-icons.mjs
public/sw.js
```

**One form, not two.** `HabitForm` is shared between creating and editing. Two forms over the same fields drift: the edit screen gains a cadence option the add screen never got, and they end up disagreeing about defaults.

**Reordering respects the visible list.** Active and archived habits render as separate lists, so `moveHabit` swaps `order` values within a habit's own group. Stepping over an archived neighbour would look like the button had done nothing.

`lib/dates.ts` is the file most likely to harbour bugs. It is pure, is the **only** place `new Date()` is called with the intent of producing a `DayKey`, and carries the largest share of the test suite: month and year boundaries, leap years, DST transitions in both directions, and the `dayStartHour` rollover under fake timers.

Two design decisions turned out to be load-bearing and are pinned by tests: the weekly-quota cadence (§12, question 1) and the streak rules (rest days stepped over, the final day forgiven while it is still in progress).

---

## 10. Accessibility & performance

**Accessibility**

- 44×44px minimum touch targets throughout; habit rows are 56px.
- WCAG AA contrast on all text; heatmap levels carry `aria-label`, never color alone.
- Focus rings visible on every interactive element — a 2px ring offset 2px, never `outline: none` without a replacement.
- Full keyboard path: tab to habit row, `Space` to tick; roving tabindex inside the grid.
- `prefers-reduced-motion` honored globally.
- The Stats page states its headline numbers in prose as well as in the grid.

**Performance budgets**

| Metric | Budget | Measured |
|---|---|---|
| First-load JS, `/` (gzip) | < 200KB | **192.3KB** |
| — of which framework baseline | — | ~152KB (3 shared chunks) |
| — of which application code | < 50KB | ~40KB |
| First-load JS, `/quotes` (gzip) | < 200KB | 189.5KB |
| LCP on mid-tier Android, 4G | < 1.8s | **2.8s** — over; see below |
| INP for a habit tick | < 50ms | still unmeasured — needs a device |
| Heatmap pipeline, 371 days × 5 habits | < 8ms | **2.16ms** ✅ |
| — same at 20 habits | — | 4.17ms |

Measured in the phase-7 audit (§11) with Lighthouse 13.4.1, mobile emulation, simulated Slow 4G and 4× CPU throttling, against `next start`. Scores: **performance 95–96, accessibility 100, best practices 100, SEO 100** across `/`, `/week`, `/stats`, `/settings`, `/quotes`. CLS is 0–0.004 and TBT 40–50ms everywhere — both comfortably good.

The heatmap figure covers the `buildHistory` → `computeStreaks` pipeline, pinned by `tests/history.bench.test.ts`. It scales sub-linearly (4× the habits costs 2.4× the time), so the O(n²) regression the budget exists to catch would be caught. Paint cost is not included and still needs a real device.

> **LCP is over budget for a structural reason, not a fixable one.** The LCP element is the quote `<blockquote>`, and §7.1 forbids rendering it on the server — a static prerender would pin every visitor to the build day's quote. So LCP cannot fire until the JS has loaded and hydrated: unthrottled the breakdown is 7ms TTFB and 144ms element render delay, and the 2.8s figure is that pipeline under Lighthouse's deliberately pessimistic mobile simulation.
>
> Three ways out, and the first is probably right. **(a) Move the budget** — 1.8s was set before anything was measured, and it silently assumed a server-rendered hero the design had already ruled out. **(b) Shrink the critical path** — 152KB of the 192KB is the React + App Router baseline, so this means leaving the App Router, exactly as noted above. **(c) Put text in the placeholder** so something contentful paints sooner. (c) is metric-gaming: it would improve the number without the user seeing their quote any earlier, and it is recorded here to be rejected, not adopted.

**Known measurement gap.** Every Lighthouse run above was against an *empty* IndexedDB, because the CLI cannot seed it. The heatmap rendered zero cells and no habit row was ever ticked. The benchmark covers the computation at a year of data, but the DOM cost of ~371 SVG cells and the INP of a real tick are both unmeasured, and are the two things a device test exists to find.

> **The 100KB budget in the original draft was wrong**, and worth recording rather than quietly restating. It was set without checking the floor: React 19 plus the Next 16 App Router client runtime is ~152KB gzipped before a line of application code, and 7 of the 8 chunks on `/` are shared across every route. Application code is the part actually under our control, so that is what now carries a budget; the total gets a ceiling that leaves room to notice regressions.
>
> Getting under 100KB total would mean leaving the App Router, not trimming features. That is a real option for an app this client-heavy — worth revisiting only if field LCP disappoints.

The tick budget is still the one that matters. It's met by keeping the mutation synchronous and the persistence fire-and-forget.

---

## 11. Build order

| Phase | Scope | Status |
|---|---|---|
| **0 — Foundations** | `dates.ts`, `types.ts`, `db.ts`, `store.ts`, tokens | ✅ |
| **1 — Core loop** | Today screen, habit CRUD, tick, bottom nav | ✅ |
| **2 — Heatmap** | SVG grid, both layouts, selection panel, legend, streaks | ✅ |
| **3 — Quotes** | Corpus, deck algorithm, quote card, favourites | ✅ |
| **4 — PWA** | Manifest, generated icons, service worker, headers, install hint | ✅ |
| **5 — Polish** | Week screen, export/import, Settings, motion, empty states | ✅ |
| **6 — Depth** | Habit detail, quote collection, corpus expansion | ✅ 58 tests green |
| **7 — Field** | Lighthouse, a11y audit, install test on real iOS/Android | 🟡 partial |

Phase 5's Week screen and Settings came forward because deleting a habit and backing up data are not polish — a tracker you cannot correct or export is not one you would trust with a year.

**Phase 7, done and not done.**

Done in the audit: Lighthouse across all five routes, a systematic contrast audit of every token pairing, the heatmap benchmark in §10, and PWA installability verified (manifest complete with 192/512/maskable icons and shortcuts, `sw.js` serving `install`/`activate`/`fetch` under `no-store` and its own CSP).

Three defects found and fixed:

1. **Contrast.** Every `text-muted/80` and `text-muted/70` in the codebase failed WCAG AA for normal text — 2.64:1 at worst, against a 4.5:1 requirement, in *both* themes. Lighthouse caught only the one instance that happened to be on the Today page; the other six came out of computing the ratios for all token pairings directly, and all seven are gone. `--muted` at full opacity passes everywhere with little headroom, which is now recorded in `globals.css` so it does not regress.
2. **An unlabelled file input.** The backup importer's `sr-only` `<input type="file">` had no accessible name and was still in the tab order, so a keyboard user landed on an invisible, unnamed control. Named, and taken out of the tab order — the visible button beside it is the real affordance.
3. **A console error on every page load.** The §13 sync client posted to `/api/sync` unconditionally and took a 503, which the browser logs regardless of how the JS handles it. Gated behind `NEXT_PUBLIC_SYNC_ENABLED` so the request path compiles out entirely when sync is off. This also removes what would have been a 401 on every load for every signed-out visitor once auth lands.

Accessibility, best practices and SEO are 100 on every route after those fixes.

**Still not done, and it needs hardware.** No real iOS or Android device has run this. Every measurement above used an empty IndexedDB — the CLI cannot seed it — so the heatmap rendered no cells and no habit was ever ticked. The two budgets that matter most for G1 and G2, INP on a tick and the paint cost of a full grid, remain unmeasured. A dead-simple version of this test is worth more than more tooling: install to a home screen, add five habits, backfill a month, tick something, and watch.

One investigated non-finding, recorded so it is not chased twice: Lighthouse reports 13KB of "legacy JavaScript" (polyfills for `Array.prototype.at`, `Object.hasOwn` and five siblings). They live in Next's own framework chunk, not application code. Raising the tsconfig `target` and adding a modern `browserslist` changed the bundle by 0.5KB — within noise — because `noEmit: true` means TypeScript's `target` never touches the shipped output at all. Both changes were reverted; the browserslist would have narrowed browser support for nothing.

---

## 12. Risks & open questions

| Risk | Mitigation |
|---|---|
| **Storage eviction wipes a year of streaks** | `navigator.storage.persist()` early; nag toward export backup after 30 days of use |
| **iOS Safari clears data after 7 days of non-use** | Real constraint for infrequent users. Export/import is the v1 answer; account-backed sync is the v2 answer |
| **Quote misattribution** | Every entry needs a traceable source before it ships; no unverified quotes |
| **Timezone travel** | Entries are stamped with local civil dates. Flying across the date line can produce a same-day double-count; accepted as rare and harmless |
| **The grid looks bleak for new users** | Pre-`createdAt` days render as neutral rest cells, not failures; the mobile default shows 26 weeks, not 52 |

**Resolved during the build**

1. ~~**Should a "weekly, n times" habit fill the grid partially every day, or fully on the days it's done?**~~ **Settled as proposed:** it contributes to `scheduled` only until its weekly quota is met, then becomes a rest day for the rest of the week. Front-loading the week is rewarded, not punished. Pinned by four tests in `lib/history.test.ts`, including the case where the quota interacts with the user's chosen week start.
4. ~~**Counted habits in the heatmap.**~~ **Settled as all-or-nothing:** a counted habit is `done` only at `count >= target`, and contributes to the day's score as one unit either way. Partial credit inside a partial score turned out to be two different fractions stacked on each other, which is more precision than anyone can read off a 11px square. The progress bar on the habit row carries the within-day detail instead.

6. ~~**Habit editing lives in Settings.**~~ **Moved.** Settings lists habits and reorders them; everything else — rename, emoji, colour, cadence, target, archive, delete — lives on the habit's own screen, reachable from both Settings and the Stats breakdown. Delete was removed from Settings rather than duplicated, so there is one destructive path, not two.

**Still open**

2. **Deck size.** 168 verified quotes against a target of ≥400. Every further entry needs checking against a primary source; the bar (§5.2) matters more than the number, so this closes slowly or not at all. At 168 the app promises "once per pass, no repeat within 21 days", which is a true claim and a decent one.
3. **Does the confetti survive contact with real users, or is it the first thing they turn off?** Not built — the tick pop and the streak strip carry the reward for now. Ship it behind a setting, default on, and watch.
5. **Is the forgiven final day too generous?** The current streak does not break until a missed day is a *past* day. It reads correctly at 9am and slightly flattering at 11pm. An alternative is to forgive only until some hour of the evening.
7. **Archiving takes effect immediately**, so a habit archived after being ticked today leaves an entry that is kept but no longer counted. The alternative — archiving from tomorrow — keeps today's grid intact but makes the button feel unresponsive. Worth revisiting if anyone notices.
8. **Should Today link to a habit's detail screen?** Currently not: the row is the tick target, and a second affordance inside it would put a 44px link inside a 56px button. Detail is reachable from Stats and Settings instead.

---

## 13. Sync

The v2 path §12 promised, built. It answers the two risks v1 could only mitigate: storage eviction (iOS clears data after 7 days of non-use) and the absence of cross-device continuity.

### 13.1 What it does not change

IndexedDB is still the source of truth. Sync is **replication between copies of the local store**, not a move to server-authoritative data, and the shape of §7.1 is untouched: every route still prerenders to static HTML, every mutation still lands in memory synchronously and on disk fire-and-forget, and no screen awaits a network call. With `DATABASE_URL` unset the endpoint answers 503, the client treats sync as off, and the app is the app from v1.

There is exactly one endpoint — `POST /api/sync` — and it is the only dynamic route in the build. No `GET /habits`, no per-record writes, no server rendering of user data.

### 13.2 Two clocks

The one decision everything else follows from.

Every synced record carries `updatedAt`, epoch ms from the device that made the edit. It decides merges: later write wins.

It cannot also be the pull cursor. Device clocks disagree, sometimes by hours. A phone five minutes slow writes an entry stamped 10:00; the laptop has already pulled through 10:03; a cursor built from `updatedAt` steps straight over that entry and loses the day permanently — no error, no retry, no way to notice.

So the server stamps every row with `seq`, from one Postgres sequence. `seq` moves the cursor, `updatedAt` decides conflicts, and the two are never compared. Keeping the jobs in separate fields is the whole trick.

**The sequence is not a usable cursor on its own.** Values are handed out when a statement runs; rows become visible when the transaction commits. Two concurrent syncs can commit in the opposite order to their assignment, and a client pulling through the gap saves the higher seq and steps over the lower one forever. Each sync therefore takes `pg_advisory_xact_lock` on the account, making commit order match assignment order. The contention is one person's two or three devices.

### 13.3 Conflict resolution

Last-write-wins per record, with a tiebreaker that is not optional.

"Incoming wins ties" is broken, quietly: two devices writing the same record in the same millisecond each see the *other* value as incoming, so each takes the other's. They swap rather than converge, and stay disagreed with no error anywhere. Ties are therefore broken on the record's **content** — both peers compare the same two records with the same rule and reach the same answer. Which value wins is arbitrary; that both pick the same one is the point.

The rule lives once, in `lib/sync/protocol.ts`, and the server uses the same function the client does. It is deliberately *not* expressed as SQL in the upsert: the tiebreaker would then exist in two languages, and convergence would depend on the two staying exactly in step. Instead the server reads, decides in TypeScript, and writes — safe because of the per-account lock, and bounded because the rows read are bounded by the size of the push.

Granularity is per record, not per field. Two devices editing the same habit's name and colour between syncs will lose one of the two edits. Field-level merging would fix that and is not worth its weight: this is one person's habit tracker, and the losing edit is a rename they can redo.

### 13.4 Deletion needs tombstones

On a replicated store, a missing row and a row the peer has not seen yet are the same observation. A hard delete is therefore re-learned from the server on the next pull, and the habit comes back with its history.

So `Habit` gained `deletedAt`. Deleting writes a tombstone; the habit leaves every screen immediately, but the row survives to tell other devices. Entries carry no tombstone — an entry is never individually deleted ("not done" is `count: 0`, which merges like any other value), and a habit's tombstone already tells every peer to drop that habit's entries. A tombstone per entry would carry no extra information while multiplying synced rows by the length of the user's history.

Two consequences worth stating plainly. **Reset everything** now propagates: on a synced account a local-only wipe would be undone by the next pull, so the button writes tombstones for every habit. And **backups omit tombstones** — a backup is what the user has, not a log of what they discarded.

### 13.5 Resumability

Both directions are capped at 500 records per request. A first sync of a multi-year account does not fit in one response and is not asked to: the server truncates, reports `more: true`, and leaves the cursor short so the next round trip continues. Sync is always resumable and never has to succeed in one shot.

The cursor reported under truncation is the lowest point at which *every* collection is complete, not the highest seq seen. Habits and entries are capped separately; if habits were cut off at seq 900 while entries ran to 4000, reporting 4000 would step over every habit in between.

The push watermark is the newest stamp **actually sent**, never `Date.now()` — using the clock would skip any edit made while the request was in flight.

### 13.6 Identity: the seam, and what fills it

Sync needs one thing from auth: a stable account id to scope rows by. Everything else about signing in is separate work with its own decisions, and the sync layer was built without waiting for it.

`lib/server/auth.ts` defines that contract and nothing more. **It fails closed:** anything other than a valid session returns null and the endpoint answers 401 — no cookie, an expired one, a database that cannot be reached. A permissive default would pool every visitor's habits into one row set, and the first symptom would be a stranger's data on someone's phone. A `HAPI_DEV_USER_ID` override exists for local development and is ignored when `NODE_ENV=production` — two conditions, because the failure worth preventing is that variable surviving into a real deployment.

*This section originally ended here, recording that no provider was wired in and that sync therefore ran for nobody. It now does.* **Better Auth** fills the seam, configured in `lib/server/better-auth.ts` and reached only through `resolveUser`. Email and password, self-hosted on the same Postgres the habits live in: no third-party dependency for an app whose whole argument is that your data is yours, and no outbound mail required to create the first account. Swapping providers still means rewriting one function.

**Its tables are separate from `users`, deliberately.** `auth-schema.ts:user` is the identity — Better Auth owns every column and adds more as plugins are enabled. `schema.ts:users` is the account that sync rows hang off, holding an id and an email because it exists to be the left half of every primary key. Merging them would give a dependency's migrations authority over the table `habits`, `entries` and `settings` all cascade from. The two are linked by `users.id === user.id`, established by the upsert in `sync-store.ts` on first sync — no foreign key, because the upsert already guarantees the row and a cross-owner constraint would fail migrations in whichever order they ran.

**An unverified address is accepted.** Email here is a label on an account whose real key is an opaque id; nothing is sent to it and nothing is authorised by it. Turning on verification is a change to make alongside a mailer, not before one.

#### The client half

Three constraints from §7.1 and §8.2 shape this more than the provider choice does.

**Nothing account-shaped may render on the server.** Every route prerenders and the service worker caches that HTML, so a session read during render would bake one visitor's state into the file served to the next. `AccountCard` is gated on a `useSyncExternalStore` whose server snapshot reports signed-out — the same shape as `display-mode` and `beforeinstallprompt` in §8.4, and for the same reason: the account UI may appear after hydration, never flash and vanish.

**`NEXT_PUBLIC_SYNC_ENABLED` is gone.** It was a build-time placeholder for "should this client sync", and the real answer — is someone signed in — is per device, not per build. `lib/session.ts` keeps a localStorage hint that `lib/sync/client.ts` reads synchronously and offline, so a signed-out browser makes no requests at all and a signed-in one starts syncing without waiting for a round trip to tell it so. The hint carries **no authority**: anyone can set it by hand, and all it grants is permission to make a request the server then answers 401. A stale hint self-corrects, because the 401 path clears it.

**The service worker must not cache `/api/`.** Its stale-while-revalidate rule covered every same-origin GET, which was harmless while `POST /api/sync` was the only endpoint and stopped being harmless the moment `/api/auth/*` existed: a cached session response tells a signed-out browser it is signed in, and keeps saying so offline where nothing can correct it. `public/sw.js` now returns early for the whole API prefix. An offline session check fails, which is the right answer — this app needs the network to prove who you are, never to show you a habit.

The client states which account its data belongs to on every request, and the server refuses a mismatch with 409 before writing anything. Discovering the identity from the *response* would be too late — a device where someone else has since signed in would already have uploaded the previous person's habits.

**Signing out wipes the device.** It routes through `adoptAccount(null)`, the same path as that 409: local store emptied, cursor reset. The habits are already replicated, and the alternative leaves one person's history readable to whoever picks up the phone next. Because that makes sign-out destructive for anything not yet pushed, it syncs first and asks a second time if that sync failed rather than deciding on the user's behalf.

### 13.7 What is tested

`tests/server/sync-store.test.ts` runs against real Postgres in-process (PGlite, Postgres compiled to WebAssembly), applying the committed migrations verbatim. That matters more here than elsewhere: the delicate parts are all SQL-level — a sequence assigned inside `ON CONFLICT DO UPDATE`, a row-value `IN`, a composite foreign key, an advisory lock — and a test double would check none of them.

Covered: convergence, stale-write rejection, tombstone propagation and cascade, resurrection attempts by a lagging peer, orphan entries, account isolation under colliding client-generated ids, mismatch refusal, idempotent replay, and a 600-entry history pulled across multiple trips with no gaps or repeats.

`tests/sync/merge.test.ts` covers the merge rules as pure functions, including the tie-symmetry case that caught the `>=` bug during the build. `tests/sync/validate.test.ts` covers the endpoint's input validation.

### 13.8 Open questions

1. **Settings sync as one blob, including `theme`.** A device-local look becomes a global one. Splitting device-local fields from account fields is the fix; the cost is dividing one type in two and threading both through the store. Left until someone complains.
2. **No conflict is ever shown to the user.** A lost edit is silent by design — surfacing "your rename was overwritten" for a habit tracker seems worse than the loss. Revisit if it turns out to bite.
3. **Tombstones accumulate forever.** Harmless at this scale (one row per deleted habit), but there is no purge. A tombstone older than any plausible offline device could be collected; nothing does it yet.
4. **The advisory lock serialises an account's syncs.** Correct, and fine for a handful of devices. If sync ever runs from many clients at once the lock becomes the bottleneck, and the cursor needs a commit-ordered design instead.
5. **`experimental.useOffline`** (§8.3) is now relevant and unused. The sync client hand-rolls its own online/visibility triggers; `useOffline()` from `next/offline` would give connectivity-aware retry for free.
6. **The client polls every five minutes when foregrounded.** Event triggers (visibility, online) carry the real load. If sync ever needs to feel live, this is where a push channel would go.
7. **There is no password reset, and no verification.** Both need a mailer, which the app does not have. Until one exists, a forgotten password means the habits on that device are reachable only through Export backup — which the sign-up form says out loud rather than discovering later.
8. **Signing in merges whatever is already on the device into the account.** A first sync pulls, adopts the account, then pushes local habits up. Right for the common case — someone who used the app signed out and then made an account — and wrong for a borrowed phone, where it silently donates one person's habits to another's account. The 409 path covers a device *changing* accounts; it does not cover the first one.
9. **Two tables that both sound like the user table.** `user` and `users`, one letter apart, owned by different parties for reasons §13.6 argues are good. The reasons do not make the names less confusing to read at 2am. A `schemaName: "auth"` namespace on Better Auth's side would separate them properly, at the cost of a `pgSchema` in the migrations.

---

### 13.9 Outbound mail

A reversal of §13.8 #7 and of the last paragraph of §13.6, both of which assumed
no mailer. There is one now — nodemailer over Gmail SMTP, behind `SMTP_USER`
and `SMTP_PASSWORD` — and a verification mail goes out on sign-up.

**Verifying is still not required to sign in.** The reasoning in §13.6 has not
changed: email is a label on an account whose real key is an opaque id, nothing
is authorised by it, and requiring verification would let a typo'd address lock
someone out of habits that exist on one device and nowhere else.
`requireEmailVerification` stays unset until password reset exists to recover
from exactly that. What the mail buys today is a confirmed address to send a
reset to later, and a signal to the user that the account is real.

**The credentials are optional, like every other variable.** The transport is
built inside the send, from the two variables, and throws a legible error when
they are absent rather than mailing into the void. Building at module scope
would make missing credentials fatal at import for `better-auth.ts`, which is to
say fatal for the whole auth stack, on a project whose first rule (§13.1) is
that it runs with nothing set. A transport per send is cheap next to the SMTP
round-trip it wraps, so there is nothing here to memoise the way
`lib/server/db.ts` memoises its pool.

**A send that fails does not fail the sign-up.** `sendVerificationEmail` awaits
the request — a floating promise inside a serverless invocation may never leave
the machine — and Better Auth's callback then catches and logs. An outage at the
mail provider costs a mail, not an account.

**The template is a separate, pure module.** `lib/verification-email.ts` takes a
URL and returns `{subject, html, text}`; `lib/email.ts` is transport and knows no
markup. That split is what makes the mail testable at all, and the tests pin the
things that are invisible until a real inbox shows them: the URL escaped into
the `href`, the plain-text alternative present, no `<img>` anywhere.

**It is written like a 2003 web page on purpose.** Nested tables, every
declaration inline, hex values copied by hand from `globals.css` because
`var(--accent)` does not survive Gmail. The hero — hapi's contribution grid, one
square lit — is drawn in `<td>` cells rather than an image, so it renders with
remote images blocked, which is the default in Outlook and common in Gmail. A
verification mail whose only branding is a broken-image icon reads as phishing.
Consequence worth knowing: the palette is duplicated, and a change to §6.2 has to
be carried across by hand. There is no way to share it that survives the trip.

**Still missing: a dark variant.** The mail declares `color-scheme: light only`,
which stops Apple Mail and Outlook.com force-inverting a palette that was never
designed for it. Gmail's dark mode tints regardless. A real dark version needs
class hooks in a `<style>` block, which Gmail keeps for `<head>` media queries
even though it strips much else — worth doing, not done.

---

### 13.10 Verification becomes mandatory

A reversal of §13.9's second paragraph and of §13.6's "an unverified address is
accepted". Both are left standing above because the reasoning in them was sound
for the app as it was; what changed is the trade being made.
`requireEmailVerification` is now on, and no session exists until the link in the
mail is clicked.

**What the old position bought, and why it is no longer worth it.** The argument
against was that a typo'd address would lock someone out of habits that exist on
one device and nowhere else. That is still true and still the cost — but it was
being paid to protect a *sync account*, and the habits are never at risk: they
live in IndexedDB, they are untouched by any of this, and Export backup moves
them. Against that, an unverified address on an account is an address nobody has
proven they own, which makes it useless as the thing a password reset is sent to
and makes "signed in as you@example.com" a claim the app cannot support. Nothing
was authorised by email before; something will be, and an account estate half of
which was never confirmed is not a thing to start a reset flow on top of.

**It follows the mailer, not a flag.** `mailerConfigured()` decides:
SMTP credentials present, verification required; absent, sign-up behaves exactly
as it did in §13.9's world. §13.1 — the app runs with nothing set — outranks this
section, and requiring a click that no mail can deliver would make every
deployment without SMTP credentials a deployment where accounts cannot be
created at all, local development first among them. It is read once per process, which is
the same granularity as `secret` and `baseURL` and no worse.

**A failed send now fails the sign-up**, reversing §13.9's last-but-two
paragraph. Swallowing the error was right when the mail was a courtesy; it is
wrong when the mail is the only way in, because the result is an account that
cannot be verified, cannot be signed in to, and holds the address hostage against
a retry. Better Auth runs sign-up inside a transaction, so throwing rolls the
user row back and the address is free again. With no mailer configured nothing is
required and the error is logged and swallowed as before.

**`autoSignInAfterVerification`.** Clicking the link creates the session. Asking
for the password again on a browser that just proved it holds the mailbox adds a
step and no security. The consequence worth naming: the session lands on
whichever device opened the mail, which is often the phone rather than the laptop
that signed up. The laptop then signs in normally, and §13.8 #8 merges its local
habits at that point — later than before, but the merge is not lost.

**`sendOnSignIn` is the resend path.** An unverified sign-in attempt returns 403
and sends a fresh link on the way out, so the common recovery — the first mail
went to spam — needs no thought from the user. `AccountCard` also offers an
explicit Resend, which hits `/send-verification-email`; that endpoint answers
identically for unknown, already-verified and waiting addresses, and pads its own
timing to match, so it cannot be used to enumerate accounts. There is nothing to
branch on in the UI and nothing to report but "sent".

**The client had to learn one new state.** A sign-up under mandatory verification
returns `token: null` and sets no cookie, so `AccountCard` must *not* call
`markSignedIn()` — a hint set here would buy nothing but a run of 401s from
`lib/sync/client.ts` for as long as the mail sits unread. Both entry points into
the wait — a sign-up that made no session, and a sign-in refused with
`EMAIL_NOT_VERIFIED` — land in the same panel, which says what has happened to
the habits on this device, because "check your email" on a screen that just
appeared to swallow an account reads as data loss.

**Still no password reset**, so §13.8 #7 is only half closed. A confirmed address
is the prerequisite for one, which is most of what this section is for.

### 13.11 Saying whether it worked

The states above were all built and none of them was ever *announced*. A sign-up
either replaced the form with the verification panel or, on a deployment with no
mailer, silently became the signed-in card — indistinguishable from having
signed in — and a failure was a twelve-pixel line of `--danger` wedged between
the hint paragraph and the buttons. `AccountCard` now reports every outcome
through one `Banner`: `role="alert"` for failures, which should interrupt a
screen reader because they stand between you and what you asked for, and
`role="status"` for confirmations, which should not.

**The outcome is held above the form, not in it.** With no mailer a sign-up comes
back with a live session, Better Auth's `useSession` flips, and the entire
signed-out subtree unmounts on the next tick — so a confirmation stored in that
subtree's state would flash and vanish, which is a more annoying version of the
bug. `AccountCard` owns an `Outcome`, and the signed-in card renders the
"account created" banner (with the count of habits being uploaded into it) until
it is dismissed or the account is signed out of.

**What the sign-up panel is allowed to claim.** Not that an account was created —
that is knowable only where verification is off. With it on, Better Auth answers
a sign-up for an address that already exists with a synthetic success: same
response shape, `token: null`, no row written, so that the form cannot be used to
test whether an address is registered. This is the same non-disclosure the resend
endpoint makes, and the panel's copy has to be true under both readings, which is
why it confirms the *sign-up* and the mail rather than the account, and names the
duplicate case as a possibility with an action attached. The single case where
the app does know — mailer off, real token, therefore a real new account — is the
one place it says "Account created" outright.

**`USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL` is thrown only in that same case**, for
the same reason, and the form turns it into "Sign in instead" with the address
kept. The shorter `USER_ALREADY_EXISTS` is matched too; the sign-up route throws
the longer spelling and other paths throw the other.
