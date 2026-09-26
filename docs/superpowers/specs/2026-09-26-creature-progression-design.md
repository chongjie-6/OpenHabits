# Creature progression: exp, levels, evolution, party

- **Status:** implemented. One deviation: `creatures` has no `found_on` column, since nothing displays it.
- **Date:** 2026-09-26
- **Reverses:** DESIGN.md §5.5 "derived, never persisted", for everything except Cogling's line

## Intent

Creatures become something you raise, not only something you find. Each creature
has exp and a level; each evolution line evolves at levels of its own and learns
moves as it goes; a party of a buddy and four others is who earns. Exp comes from
showing up and doing the day's habits, and the server — not the device — decides
both what you have found and how much exp you have.

Decided with the user:

| Question                    | Decision                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| Signed out                  | Creatures are an account feature. Signed out, `/dex` shows silhouettes and a note to sign in.           |
| Existing weekly discoveries | Fresh start. They were derived from history that may be backdated; rebuilding them trusts exactly that. |
| First creature              | Pick one of Sproutle, Emberpup, Drizzlet. The other two return through normal discovery.                |
| Evolution animation         | One sequence, dressed per creature in its own sprites and colours.                                      |

Out of scope: battles, using a move, a move limit, buddy bonuses, two of one line,
trading. Cogling's line (#000) stays exactly as it is — device-local flags found by
opening settings, outside exp and the party — because an act on one device is not
something a server can check.

## What "server-validated" means, and does not

The server can check _when_ a day was claimed and _what the synced data says about
it_. It cannot check that a ticked habit happened; no server can.

1. **Exp and unlocks are written only by the server.** The client never sends an
   amount, a level, or a creature it has found. It sends "claim this day", and the
   server computes the day from its own copy of the synced habits and entries.
2. **Only today can be claimed.** "Today" is checked without trusting a timezone:
   a claimed day `D` is accepted iff
   `utcDay(now − 18h) ≤ D ≤ utcDay(now + 14h)`. UTC−12 is the earliest civil day on
   Earth and a `dayStartHour` of 6 keeps a device on yesterday for six more hours;
   UTC+14 is the latest. A week of missed days cannot be backfilled. The ceiling: a
   day can be claimed up to about a day late, and each day still pays once.
3. **Each day pays once, and only upward.** A claim stores the best rate the day
   reached; claiming again after doing more pays the difference between tiers.
   Un-ticking afterwards takes nothing back.

## Rules — `lib/creatures.ts`

Shared by client and server, pure, and the single statement of each number.

| Rule        | Value                                                                                    |
| ----------- | ---------------------------------------------------------------------------------------- |
| Day payout  | rate ≥ 0.6 → 20 exp, ≥ 0.8 → 35, 1.0 → 50; below 0.6 or nothing scheduled → 0            |
| Who is paid | every creature in the party at claim time, the full amount each                          |
| Level       | total exp for level `L` is `6·(L−1)²`; level 1 at 0 exp; capped at `MAX_LEVEL` 50        |
| Stage       | the number of the line's `evolvesAt` levels at or below the creature's level             |
| Moves known | every move in the line's list whose `level` is at or below the creature's level          |
| Good day    | a claimed day at `QUALIFYING_RATE` (0.8) or better                                       |
| Discovery   | every `DISCOVERY_DAYS` (7) good days finds the next line not yet owned, in `LINES` order |
| Party       | `PARTY_SIZE` 5: slot 0 is the buddy, 1–4 the rest; anyone else is in the box             |

At that curve a first evolution around level 12 is ~15 perfect days, a second
around level 28 is ~3 months, level 50 is ~10 months.

Only `exp` is stored. Level, form, and moves are derived from it, like every other
derived value in this codebase. `discoveries()` and the weekly derivation it does
are deleted; `findCogling` and `isFound` stay.

## Data — `data/creatures/`

Each line folder exports a `Line` instead of a bare `Creature[]`:

```ts
type Move = { name: string; level: number; text: string };
type Line = {
  id: string; // the base form's id
  forms: Creature[]; // base first
  evolvesAt: number[]; // forms.length − 1 levels, strictly increasing
  moves: Move[]; // first at level 1, strictly increasing levels
};
```

`tangling/index.ts` exports eight two-form lines (Tangling→Tanglare,
Jabbit→Stillhare, Mendle→Mendazzle, Quickling→Neverfox, Threadle→Tapestrel,
Whorlet→Whorlinity, Burblet→Burblivion, Pelter→Pelterra). `index.ts` exports
`LINES` (20), `STARTERS` (the first three ids), and keeps
`CREATURES = LINES.flatMap((l) => l.forms)` so every dex number is unchanged.

Evolution levels, one per line so no two lines grow alike:

| Line     | `evolvesAt` | Line     | `evolvesAt` | Line      | `evolvesAt` |
| -------- | ----------- | -------- | ----------- | --------- | ----------- |
| sproutle | 12, 28      | glimmoth | 18          | tangling  | 20          |
| emberpup | 14, 30      | frostnib | 16          | jabbit    | 22          |
| drizzlet | 13, 29      | duskmolt | 22          | mendle    | 21          |
| mossback | 20          | stonkey  | 15, 32      | quickling | 23          |
| gustling | 14          | spurling | 17, 35      | threadle  | 24          |
| pebblit  | 16, 34      | gainlet  | 18, 36      | whorlet   | 25          |
|          |             |          |             | burblet   | 26          |
|          |             |          |             | pelter    | 27          |

Moves are original content in the same voice as the blurbs: four or five per line,
each acting out something the line's blurbs already say it does (Sproutle's are
about water and leaves; Pebblit's happen twice). The §5.5 rule applies unchanged —
no names or ideas that are someone else's character.

## Server

### Tables — `lib/server/schema.ts`

```
creatures      (user_id → users ON DELETE CASCADE, line text,
                exp integer not null default 0,
                slot smallint null check (slot between 0 and 4),
                found_on text not null,               -- DayKey
                primary key (user_id, line),
                unique (user_id, slot))               -- NULLs distinct: the box is unbounded

creature_days  (user_id → users ON DELETE CASCADE, day text,
                completed integer not null, scheduled integer not null,
                exp_paid integer not null,
                primary key (user_id, day))
```

Both get an owner policy exactly like `habits` and no server bypass. The migration
is generated, reviewed, and has `FORCE ROW LEVEL SECURITY` for both tables appended
by hand, as `0006` does. `npm run db:generate` must report no changes afterwards.

### `lib/server/creatures.ts`

Every operation runs in `asUser` and first takes the same
`pg_advisory_xact_lock(hashtext(userId))` sync takes, so a claim sees a committed
sync and two claims cannot both pay.

- **`claim(day, now)`** — reject outside the window. Read live habits, the entries
  from `startOfWeek(day)` to `day` (weekly cadence needs the week), and
  `weekStartsOn` from `settings`; run `statFor`. Pay nothing if the new rate is not
  better than the stored one. Otherwise pay `payout(new) − exp_paid` to the party,
  upsert the day, then grant discoveries while
  `owned < 1 + floor(goodDays / DISCOVERY_DAYS)` and a line remains — only once a
  starter is owned. A new creature takes the lowest free slot in 1–4, else the box.
- **`choose(line)`** — only when nothing is owned, only a starter. It becomes the
  buddy at 0 exp.
- **`setParty(lines)`** — 1 to 5 distinct owned lines, first is the buddy. Clears
  every slot, then writes the new ones, in the one transaction.
- **`state()`** — creatures, `goodDays`, and the latest `creature_days` row.

### `app/api/creatures/route.ts`

`GET` returns the state; `POST` takes `{action:"claim", day}`,
`{action:"choose", line}` or `{action:"party", lines}` and returns the new state,
plus `gained` (exp per member) and `found` (new line ids) on a claim. Same shape as
`/api/reminders`: 503 when `DATABASE_URL` is unset, 401 without a session, a body
cap, hand-written validation (a `DayKey` regex plus a real-date check; line ids
against `LINES`), a new `"creatures"` rate-limit tier keyed by account, and
`Cache-Control: no-store`. `proxy.ts` already meters it by IP; `public/sw.js`
already never caches `/api/`.

## Client

### `lib/party.ts`

- Holds the last server state in memory, mirrored to localStorage **under the
  account id** from `syncMeta()`, so a borrowed phone never shows the previous
  person's party. `useSyncExternalStore` with a `null` server snapshot.
- **Claiming.** A hook mounted once in `AppChrome`, gated on the signed-in hint as
  sync is. It computes today's stat from the local store; when the rate reaches a
  higher payout tier than the last claim for today, it waits for ticking to pause
  (2s), calls `syncNow()` — sync polls only every five minutes — and then claims.
  Nothing claims below the lowest tier, so most ticks cost no request.
- **Party edits** need the network, say so when offline, and never block a tick.
- **Evolution detection.** A device-local "stage last seen" per line. When new
  state shows a higher stage, queue an evolution; a line with no record is recorded
  without one. Each device plays each evolution once, like Cogling's flags.
- **Toast.** After a paying claim: "+35 exp" and any level reached, move learned, or
  creature found.

### UI

- **`components/Sprite.tsx`** — lifted out of `app/dex/page.tsx` unchanged, with a
  `scale` prop, so Today and the overlay can draw creatures.
- **`/dex`** — signed out or not configured: silhouettes and a sign-in note, with
  Cogling's line as it is. Signed in with nothing owned: the starter picker. Then:
  the party (buddy large), progress ("Today 80% · +35 exp — 3 of 7 good days to the
  next find"), the box, and the dex grid, where a form is known once an owned
  creature of its line has reached it. Tapping an owned creature opens a `Sheet`:
  level, exp bar to the next level, moves known and the next one, and the party
  actions.
- **Today** — the buddy's sprite, name, level and exp bar, linking to `/dex`.
  Renders nothing signed out or before a starter.
- **`components/Evolution.tsx`** — a modal `<dialog>` mounted in `AppChrome`:
  "Sproutle is changing…"; the two forms as silhouettes swap on `step-end` steps
  that speed up; a flash; the new form in colour with its idle loop, and
  "Sproutle became Bloomkin!" with the moves it learned. Sparks are drawn in the
  creature's own colours, which is what makes each one its own. Tap to skip;
  reduced motion goes straight to the reveal. The wording is original.

## Testing

- `tests/creatures.test.ts` — curve and its inverse at boundaries, stage and moves
  at each `evolvesAt`, payout tiers at 0.59/0.6/0.79/0.8/1.0; every line has
  `forms.length − 1` strictly increasing `evolvesAt` ≤ `MAX_LEVEL`, moves starting
  at 1 and increasing, move names unique; `CREATURES` order unchanged; the three
  starters are lines 1–3. The existing idle-stylesheet checks stay.
- `tests/server/creatures.test.ts` (PGlite) — pays the party and not the box;
  a re-claim pays the difference once and an equal re-claim pays nothing; days
  outside the window are rejected at both edges; the seventh good day finds the
  next unowned line and seats it in a free slot; nothing is found before a starter;
  `choose` works once and only for a starter; `setParty` rejects unowned,
  duplicate, empty and six-long lists.
- `tests/server/rls.test.ts` — both new tables: Bob reads none of Alice's rows, and
  no scope reads anything.

## Docs

DESIGN.md §5.5 gains a "Reversed" note (the current behaviour second, as the doc's
convention has it) and a new §13.18 for the tables, the claim window and what it
bounds. CLAUDE.md: the "Creatures are derived" invariant is rewritten, and
`/api/creatures` joins the list of dynamic routes. CHANGELOG entry.
