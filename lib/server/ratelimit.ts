import "server-only";

/**
 * Metering for the endpoints. See DESIGN.md §13.17.
 *
 * **This module fails open, and it is the only one here that does.** Every other
 * gate on the server side refuses when it cannot answer — `/api/cron/reminders`
 * with no secret, `resolveUser` on a thrown session lookup, an RLS policy that
 * is not true. A limiter is the opposite case: its store being unreachable is
 * not evidence of abuse, and turning a Redis outage into a site-wide 429 would
 * hand an attacker the outage as a denial of service. So a timeout or an error
 * is a request allowed, and the timeout is short enough that the failure costs
 * latency rather than a hung handler.
 *
 * The limiters are built at module scope because `ephemeralCache` — on by
 * default — is only worth anything when it outlives the request: an
 * already-blocked identifier is then answered without touching Redis at all.
 */

import { Ratelimit } from "@upstash/ratelimit";
import { getRedis, redisConfigured } from "./redis";

/**
 * Every key this app writes lives under one prefix, so the Redis database can be
 * shared with the mail envelopes (and anything later) without either being able
 * to name the other's keys.
 */
const PREFIX = "openhabits:rl";

/** Long enough for a REST round trip to Upstash, short enough that failing open
 * costs less than waiting. */
const TIMEOUT_MS = 1500;

export type Tier =
  /** Every `/api` request, keyed by IP. The generous one. */
  | "global"
  /** Auth paths that cause mail to be sent. Keyed by IP, and by address. */
  | "mail"
  /** Auth paths that verify or set a credential. Keyed by IP. */
  | "credential"
  /** `POST /api/sync`, keyed by account. */
  | "sync"
  /** `POST /api/reminders`, keyed by account. */
  | "reminders";

type Limiters = { tiers: Record<Tier, Ratelimit>; mailDaily: Ratelimit };

const globalForLimits = globalThis as unknown as {
  openHabitsLimiters?: Limiters;
};

function build(): Limiters {
  const shared = { redis: getRedis(), timeout: TIMEOUT_MS, analytics: true };
  const window = (tokens: number, span: Parameters<typeof Ratelimit.slidingWindow>[1]) =>
    Ratelimit.slidingWindow(tokens, span);

  return {
    tiers: {
      /**
       * 300 a minute is far above anything the app does: a sync round trip is
       * one request, the shell is static and served from the CDN, and the
       * reminder heartbeat fires on app start. The number is chosen so nobody
       * using the app ever meets it, which is what makes it safe to put in
       * front of everything.
       */
      global: new Ratelimit({ ...shared, prefix: `${PREFIX}:global`, limiter: window(300, "60 s") }),

      /**
       * The tightest tier, because these paths spend a resource that is not
       * ours: an SMTP quota, and somebody else's inbox.
       */
      mail: new Ratelimit({ ...shared, prefix: `${PREFIX}:mail`, limiter: window(3, "60 s") }),

      /** Each of these is a password hash verify, and the shape of a brute force. */
      credential: new Ratelimit({ ...shared, prefix: `${PREFIX}:cred`, limiter: window(10, "60 s") }),

      /**
       * Well above the client's real cadence — it syncs on change, on focus and
       * on reconnect, not on a timer. What this bounds is the cost of the
       * account-wide advisory lock and a full-history pull being asked for in a
       * loop.
       */
      sync: new Ratelimit({ ...shared, prefix: `${PREFIX}:sync`, limiter: window(60, "60 s") }),

      reminders: new Ratelimit({ ...shared, prefix: `${PREFIX}:rem`, limiter: window(30, "60 s") }),
    },

    /**
     * The second half of the mail tier, and the half that matters. Three a
     * minute per IP is trivially defeated by rotating them, and the thing worth
     * preventing is not load but one address being mailed over and over — so the
     * budget that follows the *address* is a day long.
     */
    mailDaily: new Ratelimit({
      ...shared,
      prefix: `${PREFIX}:mail-daily`,
      limiter: window(10, "24 h"),
    }),
  };
}

function limiters(): Limiters {
  // A local and a re-read rather than `??=`, for the reason `getAuth` does it:
  // a mutable property on a global is not narrowed by the assignment.
  const existing = globalForLimits.openHabitsLimiters;
  if (existing) return existing;

  const built = build();
  globalForLimits.openHabitsLimiters = built;
  return built;
}

/** Whether metering is configured at all. The store is the only requirement. */
export function rateLimitConfigured(): boolean {
  return redisConfigured();
}

/**
 * The caller's address as the platform reports it. `NextRequest.ip` was removed
 * in Next 15, and reading these headers is what replaced it.
 *
 * `x-forwarded-for` is a chain the client can prepend to, so only the *first*
 * entry is worth anything — and only because Vercel's proxy overwrites the
 * header rather than appending to it. Behind a proxy that appends, this is the
 * function to revisit.
 *
 * Pure, so it is testable with no store — the same reason `base-url.ts` takes
 * its environment as a parameter.
 */
export function clientIp(headers: Headers): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return headers.get("x-real-ip")?.trim() || null;
}

/** Better Auth paths that send mail. */
const MAIL_PATHS = new Set(["send-verification-email", "request-password-reset", "forget-password"]);

/** Better Auth paths that verify or set a credential. */
const CREDENTIAL_PATHS = new Set(["sign-in/email", "sign-up/email", "reset-password"]);

/**
 * Which tier an `/api/auth/…` path falls into, or `null` for the rest of the
 * catch-all — session reads, sign-out, callbacks — which the global tier covers
 * and which cost nothing in particular.
 *
 * Matched on the tail rather than the whole path, because the catch-all's own
 * prefix is not what distinguishes them. Pure, so `tests/server/ratelimit.test.ts`
 * can pin the mapping without a store: splitting it out is what keeps the
 * interesting decision testable while the store stays untestable.
 */
export function authTier(pathname: string): Tier | null {
  const tail = pathname.replace(/^\/api\/auth\//, "").replace(/\/+$/, "");
  if (MAIL_PATHS.has(tail)) return "mail";
  if (CREDENTIAL_PATHS.has(tail)) return "credential";
  return null;
}

/**
 * Whether the global tier applies to a path. `/api/email` and
 * `/api/cron/reminders` are excluded: both authenticate their caller by
 * signature or shared secret, both are called by a machine on a schedule the app
 * does not control, and a limiter in front of either can only ever refuse a
 * legitimate request. `proxy.ts`'s matcher says the same thing in a form Next
 * can read; this is the copy that is testable, and they have to agree.
 */
export function metered(pathname: string): boolean {
  if (!pathname.startsWith("/api/")) return false;
  return pathname !== "/api/email" && !pathname.startsWith("/api/cron/");
}

export type Verdict = { ok: true } | { ok: false; retryAfter: number };

const ALLOWED: Verdict = { ok: true };

/**
 * Seconds until the window has room again, rounded up and floored at one: a
 * `Retry-After: 0` invites the retry it is meant to delay.
 */
function secondsUntil(reset: number): number {
  return Math.max(1, Math.ceil((reset - Date.now()) / 1000));
}

/**
 * Allows the request when metering is off, when the identifier is unknown, or
 * when the store cannot answer. See the fail-open note at the top of the file.
 */
export async function check(tier: Tier, identifier: string | null): Promise<Verdict> {
  if (!rateLimitConfigured() || !identifier) return ALLOWED;

  try {
    const { success, reset } = await limiters().tiers[tier].limit(identifier);
    return success ? ALLOWED : { ok: false, retryAfter: secondsUntil(reset) };
  } catch (cause) {
    console.error(`[openhabits] rate limit check failed (${tier})`, cause);
    return ALLOWED;
  }
}

/**
 * The mail tier, both halves. The per-minute budget follows the caller and the
 * daily one follows the address, and either can refuse — someone rotating IPs
 * meets the second, a stuck client meets the first.
 *
 * `address` is optional because the body it comes from may not have parsed, and
 * an unparseable body is Better Auth's to answer for rather than this module's.
 */
export async function checkMail(ip: string | null, address: string | null): Promise<Verdict> {
  const perIp = await check("mail", ip);
  if (!perIp.ok) return perIp;

  if (!rateLimitConfigured() || !address) return ALLOWED;

  try {
    // Lower-cased so the budget follows the address rather than its spelling.
    const { success, reset } = await limiters().mailDaily.limit(address.trim().toLowerCase());
    return success ? ALLOWED : { ok: false, retryAfter: secondsUntil(reset) };
  } catch (cause) {
    console.error("[openhabits] rate limit check failed (mail-daily)", cause);
    return ALLOWED;
  }
}

/**
 * 429 with a `Retry-After`, and prose in the body like every other refusal this
 * server makes. `no-store` for the reason the rest of `/api` sets it — a cached
 * 429 would outlive the window it describes.
 */
export function tooMany(message: string, seconds: number): Response {
  return Response.json(
    { error: "rate-limited", message },
    { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(seconds) } },
  );
}
