# Contributing to OpenHabits

Thanks for taking the time. This is a small, opinionated codebase — most of the
decisions in it were argued somewhere before they were written, and that
somewhere is usually `DESIGN.md`.

## Before you start

Read these three, in this order:

1. **`DESIGN.md`** — the authoritative design document, kept current. Section
   numbers (§7.1, §13.2, …) are referenced from module headers throughout the
   source. Read the relevant section before changing anything in `lib/`.
2. **`ROADMAP.md`** — the open questions in the order they are worth doing, and
   which ones are settled decisions rather than pending work.
3. **`AGENTS.md`** — this repository targets a Next.js version whose APIs may
   differ from what you (or your tooling) remember. The local docs in
   `node_modules/next/dist/docs/` are the reference.

A good number of things that look like bugs are deliberate: a rest day is drawn
differently from a failed one, a null completion rate is an empty track and not
a zero-width bar, `weekdayExtremes` refuses to name a best and worst day below a
minimum sample, and four storage keys still say `hapi` because renaming them
orphans data that already exists on someone's device. If something looks wrong,
check `DESIGN.md` §12 and §13.8 first — and if it *is* wrong, saying so in an
issue is a real contribution.

## Setup

```bash
nvm use            # Node 24 — .nvmrc, and `engines` in package.json
npm install
npm run dev        # http://localhost:3000
```

**No environment variables are required.** With none set the app is fully
functional; `/api/sync` and `/api/auth/*` answer 503 and the client treats sync
as switched off. That is a supported configuration, not a degraded one — see
`.env.example`.

## Before you open a pull request

```bash
npm run lint
npm run typecheck
npm test
npm run build      # with no environment set — see below
```

CI runs exactly these four on every push and pull request. The build step is
given **no environment on purpose**: every variable in `.env.example` is
optional, so a build that needs one has broken that promise.

If you touched `lib/server/schema.ts`, also run:

```bash
npm run db:generate   # must report no changes once your migration is committed
```

Migrations are **generated, reviewed and committed** — never `drizzle-kit push`,
which can resolve a rename by dropping the column, and these tables hold history
that exists nowhere else.

## Tests

Tests live under `tests/`, mirroring the `lib/` tree they cover
(`lib/sync/merge.ts` → `tests/sync/merge.test.ts`). Everything is logic reached
through its own exports — there are no component or E2E tests, and no jsdom.

```bash
npm test
npx vitest run tests/sync/merge.test.ts
npx vitest run -t "takes the later write"
```

New logic in `lib/` should arrive with tests. Anything touching dates, merge
resolution, or the deck sequence should arrive with several.

## Code style

- Comments explain the **non-obvious**: an invariant, a workaround, a reason the
  straightforward version is wrong. Don't narrate what the code already says,
  restate the function name in prose, or leave section banners.
- Match the surrounding code — naming, idiom, comment density.
- New modules in `lib/` carry a header naming the `DESIGN.md` section they
  implement.

## Invariants that will bite

The full list is in `DESIGN.md` and summarised in `CLAUDE.md`. The ones that
most often catch a first patch:

- **Mutations are synchronous and optimistic.** The UI never awaits a write.
  Persist with the fire-and-forget `persist()` helper.
- **The dependency runs one way.** Sync imports the store; the store knows
  nothing about sync. Same for undo.
- **Dates are local civil `YYYY-MM-DD` strings.** `lib/dates.ts` is the only
  module that should call `new Date()` to produce one.
- **Nothing user- or date-dependent may render on the server.** Routes are
  static and the service worker caches that HTML.
- **`public/sw.js` must never cache `/api/`.** A cached session response tells a
  signed-out browser it is signed in, offline, where nothing corrects it.
- **Appearance never syncs**, on any axis. Theme, skin and palette are
  device-local.
- **Deletes write tombstones**, never remove rows.

## Pull requests

- One concern per pull request. A refactor and a fix in the same diff is two
  pull requests.
- Fill in the template — particularly *how you tested it*.
- If your change contradicts something in `DESIGN.md`, update `DESIGN.md` in the
  same pull request. The document records reversals rather than overwriting
  them: when a section reads as a reversal, the current behaviour is the one
  described second.

## Reporting things

- **Bugs and features** → [issues](https://github.com/chongjie-6/OpenHabits/issues),
  using the templates.
- **Security vulnerabilities** → **not** an issue. See
  [`SECURITY.md`](SECURITY.md).

## License

By contributing, you agree that your contributions will be licensed under the
[MIT License](../LICENSE) that covers this project.
