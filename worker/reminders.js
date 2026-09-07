/**
 * The reminder sweep's scheduler. See DESIGN.md §8.5.
 *
 * It holds no logic of its own and deliberately knows nothing about habits,
 * timezones or push: `GET /api/cron/reminders` on the deployment decides who is
 * due. This exists only because that decision has to be made hourly — "9am" is
 * a wall clock and one daily run is nine o'clock in exactly one timezone — and
 * an hourly scheduler is the one piece Vercel's Hobby plan does not sell.
 *
 * `SITE_URL` is a var in wrangler.jsonc; `CRON_SECRET` is a secret
 * (`npx wrangler secret put CRON_SECRET`) and has to be the same value the
 * deployment itself holds.
 */

/**
 * The route declares `maxDuration = 60`, so past this the sweep is not coming
 * back and a hung fetch would otherwise hold the invocation open to no purpose.
 */
const TIMEOUT_MS = 60_000;

const scheduler = {
  /**
   * Awaited rather than handed to `ctx.waitUntil`, and it throws rather than
   * logging: a throw is what marks the cron invocation failed, and per §8.5 a
   * reminder that silently doesn't fire is the worst available outcome. The
   * scheduler is now one of the ways it can silently not fire.
   */
  async scheduled(_controller, env) {
    const site = (env.SITE_URL ?? "").replace(/\/$/, "");
    if (!site || !env.CRON_SECRET) {
      // Not a quiet no-op, unlike the CI workflow this replaced: that ran on
      // every repository, while this Worker exists only because someone
      // deployed it on purpose, so unset is a broken deployment and not a
      // deployment with reminders switched off.
      throw new Error("openhabits: SITE_URL var or CRON_SECRET secret is unset.");
    }

    const response = await fetch(`${site}/api/cron/reminders`, {
      headers: { Authorization: `Bearer ${env.CRON_SECRET}` },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    // The route explains itself in the body — 401 is a mismatched secret, 503 an
    // unset one, 200 with `skipped` a deployment with no database or VAPID pair
    // — so log it either way and fail on the status alone.
    const body = await response.text();
    console.log("openhabits: sweep returned", response.status, body);

    if (!response.ok) {
      throw new Error(`openhabits: sweep returned ${response.status}`);
    }
  },
};

export default scheduler;
