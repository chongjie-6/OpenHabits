import "server-only";

/**
 * Where Better Auth believes it is hosted. See DESIGN.md §13.12.
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

/**
 * Whether this deployment could itself have produced a link at `candidate` —
 * that is, whether the origin is one `resolveBaseURL` above would have handed
 * Better Auth. See DESIGN.md §13.16.
 *
 * It exists because the mail queue puts a verification link somewhere other
 * than a variable on the stack: `email-queue.ts` writes the URL to Redis and
 * the worker reads it back and mails it. Nothing in the threat model lets an
 * attacker choose that value — the envelope id travels only in a signed QStash
 * message — but the whole of §13.12 is about this app being made to mail a
 * genuine, correctly-branded link into an origin it does not own, and a store
 * the request no longer holds is a second place that could be made to say so.
 * So the worker asks this before sending, and a compromise of the envelope
 * store buys a refused send rather than a phishing relay.
 *
 * Lives here rather than beside the queue because this is the module that owns
 * the question, and answering it anywhere else would be a second opinion about
 * the same environment.
 */
export function mailableOrigin(
  candidate: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;

  const allowedHosts = (env.BETTER_AUTH_ALLOWED_HOSTS ?? "")
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  // Mirrors `resolveBaseURL`'s precedence, including its forced `https` — a
  // link this app would only ever have built over TLS is not one to accept
  // back over plain http.
  if (allowedHosts.length > 0) {
    return (
      url.protocol === "https:" &&
      allowedHosts.some((host) => hostMatches(url.hostname, host))
    );
  }

  const configured = env.BETTER_AUTH_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin === url.origin;
    } catch {
      return false;
    }
  }

  // Neither set: production already threw on the way in, so this is the
  // development branch, where the only origin on offer is the developer's own.
  if (env.NODE_ENV === "production") return false;
  return (
    url.hostname === "localhost" ||
    url.hostname === "127.0.0.1" ||
    url.hostname === "[::1]"
  );
}

/**
 * A single leading `*.` wildcard, which is the form `.env.example` documents
 * (`*.vercel.app`). Matched against the label boundary rather than as a
 * substring, so `*.vercel.app` does not admit `evilvercel.app`, and it does not
 * match the bare apex either — `*.example.com` is not `example.com`, which is
 * how the allow-list is read elsewhere.
 */
function hostMatches(hostname: string, pattern: string): boolean {
  const host = hostname.toLowerCase();
  const allowed = pattern.toLowerCase();
  if (allowed.startsWith("*.")) {
    const suffix = allowed.slice(1); // keeps the dot: ".vercel.app"
    return host.endsWith(suffix) && host.length > suffix.length;
  }
  return host === allowed;
}
