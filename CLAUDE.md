# OpenHabits

## Design system

The palette lives entirely as CSS custom properties in [src/index.css](src/index.css),
mapped into Tailwind v4 via `@theme inline`. Never hardcode a hex value in a
component — use the Tailwind utility (`bg-accent`, `text-secondary`, `border-border`,
etc.) so light/dark mode and future palette changes stay centralized.

### Colour scheme

| Purpose | Hex | CSS variable | Tailwind utility |
|---|---|---|---|
| Primary | `#10B981` | `--accent` | `bg-accent` / `text-accent` |
| Primary dark | `#059669` | `--accent-dark` | `bg-accent-dark` |
| Secondary | `#6366F1` | `--secondary` | `bg-secondary` / `text-secondary` |
| Secondary dark | `#4F46E5` | `--secondary-dark` | `bg-secondary-dark` |
| Background | `#F8FAFC` | `--bg` | `bg-bg` |
| Card | `#FFFFFF` | `--surface` | `bg-surface` |
| Main text | `#0F172A` | `--ink` | `text-ink` |
| Secondary text | `#64748B` | `--muted` | `text-muted` |
| Border | `#E2E8F0` | `--border` | `border-border` |
| Success | `#22C55E` | `--success` | `text-success` |
| Warning | `#F59E0B` | `--warning` | `text-warning` |
| Error | `#EF4444` | `--danger` | `text-danger` |

Dark mode is a derived palette (same hues, brightened for contrast on a dark
ground) under `.dark` in the same file — there's no separate dark theme to
design, just keep both blocks in sync when the palette changes.

There's also `--accent-soft` / `--secondary-soft` (pale tints for badges and
info banners) and `--faint` (the dimmest text tier, below `--muted`). Per-habit
tag colours (`--habit-rose`, `--habit-amber`, etc., set via `habitStyle()` in
[src/lib/ui.ts](src/lib/ui.ts)) are a separate, user-selectable concept and are
not part of the app-chrome palette above.

### Colour roles — Primary vs Secondary

The app previously used one "accent" colour for everything. It's now split by
role, and new UI should follow the same split:

- **Primary (emerald)** — main call-to-action buttons (Save, Export, Edit, Add
  habit), and "done / complete" data indicators (progress ring, day-strip
  fills, streak highlights). Solid primary buttons get a `hover:bg-accent-dark`
  state.
- **Secondary (indigo)** — navigation (the active tab in `AppShell`), text
  links, segmented/toggle controls (Theme, Week start, Import mode, cadence
  picker, Quotes tabs), and the "this is today" marker/ring — anything that's
  wayfinding or a selection state rather than a primary action.
- **Warning (amber)** — caution states that aren't destructive, e.g. a missed
  habit day in `DayDetail`.
- **Error (red)** — genuinely destructive or failed actions only: Delete,
  Reset everything, import/parse failures.
- **Success (green)** — confirmation of a completed action (e.g. the "import
  succeeded" banner in Settings). Distinct from Primary even though both are
  green-family — Success is reserved for one-off confirmation feedback, not
  persistent UI chrome.

### Layout

Mobile-first: a fixed bottom tab bar on phones (`AppShell`), a top bar past the
`sm:` breakpoint. Content is capped at `max-w-3xl` and centred. Respect
`env(safe-area-inset-bottom)` on anything fixed to the bottom of the viewport.
