# OpenHabits — Roadmap

What is left, in the order it is worth doing. `DESIGN.md` holds the reasoning; this file holds the sequence.

- **Status:** phases 0–6 of §11 built and passing. Phase 7 (Field) is the only unfinished one, and it needs hardware.
- **CI landed 2026-08-25**, along with the pins it needed; that phase is off this list. Tests for `lib/store.ts` and the rest of the stateful half are next.
- **Last updated:** 2026-08-25

---

## 1. Where the tree actually stands

Verified 2026-08-25.

| Check | Result |
|---|---|
| `npm test` | **124 passed / 124**, 11 files, ~18s |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm run build` | clean, with no environment set |
| `TODO` / `FIXME` / `HACK` | 0 |
| `@ts-ignore` / `@ts-expect-error` / `eslint-disable` | 0 |
| `.github/workflows/` | `ci.yml` — the four checks above, on push and PR |

**All four now run on every push and pull request.** Before CI they ran only when a human remembered to type them, so a green suite was only ever as current as the last time someone did. The build step is given no environment on purpose: every variable in `.env.example` is optional, so a build that needs one has broken that promise and CI is the thing that should say so.

---

## 2. Phase 1 — Test what can lose data

124 tests is a good number attached to an uneven distribution. Everything **pure** is well covered, and `tests/server/sync-store.test.ts` is genuinely strong — it boots PGlite per case and applies every `.sql` in `drizzle/` verbatim, so the SQL-level subtleties (a sequence assigned inside `ON CONFLICT DO UPDATE`, a composite foreign key, the advisory lock) are all exercised for real.

The hole is everything **stateful**.

| Untested | Lines | Why it matters |
|---|---|---|
| `lib/store.ts` | **523** | Every mutation in the app. `importBundle` (both modes), `applyPulled`, `adoptAccount`, `resetEverything`. **The file most able to lose a year of habits has no tests at all.** |
| `lib/db.ts` | 300 | All IndexedDB access, `applyMerge`, `clearAll` |
| `lib/sync/client.ts` | 249 | `syncNow`, the status-code mapping, retry |
| `lib/session.ts` | 107 | The signed-in hint and the 401 path that clears it |
| `lib/types.ts:normaliseHabit` | — | The legacy-import migration |
| `lib/sync/protocol.ts:wins` | 146 | The LWW tiebreak, reached only through its callers |

In order:

1. **`lib/store.ts`.** It is *nearly* pure — a module-level object plus `useSyncExternalStore` — so it can be driven directly through its exported functions with a small in-memory fake for `persist()`. Cover `moveHabit` reordering, `toggleEntry`/`setCount`, and above all `importBundle` in **both** merge and replace modes, `applyPulled`, and `adoptAccount`.
2. **`normaliseHabit`.** Untested code that runs against data written by an older version of the app is the definition of a trap.
3. **`wins`.** `CLAUDE.md` names it an invariant and says the rule lives in exactly one place. It deserves direct tests rather than inference through two callers.
4. **`lib/session.ts`** — specifically that a 401 clears the hint, since the hint has no authority and that path is what enforces it.
5. **A coverage provider**, and a recorded baseline. A number to watch, not a gate.

None of this needs jsdom; it all runs in the existing node environment. Component and E2E tests remain out of scope — that is a larger decision than this phase.

---

## 3. Phase 2 — Close the shipping blockers

What stands between this and a real domain with real users.

1. **Password reset.** The one gap `README.md`, `CLAUDE.md`, §13.8 #7 and §13.10 all name; §13.10 closes by saying #7 is "only half closed". The prerequisite is now met — the mailer exists (`lib/email.ts`), verification works, and Better Auth supports the flow. Reuse `lib/verification-email.ts`'s markup pattern: table cells, no `<img>`, escaped attributes, a plain-text alternative. Highest-value user-facing item in this document.
2. **`metadataBase` and an OG image.** §8.6 calls this "the first thing to do when a domain exists". Nothing sets `metadataBase` today, so link previews are broken everywhere.
3. **A Content-Security-Policy on app routes.** `next.config.ts` gives one to `/sw.js` and nothing else. **Note the constraint**: `lib/theme.ts:THEME_SCRIPT` is a blocking inline script by design (§7.1 — it must read `localStorage` pre-paint), so this needs a nonce or a hash. A naive `script-src 'self'` will break the theme.
4. **A favicon.** The only PWA gap. `app/apple-icon.png` already covers apple-touch and the manifest is complete, but there is no `favicon.ico`, `icon.png` or `icon.svg` in `app/` or `public/`, so Next emits no `<link rel="icon">` and `/favicon.ico` 404s. `scripts/generate-icons.mjs` already exists to extend.
5. **Deployment config.** The target is Vercel + Neon and `README.md` now says so — env vars per environment, `BETTER_AUTH_ALLOWED_HOSTS` rather than a pinned origin because previews each get their own host, migrations run out of band. What is still unpinned: the domain (which item 2 needs anyway), and a `vercel.json` `regions` entry putting `/api/sync` next to the Neon region rather than wherever the default lands.
6. **Decide `importBundle`'s `"replace"` mode.** It is implemented in full — `db.clearAll()`, tombstone discard, all of it — and **unreachable from the UI**: `app/settings/page.tsx` only ever passes `"merge"`. Either surface an import-mode picker or delete the branch. A complete destructive path with no caller is the kind of thing that gets wired up wrongly later. Do this after phase 1 covers it either way.

---

## 4. Phase 3 — Decide the open questions

§12 and §13.8 are a list of decisions, not a backlog. This phase *closes* them, and for several the right close is "leave it, and say so in the doc".

**Act on these:**

- **§13.8 #1 — settings sync as one blob, `theme` included.** The open question most likely to be noticed by a real person, because it is visible the instant a second device syncs: a device-local look becomes a global one. The fix is splitting device-local fields from account fields, at the cost of dividing one type in two.
- **§13.8 #8 — signing in merges the device into the account.** Right for the common case, wrong for a borrowed phone, where it silently donates one person's habits to another's account. The 409 path covers a device *changing* accounts; it does not cover the first one. At minimum, prompt before the first merge.
- **§13.8 #3 — tombstones accumulate forever.** Cheap to close: collect anything older than any plausible offline device.
- **§13.8 #5 — `experimental.useOffline`.** Confirmed still absent from `next.config.ts`. It would replace the hand-rolled online/visibility triggers in `lib/sync/client.ts` with connectivity-aware retry for free.
- **§13.8 #9 — `user` and `users`, one letter apart.** §13.6 argues the separation is right and it is; the *names* are still confusing at 2am. A `schemaName: "auth"` namespace separates them properly, at the cost of a `pgSchema` in the migrations. Worth doing before anyone else reads this code.

**Decide and leave:** §12 #2 (deck size — closes slowly by design), #3 (confetti), #5 (the forgiven final day), #7 (immediate archiving), #8 (Today → detail link), and §13.8 #2 (silent conflicts), #4 (the advisory lock), #6 (the five-minute poll). Record the decision; do not reopen the reasoning.

**Blocked on hardware — §11 Phase 7.** The last unfinished phase, and §10 records exactly why it matters: every Lighthouse run was against an *empty* IndexedDB, because the CLI cannot seed it. The heatmap rendered zero cells and no habit was ever ticked, so **the two budgets that bear directly on G1 and G2 — INP on a tick, and the paint cost of ~371 SVG cells — are both unmeasured.** §11 already prescribes the test: install to a home screen, add five habits, backfill a month, tick something, and watch. Decide §10's LCP question at the same time; the doc argues (a) *move the budget* is probably right, and explicitly records (c) as rejected rather than available.

---

## 5. Phase 4 — Product depth

Only after the above.

1. **Reminders.** §8.5 is unusually clear that the web cannot reliably schedule a local notification, and that the honest options are an in-app banner or real Web Push with VAPID — the latter rejected because it "pulls the app out of its zero-backend posture". **That posture has since changed**: §13 gave the app a server and a database. The objection is weaker than when it was written, and that is the reversal to record if this gets built. §8.5's actual warning still stands untouched, though, and it is the important half: *a "Daily reminder at 8:00" toggle that silently doesn't fire would be the worst available outcome.*
2. **A dark variant for the verification email.** §13.9: "worth doing, not done." Needs class hooks in a `<style>` block, which Gmail keeps for `<head>` media queries.
3. **Grow the quote corpus toward §12's ~400.** Purely additive, and slow on purpose — §5.2's verification bar matters more than the number, and at 168 the app's promise ("once per pass, no repeat within 21 days") is already true. `tests/quotes.test.ts` guards uniqueness, attribution, and the Durant/Aristotle misattribution.
4. **Richer stats, more habit types.** Genuinely new scope. Specify against §1's goals before building — G5 and the v1 non-goals rule out more than they look like they do.

---

## 6. Documentation debt

`DESIGN.md` is authoritative and is cited by § number from module headers, so drift in it is a real cost.

1. **There are two sections numbered §13.11** — "Saying whether it worked" and "The origin is configured, not inferred". `README.md` and `CLAUDE.md` both cite §13.11 meaning the *origin* one, so renumber the other and every existing citation stays correct.
2. **§13.6 has been reversed three times** — by §13.9, §13.10, and §13.11-origin — with the original wording still standing, per the doc's own convention. That convention is right, but §13.8 #7 currently opens "There is no password reset, **and no verification**", and verification has been mandatory since §13.10. Add the forward pointer without rewriting the entry.
3. **Stale counts.** §11's build-order table says "58 tests green"; `README.md` says "117 tests across 10 files". It is **124 across 11** — the README is stale by exactly `tests/server/base-url.test.ts`.
4. **§2.2** carries a "Revised during build" note saying habit detail is `/habit?id=`, and the paragraph immediately below it still says `/habit/[id]`.
5. **§12's risk table still reads as a proposal** on storage eviction. `navigator.storage.persist()` shipped — `lib/db.ts` calls `persisted()` then `persist()`. Mark it done.

---

## 7. Housekeeping

- **Dead exports:** `lib/db.ts:deleteEntriesFor` (`applyMerge` inlines the same `IDBKeyRange.bound` purge instead) and `lib/quotes.ts:quoteById`. Neither is referenced anywhere, tests included.
- **Test-only exports:** `lib/dates.ts:weekdayIndex` and `lib/quotes.ts:deckFor` are used by `tests/` and by no application code. Fine, but worth knowing before someone "cleans them up".
- **Prettier, alone and on its own commit.** It would reformat the whole tree at once and bury the history of a codebase whose prose is load-bearing. Deliberately left out of the CI work; now safe to do, because CI can prove it changed nothing.
- **`@electric-sql/pglite`, `drizzle-orm` and `drizzle-kit` are all pre-1.0**, and all three carry either the schema or the suite that validates it. Only the lockfile pins them — `npm ci` is what makes CI honour it, so a drifting install now shows up there rather than on one laptop.
- **`@types/nodemailer` stays at `^8` against nodemailer `^9`.** nodemailer 9 ships no `.d.ts` of its own and 8.0.1 *is* the newest `@types/nodemailer`; the mismatch is DefinitelyTyped's numbering, not staleness. Revisit only if nodemailer starts publishing types.
- **Leave `AGENTS.md` alone.** It is regenerated by `next dev`; removing it from a diff only re-creates the change.
- **Leave the four `hapi`-named storage keys alone** — `lib/db.ts:DB_NAME`, `lib/theme.ts:THEME_KEY`, `lib/session.ts:HINT_KEY`, and the `hapi_sync_seq` sequence. Each names data that already exists on a device or in Postgres. They are not leftovers to tidy up, and both `README.md` and `CLAUDE.md` say so.
