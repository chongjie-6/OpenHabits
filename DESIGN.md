# hapi — Design Document

A local-first PWA that pairs a **daily quote from someone worth quoting** with a **habit tracker** whose history renders as a GitHub-style contribution grid.

- **Status:** phases 0–6 built and passing; §11 has what remains
- **Stack:** Next.js 16.3.1 (App Router), React 19.2, Tailwind CSS v4, TypeScript 5, Vitest
- **Last updated:** 2026-08-14

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

- Accounts, login, or cross-device sync (see §12 for the v2 path that the schema already accommodates)
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

**Absence is meaningful.** No `Entry` row means "not logged", which is distinct from `count: 0` ("explicitly un-ticked"). Only the compound key exists; there are no tombstones in v1.

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

Per the guide's recommendation, no `beforeinstallprompt` interception — it isn't supported on iOS Safari and produces a two-tier experience. Instead: browsers show their own prompt when the criteria are met, and iOS users get a dismissible one-time hint (Share → Add to Home Screen) shown only when `/iPad|iPhone|iPod/` matches and `matchMedia("(display-mode: standalone)")` is false.

### 8.5 Reminders — a known limitation

**The web cannot reliably schedule a purely local notification.** The Notification Triggers API never shipped broadly, and a service worker cannot wake itself on a timer. There are two honest options:

1. **v1 — in-app only.** A gentle "you haven't logged today" banner when the app is opened after the reminder time. Zero infrastructure, zero permissions, no false promises.
2. **v2 — real push.** Web Push with VAPID keys, `web-push` on the server, and a stored subscription per device. Works on iOS 16.4+ *only for home-screen-installed apps*. This requires a server and a scheduler, which pulls the app out of its zero-backend posture — hence v2.

**Shipped:** neither, and the Settings screen says so in plain words. The Today tab already surfaces what is outstanding the moment the app opens, which is option 1 without pretending it is a reminder. A "Daily reminder at 8:00" toggle that silently doesn't fire would be the worst available outcome.

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
  stats/page.tsx
  habit/page.tsx          Suspense wrapper — see the note in §2.2
  quotes/page.tsx
  settings/page.tsx
  globals.css             tokens, ramps, @theme mapping, safe-area utilities

components/
  app-chrome.tsx          Hydrator + BottomNav
  quote-card.tsx          client — see §7.1 for why
  today-list.tsx
  habit-row.tsx           the tick target
  habit-form.tsx          shared by create and edit, plus describeCadence
  add-habit.tsx           thin wrapper over HabitForm
  habit-detail.tsx        per-habit grid, editing, archive, delete
  heatmap.tsx             SVG, delegated events, both orientations, legend
  install-hint.tsx

lib/
  types.ts                domain types + DEFAULT_SETTINGS
  store.ts                in-memory cache + useSyncExternalStore + mutations
  db.ts                   IndexedDB, migrations, requestPersistence
  dates.ts                DayKey maths, week bounds, dayStartHour, formatting
  history.ts              cadence evaluation, day rollups, per-habit history
  streaks.ts
  quotes.ts               deck algorithm, seam repair, upcoming schedule
  colors.ts               ramp lookups, neutral and per-habit
  theme.ts                pre-paint script + localStorage mirror
  use-today.ts            the clock as external state
  use-media-query.ts
  *.test.ts               58 tests over the pure logic

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
| LCP on mid-tier Android, 4G | < 1.8s | not yet measured |
| INP for a habit tick | < 50ms | not yet measured |
| Heatmap render, 371 cells | < 8ms | not yet measured |

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
| **7 — Field** | Lighthouse, a11y audit, install test on real iOS/Android | ⬜ |

Phase 5's Week screen and Settings came forward because deleting a habit and backing up data are not polish — a tracker you cannot correct or export is not one you would trust with a year.

Everything before phase 7 is verified only by `tsc`, `eslint`, `vitest` and a build. Nothing here has been measured on a real phone, and the LCP/INP budgets in §10 remain unmeasured.

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
