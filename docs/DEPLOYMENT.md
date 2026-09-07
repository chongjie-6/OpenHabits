# Deploying OpenHabits

Setting nothing is a supported configuration. This document is for the two
things that are not the default: turning on accounts and sync, and turning on
reminders. `.env.example` carries the full commentary on every variable.

---

## Configuration

`DATABASE_URL` is what turns accounts on, and in production it brings two
obligations with it: `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`, each fatal when
missing.

```bash
DATABASE_URL=postgres://…   # turns on sync and accounts; unset → 503, app unaffected
BETTER_AUTH_SECRET=         # signs session cookies; required in production
BETTER_AUTH_URL=            # the app's public origin; required in production
BETTER_AUTH_ALLOWED_HOSTS=  # instead of the above, for a multi-host deployment
SMTP_USER=                  # a Gmail app password, not the account password
SMTP_PASSWORD=
MAIL_FROM=                  # From header; defaults to "OpenHabits <SMTP_USER>"
VAPID_PUBLIC_KEY=           # npx web-push generate-vapid-keys
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=              # mailto: or https: contact; falls back to BETTER_AUTH_URL
CRON_SECRET=                # authenticates the hourly reminder sweep

npm run db:migrate
```

**Daily reminders are an hourly cron plus a per-device timezone.** "9am" is a
wall clock, so one daily invocation would only ever be nine o'clock in a single
timezone; `.github/workflows/reminders.yml` calls `/api/cron/reminders` every
hour and the sweep asks each subscription whether it is that user's hour
*there*. Without the VAPID pair the Settings card says the deployment cannot
send rather than offering a switch, and without `CRON_SECRET` the cron route
refuses to run at all — it reads every account's habits, so unset means
disabled, not open.

**The app is told its own origin rather than working it out.** Inferring it
means reading the request's `Host` header, and that origin is what verification
links are built from — while `/api/auth/send-verification-email` takes any
address and no session. A forged `Host` would have this app mail a genuine link
into an attacker's server. Development still infers; production fails to start
accounts until `BETTER_AUTH_URL` (or `BETTER_AUTH_ALLOWED_HOSTS`) is set.

**Email verification follows the mailer, not a flag.** With SMTP credentials
set, sign-up creates no session — the link in the mail does, an unverified
sign-in 403s and resends on the way out, and a failed send fails the sign-up so
the address isn't held hostage against a retry. With no credentials, requiring a
click that no mail can deliver would break sign-up entirely, so verification is
off.

### Local development against a real database, without signing in

```bash
OPENHABITS_DEV_USER_ID=dev                  # every request becomes this account
OPENHABITS_DEV_USER_EMAIL=you@example.com   # optional; defaults to <id>@openhabits.local
```

This is a bypass, not a stand-in, and is ignored when `NODE_ENV=production`.

---

## Vercel

Zero-config: it's a stock Next app and it builds with no environment set at all
— a first deploy works before the database exists, with sync and accounts
answering 503. Node comes from `engines` in `package.json` (Vercel doesn't read
`.nvmrc`; CI does).

Set these on the project, for Production **and** Preview:

```bash
DATABASE_URL=                # Neon's *pooled* connection string, ?sslmode=require
BETTER_AUTH_SECRET=          # a different value per environment
BETTER_AUTH_ALLOWED_HOSTS=openhabits.example,*.vercel.app
SITE_URL=https://openhabits.example   # link previews only; Production, not Preview
SMTP_USER=
SMTP_PASSWORD=
MAIL_FROM=OpenHabits <you@example.com>
VAPID_PUBLIC_KEY=            # omit the pair to ship with reminders switched off
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:you@example.com
CRON_SECRET=                 # the scheduler sends this as the cron's Authorization header
```

**One cron job, hourly — from GitHub Actions, not Vercel.** A single entry is
enough because the fan-out across timezones happens inside the sweep. What it
needs is a scheduler allowing a sub-daily interval, and Vercel Cron is capped at
daily below Pro. So `.github/workflows/reminders.yml` holds the schedule and
curls the endpoint; it needs the repository variable `SITE_URL`, the secret
`CRON_SECRET`, and the production deployment reachable without Vercel
Authentication.

**`BETTER_AUTH_ALLOWED_HOSTS`, not `BETTER_AUTH_URL`.** Every preview deployment
answers on its own `*.vercel.app` host, and one pinned origin would mail a
preview's visitors a verification link into production.

**`regions` in `vercel.json` must match the Neon region.** It's pinned to `iad1`
— every sync request is several round trips to Postgres inside one
advisory-locked transaction, so a function in Virginia talking to a database in
Frankfurt pays that latency several times over.

**`SITE_URL` is Production-only.** It decides what a link preview's image URL
says, and a preview deployment stamping its own `*.vercel.app` host into a card
that gets shared outlives the deployment it names.

**Pool through Neon's `-pooler` host.** `lib/server/db.ts` opens one connection
per instance with `prepare: false` precisely so a pooler can hand out a
different backend per checkout.

**Migrations do not run on deploy.** Run `npm run db:migrate` against the
production `DATABASE_URL` before promoting a build that needs it — the
alternative is a build step with authority over tables holding history that
exists nowhere else. Give previews their own Neon branch unless you want them
writing to real accounts.

**`DATABASE_URL` must not be a superuser.** Every table is under row-level
security, and a role with `BYPASSRLS` ignores the lot with no error to notice.
Neon's default role is fine; `postgres` on a local install is not. `db:migrate`
warns when the role applying it is a superuser.

**Production is deployed from CI, not from the Git integration.** `vercel.json`
sets `git.deploymentEnabled.main` to `false`, because Vercel and GitHub Actions
subscribe to the same push webhook independently — left on, Vercel ships a build
whose tests are still running, or have already failed. The `deploy` job in
`.github/workflows/ci.yml` runs `needs: verify` and does what the integration
did:

```bash
vercel pull --yes --environment=production
vercel build --prod
vercel deploy --prebuilt --prod
```

It needs three repository secrets — `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`. Preview branches still deploy from Git, ungated.
