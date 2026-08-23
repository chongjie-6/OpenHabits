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
import { mailerConfigured, sendVerificationEmail } from "../email";

const globalForAuth = globalThis as unknown as {
  // `ReturnType<typeof build>` rather than `ReturnType<typeof betterAuth>`:
  // Better Auth's return type is generic in the options it was given, and the
  // erased form is not assignable to the concrete one.
  hapiAuth?: ReturnType<typeof build>;
};

function build() {
  /**
   * Verification is mandatory — *when a mailer exists to make it possible*.
   *
   * The rule from §13.1 that every variable is optional outranks this one: with
   * no `SMTP_USER` / `SMTP_PASSWORD` there is no link to click, so requiring the
   * click would turn every sign-up into an account nobody can ever reach, local
   * development included. So the requirement follows the mailer. Read once here
   * rather than per request, which is fine — the instance is memoised for the
   * life of the process anyway, and credentials added without a restart were
   * never going to take effect either.
   */
  const verificationRequired = mailerConfigured();

  return betterAuth({
    /**
     * A verification mail goes out on sign-up, and again on every sign-in
     * attempt by an unverified account — which is what makes "resend" work
     * without a second endpoint, and covers the mail that went to spam.
     *
     * `autoSignInAfterVerification` because the click is the second factor
     * already: whoever opened that link holds the mailbox. Making them then type
     * the password again on a device that just proved ownership buys nothing.
     * Note the consequence — the session lands on whichever device opened the
     * mail, which is not necessarily the one that signed up.
     *
     * The send is awaited, and a failure now **fails the sign-up** rather than
     * being swallowed (a reversal of §13.9 — see §13.10). Awaited because a
     * serverless invocation can be frozen the moment it returns, and a floating
     * send is a send that may never leave. Fatal because verification is
     * required: an account whose only mail never arrived is an account its owner
     * cannot sign in to, and Better Auth runs sign-up in a transaction, so
     * throwing rolls the whole thing back and leaves the address free to retry.
     * With no mailer configured nothing is required and the old behaviour
     * stands: log it, keep the account.
     */
    emailVerification: {
      sendVerificationEmail: async ({ user, url }) => {
        try {
          await sendVerificationEmail({ to: user.email, url });
        } catch (error) {
          console.error("[hapi] verification email failed", error);
          if (verificationRequired) throw error;
        }
      },
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: true,
    },

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
     * third-party account. The address is verified before the first session
     * exists, so `resolveUser` needs no check of its own: a session is proof
     * the mail was opened.
     *
     * `requireEmailVerification` is conditional for the reason above, and that
     * is the honest way round — it is a promise the app can only keep when it
     * can send mail. Recovering from a typo'd address is still manual (§13.10):
     * there is no password reset, and the habits stay on the device either way.
     */
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      requireEmailVerification: verificationRequired,
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
