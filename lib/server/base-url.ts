import "server-only";

/**
 * Where Better Auth believes it is hosted. See DESIGN.md §13.11.
 *
 * Alone in a file with no imports, for the reason `auth-types.ts` is: the rule
 * is testable without booting an auth stack.
 *
 * Left unset, Better Auth infers its origin from the request — which means the
 * `Host` header, which the client sends. That inferred origin is what
 * verification links are built from, and `POST /api/auth/send-verification-email`
 * accepts any address with no session at all: a request carrying a forged `Host`
 * makes this app mail a genuine, correctly-branded link pointing at somebody
 * else's server, with a token `autoSignInAfterVerification` turns into a session
 * on arrival. So inference is confined to development, and a production
 * deployment has to say where it lives.
 */

export type BaseURL =
  | string
  | { allowedHosts: string[]; fallback?: string; protocol?: "http" | "https" | "auto" }
  | undefined;

/**
 * `env` is a parameter rather than a read of `process.env`, so the production
 * branch can be tested without setting `NODE_ENV` for the whole run.
 */
export function resolveBaseURL(env: NodeJS.ProcessEnv = process.env): BaseURL {
  const url = env.BETTER_AUTH_URL?.trim() || undefined;
  const allowedHosts = (env.BETTER_AUTH_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  /**
   * Checked first, because a deployment serving several hosts — preview URLs
   * beside a custom domain — has no single right answer for `BETTER_AUTH_URL`,
   * and pinning one of them mails the other's visitors a link into the wrong
   * origin. Better Auth resolves per request against this list and refuses every
   * host outside it, which is the property that matters. `https` rather than
   * `auto`: a proxy terminating TLS leaves the app seeing plain http, and a
   * verification link is not a thing to downgrade.
   */
  if (allowedHosts.length > 0) return { allowedHosts, fallback: url, protocol: "https" };
  if (url) return url;

  if (env.NODE_ENV === "production") {
    throw new Error(
      "BETTER_AUTH_URL is not set. Accounts have to know their own public URL: " +
        "with neither it nor BETTER_AUTH_ALLOWED_HOSTS, Better Auth takes the origin " +
        "from the request's Host header, and mails verification links to wherever that " +
        "points. See .env.example. Habits, sync and the rest of the app are unaffected.",
    );
  }

  return undefined;
}
