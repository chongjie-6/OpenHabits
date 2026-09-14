<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/banner-dark.svg">
  <img alt="OpenHabits — a habit tracker that draws your year as a contribution grid." src="docs/media/banner-light.svg" width="100%">
</picture>

<br>

**A habit tracker that draws your year as a contribution grid.**

Your habits live on your device, it works offline, and a tick is saved before your finger lifts.

<br>

<a href="https://habit-a.vercel.app/"><img alt="Try it live — no install, no sign-up" src="https://img.shields.io/badge/Try_it_live-no_install%2C_no_sign--up-216e39?style=for-the-badge"></a>

<br><br>

![MIT](https://img.shields.io/badge/license-MIT-216e39?style=flat-square)
![Next.js 16](https://img.shields.io/badge/Next.js-16.3-000?style=flat-square&logo=nextdotjs)
![React 19](https://img.shields.io/badge/React-19.2-087ea4?style=flat-square&logo=react)
![Tests](https://img.shields.io/badge/tests-433%20passing-30a14e?style=flat-square)
![PWA](https://img.shields.io/badge/PWA-installable-6741d9?style=flat-square)

</div>

---

## A year, one square per day

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="docs/media/year-dark.png">
  <img alt="A full year of habit completions as a contribution heatmap, with a Share button" src="docs/media/year-light.png" width="100%">
</picture>

Each square is a day, shaded by how much of it you finished. Rest days look different from missed ones, and a month with nothing scheduled stays empty instead of reading as zero.

Share the whole year as one image, drawn on a canvas in your browser from your own data:

<p align="center">
  <img alt="The generated share card: title, date range, the year's grid, and three figures — 23 day streak, 61% completed, 156 perfect days" src="docs/media/share-card.png" width="88%">
</p>

---

## Why OpenHabits

Most habit apps make you wait: a tick posts to a server, a spinner appears, and a half-second habit becomes one you quit. **OpenHabits never waits.** Your data lives on your device, every page is static HTML, and nothing between you and a tick touches the network.

|  | |
|---|---|
| ⚡ **Instant ticks** | Every write is local and optimistic. The UI never waits on the network. |
| 📴 **Truly offline** | An installable PWA. Nothing is fetched to render your day. |
| 🔒 **Private by default** | No account, no telemetry, no third parties. Export everything as JSON. |
| 🟩 **Your year at a glance** | A contribution grid, streaks, perfect days, weekday and monthly trends. |
| 💬 **A daily card** | 168 quotes and 85 fun facts, every one traceably sourced. |
| 🎨 **Three skins, any palette** | Three layouts in light and dark, plus a custom palette from a single colour. |
| 🔔 **Reminders on your clock** | 9am means 9am where you are, not where the server is. |
| ☁️ **Sync if you want it** | Optional accounts. Skip them and you lose a second device, nothing else. |

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
<td align="center"><b>Today</b><br><sub>Tap what you did.</sub></td>
<td align="center"><b>Week</b><br><sub>Backfill yesterday. Fix last Thursday.</sub></td>
<td align="center"><b>Stats</b><br><sub>A year of you, one square per day.</sub></td>
</tr>
</table>

<sub>Real screenshots, seeded with a year of demo data — see <code>scripts/screenshots/</code>.</sub>

---

## A daily card that never repeats too soon

<table>
<tr>
<td width="42%" valign="top">
<picture><source media="(prefers-color-scheme: dark)" srcset="docs/media/collection-dark.png"><img alt="The Collection screen: quotes and fun facts toggles, saved count, search, tag filters, and saved quotes each showing when it next comes round" src="docs/media/collection-light.png" width="100%"></picture>
</td>
<td valign="top">

Most quote apps hash the date, which gets you repeats, gaps, and a different quote on your phone than on your laptop.

OpenHabits deals from a shuffled deck instead. **Every entry appears once per pass, nothing repeats within 21 days, and every device shows the same card, with no server involved.** Because the order is known in advance, the Collection screen can tell you when a saved quote comes round next: *in 5 weeks*, *in 12 weeks*.

Narrow it by tag, or swap quotes for fun facts with one setting. Filter down to nothing and you get the whole deck back, because the card is never empty.

</td>
</tr>
</table>

---

## Make it look like yours

A skin changes the **layout**, not just the colours. `grid` puts your year above the fold, and `blocks` trades soft edges for tiles you can hit without looking.

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

**Pick one colour, get a whole palette.** All 20 tokens for light and dark are derived from a single seed, and the result is checked against WCAG AA whatever you pick.

Appearance is per device, so your phone can be dark `blocks` while your laptop stays light `classic`.

</td>
</tr>
</table>

---

## Try it

The fastest way is **[habit-a.vercel.app](https://habit-a.vercel.app/)** — no sign-up, and your browser's "Install app" puts it on your home screen.

To run your own:

```bash
npm install
npm run dev          # http://localhost:3000
```

Needs Node 24 (`.nvmrc`). **No environment variables are required**: with none set the app is fully functional and sync is simply off. To turn on accounts, sync or reminders, see **[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md)**.

---

## Accounts and sync: optional, and it stays that way

Sync copies your local store between devices. The server never becomes the owner of your data.

- **Self-hosted auth.** Email and password on the same Postgres as your habits, with row-level security on every table.
- **Conflicts converge.** Two devices editing the same habit agree instead of trading values forever.
- **Signing in asks first.** On a device that already has habits, nothing uploads until you confirm they're yours. Neither answer deletes anything.

---

## Under the hood

**Next.js 16** · **React 19** · **Tailwind CSS v4** · **TypeScript** · **IndexedDB**, with optional sync on **Better Auth** + **Postgres** + **Drizzle**.

Every route prerenders to static HTML and IndexedDB is the source of truth, so the only dynamic routes (sync, auth, reminders and mail) never sit between you and a tick. How it fits together, and the decisions worth knowing before you change anything, are in **[`CONTRIBUTING.md`](.github/CONTRIBUTING.md)** and **[`DESIGN.md`](DESIGN.md)**.

## Contributing

Start with **[`CONTRIBUTING.md`](.github/CONTRIBUTING.md)**. Changes are listed in **[`CHANGELOG.md`](CHANGELOG.md)**.

By taking part you agree to the [Code of Conduct](.github/CODE_OF_CONDUCT.md). Report security vulnerabilities through [`SECURITY.md`](.github/SECURITY.md), never a public issue.

## License

MIT © [chongjie-6](https://github.com/chongjie-6)
