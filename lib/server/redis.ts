import "server-only";

/**
 * The Upstash Redis handle, behind the same shape as `lib/server/db.ts`: lazy,
 * memoised on `globalThis`, and paired with a predicate that answers honestly
 * instead of throwing. See DESIGN.md §13.17.
 *
 * None of `db.ts`'s pooling reasoning applies here, and the resemblance should
 * not invite it: this client speaks HTTP against a REST endpoint, so there is no
 * connection to hold open, no per-session state to invalidate and nothing to
 * exhaust. The memoisation is only to avoid rebuilding the object per request.
 *
 * Two consumers, and both are optional features: `ratelimit.ts` meters the
 * endpoints, and `email-queue.ts` stores the envelope whose id it hands QStash.
 * With these variables unset the app is the app it was before either existed.
 */

import { Redis } from "@upstash/redis";

const globalForRedis = globalThis as unknown as {
  openHabitsRedis?: Redis;
};

function credentials(): { url: string; token: string } {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    throw new Error(
      "UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are not both set. " +
        "Rate limiting and the mail queue are unavailable; see .env.example.",
    );
  }
  return { url, token };
}

/**
 * Lazy for the reason `getDb` is: importing this module must not require the
 * credentials, or a build-time trace of any route that touches it fails on a
 * machine with none.
 */
export function getRedis(): Redis {
  const existing = globalForRedis.openHabitsRedis;
  if (existing) return existing;

  const { url, token } = credentials();
  // `automaticDeserialization` left on (the default): both consumers store JSON
  // and read it back as an object, which is what the SDK does for them.
  const redis = new Redis({ url, token });
  globalForRedis.openHabitsRedis = redis;
  return redis;
}

/**
 * Whether Redis is configured at all. Both halves, or neither is usable.
 *
 * `env` is a parameter for the reason `base-url.ts:resolveBaseURL` takes one:
 * `email-queue.ts:queueConfigured` folds this into its own answer, and that
 * answer is worth testing without setting variables for the whole run.
 */
export function redisConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.UPSTASH_REDIS_REST_URL) && Boolean(env.UPSTASH_REDIS_REST_TOKEN);
}
