import "server-only";

/**
 * The Better Auth instance. See DESIGN.md §13.6.
 *
 * This is the implementation behind `auth.ts`'s seam, and it is the only file
 * that knows which provider was chosen. `resolveUser` calls into it; nothing
 * else does.
 *
 * ## Why it is lazy
 *
 * `betterAuth()` builds an adapter around a live database handle, and this app
 * is required to build and run with no `DATABASE_URL` at all (§13.1) — the
 * endpoint answers 503 and the app is untouched. Constructing at module scope
 * would make importing the route enough to throw on a machine without a
 * database, which is exactly the failure `lib/server/db.ts` is lazy to avoid.
 * Same trick, same reason: memoised on `globalThis` so hot reloads and warm
 * starts reuse one instance rather than opening a connection pool each time.
 *
 * ## No `nextCookies()` plugin
 *
 * That plugin exists so Better Auth can set cookies from inside Server Actions,
 * which reach for `next/headers` rather than returning a Response. Everything
 * here goes through a Route Handler that returns a real Response with real
 * Set-Cookie headers, so the plugin would add a request-scoped Next API to a
 * module that is otherwise a plain function of its arguments. Add it if sign-in
 * ever moves to a Server Action.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "./db";
import * as authSchema from "./auth-schema";

const globalForAuth = globalThis as unknown as {
  // `ReturnType<typeof build>` rather than `ReturnType<typeof betterAuth>`:
  // Better Auth's return type is generic in the options it was given, and the
  // erased form is not assignable to the concrete one.
  hapiAuth?: ReturnType<typeof build>;
};

function build() {
  return betterAuth({
    appName: "hapi",

    /**
     * Unset in development, where Better Auth falls back to a fixed dev secret,
     * and fatal in production if still missing — which is the correct way round.
     * Rotating it invalidates every session; it signs the session cookie.
     *
     * `|| undefined` rather than the bare value because an env file that lists a
     * key with nothing after the `=` yields `""`, and an empty string is a
     * *present* secret as far as Better Auth is concerned — it would sign
     * cookies with it instead of refusing to start.
     */
    secret: process.env.BETTER_AUTH_SECRET || undefined,

    /**
     * Inferred from the request when unset, which is right for local dev and for
     * a single-domain deployment. Set it explicitly behind a proxy that rewrites
     * Host, or the callback URLs will point somewhere the browser cannot reach.
     */
    baseURL: process.env.BETTER_AUTH_URL || undefined,

    database: drizzleAdapter(getDb(), {
      provider: "pg",
      // Passed explicitly rather than handing over the whole schema module: the
      // adapter resolves models by property name, and this app's own `users`
      // table would otherwise be a candidate for Better Auth's `user` model.
      schema: {
        user: authSchema.user,
        session: authSchema.session,
        account: authSchema.account,
        verification: authSchema.verification,
      },
    }),

    /**
     * Email and password, because it is the only method that works with no
     * third-party account and no outbound email — and an unverified address is
     * accepted deliberately. `email` is not an identity claim here; it is a
     * label on an account whose real key is an opaque id. Nothing is sent to it
     * and nothing is authorised by it. Turn on `requireEmailVerification` at the
     * same time as wiring a mailer, not before, or the first sign-up locks
     * itself out.
     */
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
    },
  });
}

export function getAuth(): ReturnType<typeof build> {
  // Via a local rather than `??=` and a re-read: a mutable property on a global
  // is not narrowed by the assignment, so the second read is `T | undefined`.
  const existing = globalForAuth.hapiAuth;
  if (existing) return existing;

  const auth = build();
  globalForAuth.hapiAuth = auth;
  return auth;
}

export type Auth = ReturnType<typeof getAuth>;
