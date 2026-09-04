import "server-only";

/**
 * The Better Auth instance behind `auth.ts`'s seam — the only file that knows
 * which provider was chosen. See DESIGN.md §13.6.
 *
 * Lazy, and memoised on `globalThis`, for the reason `lib/server/db.ts` is:
 * `betterAuth()` builds an adapter around a live database handle, and this app
 * must build and run with no `DATABASE_URL` at all (§13.1).
 *
 * No `nextCookies()` plugin. It exists so Better Auth can set cookies from
 * inside Server Actions, which reach for `next/headers`; everything here goes
 * through a Route Handler returning a real Response. Add it if sign-in ever
 * moves to a Server Action.
 */

import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb } from "./db";
import { resolveBaseURL } from "./base-url";
import * as authSchema from "./auth-schema";
import { mailerConfigured, sendResetPasswordEmail, sendVerificationEmail } from "../email";

const globalForAuth = globalThis as unknown as {
  // `ReturnType<typeof build>` rather than `ReturnType<typeof betterAuth>`:
  // Better Auth's return type is generic in the options it was given, and the
  // erased form is not assignable to the concrete one.
  openHabitsAuth?: ReturnType<typeof build>;
};

function build() {
  /**
   * Verification is mandatory — *when a mailer exists to make it possible*. With
   * no SMTP credentials there is no link to click, so requiring the click would
   * turn every sign-up into an account nobody can reach. Read once, which is
   * fine: the instance is memoised for the life of the process anyway.
   */
  const verificationRequired = mailerConfigured();

  return betterAuth({
    /**
     * `sendOnSignIn` is what makes "resend" work without a second endpoint, and
     * covers the mail that went to spam. `autoSignInAfterVerification` because
     * the click is the second factor already — with the consequence that the
     * session lands on whichever device opened the mail.
     *
     * Awaited because a serverless invocation can be frozen the moment it
     * returns, and a floating send may never leave. A failure fails the sign-up
     * (a reversal of §13.9 — see §13.10): Better Auth runs sign-up in a
     * transaction, so throwing rolls it back and frees the address to retry.
     * With no mailer nothing is required, so it logs and keeps the account.
     */
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        try {
          await sendVerificationEmail({ to: user.email, url });
        } catch (error) {
          console.error("[openhabits] verification email failed", error);
          if (verificationRequired) throw error;
        }
      },
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    },

    appName: "OpenHabits",

    /**
     * Signs the session cookie; rotating it invalidates every session. Unset in
     * development, fatal in production.
     *
     * `|| undefined` because an env key with nothing after the `=` yields `""`,
     * and an empty string is a *present* secret to Better Auth — it would sign
     * cookies with it instead of refusing to start.
     */
    secret: process.env.BETTER_AUTH_SECRET || undefined,

    /**
     * Pinned rather than inferred from the request. See `base-url.ts` and
     * DESIGN.md §13.12: the origin Better Auth resolves is the origin it mails
     * verification links into, and inferring it means taking it from a header
     * the caller controls.
     */
    baseURL: resolveBaseURL(),

    database: drizzleAdapter(getDb(), {
      provider: "pg",
      // Explicit rather than the whole schema module: the adapter resolves
      // models by property name, and this app's own `users` table would
      // otherwise be a candidate for Better Auth's `user` model.
      schema: {
        user: authSchema.user,
        session: authSchema.session,
        account: authSchema.account,
        verification: authSchema.verification,
      },
    }),

    /**
     * The address is verified before the first session exists, so `resolveUser`
     * needs no check of its own — a session is proof the mail was opened.
     * Recovering from a typo'd *address* is still manual (§13.10) — nothing can
     * mail a correction to an address nobody reads. Recovering a forgotten
     * password is not: see `sendResetPassword` below and §13.13.
     */
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      requireEmailVerification: verificationRequired,

      /**
       * Password reset — §13.8 #7, and the last thing §13.10 left open. Present
       * only when a mailer is: with no SMTP credentials Better Auth answers
       * `RESET_PASSWORD_DISABLED`, and `AccountCard` reads that to explain the
       * deployment cannot send rather than offering a link into nothing.
       *
       * A send that fails is logged and swallowed, the opposite of the
       * verification mail's behaviour, and for the opposite reason. There the
       * throw rolls back a sign-up and frees the address to retry; here there
       * is nothing to roll back, and the endpoint answers the same way for an
       * address it has never seen — so surfacing a send failure would turn this
       * into the account-enumeration oracle the endpoint is careful not to be.
       */
      sendResetPassword: async ({ user, url }) => {
        try {
          await sendResetPasswordEmail({ to: user.email, url });
        } catch (error) {
          console.error("[openhabits] password reset email failed", error);
        }
      },

      /**
       * An hour. Long enough to find the mail in spam, short enough that a
       * forwarded or logged link is not a standing key to the account.
       */
      resetPasswordTokenExpiresIn: 3600,

      /**
       * A reset is what someone does when they have lost control of the
       * password, so every existing session is one that might not be theirs.
       * The other devices are signed out, not wiped: each one discovers it on
       * its next sync, takes the 401, clears the hint (`lib/sync/client.ts`)
       * and keeps every habit it holds in IndexedDB.
       */
      revokeSessionsOnPasswordReset: true,
    },
  });
}

export function getAuth(): ReturnType<typeof build> {
  // A local rather than `??=` and a re-read: a mutable property on a global is
  // not narrowed by the assignment, so the second read is `T | undefined`.
  const existing = globalForAuth.openHabitsAuth;
  if (existing) return existing;

  const auth = build();
  globalForAuth.openHabitsAuth = auth;
  return auth;
}

export type Auth = ReturnType<typeof getAuth>;
