"use client";

/**
 * Where the link in the reset email lands. See DESIGN.md §13.13.
 *
 * A page rather than a panel inside Settings, because the person arriving here
 * is following a link from an email client and may never have had this app open
 * on this device. It is static like everything else: the token comes from
 * `?token=`, read on the client, for the same reason `/habit` takes its id that
 * way (§2.2) — a dynamic segment could not be prerendered, and this page has to
 * work from a cold cache.
 *
 * Better Auth's `GET /api/auth/reset-password/:token` is what actually redirects
 * here, and it has already checked that the token exists and has not expired —
 * an invalid one arrives as `?error=INVALID_TOKEN` instead. That check is not
 * trusted twice: `resetPassword` below consumes the token server-side, and its
 * answer is the one that decides.
 */

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { authClient } from "@/lib/session";

/** Better Auth's own minimum, restated so the form can say it before submitting. */
const MIN_PASSWORD = 10;

type Status =
  /** Before hydration, when the query string has not been read yet. */
  | { kind: "reading" }
  | { kind: "ready"; token: string }
  | { kind: "bad-link" }
  | { kind: "done" };

/** The URL never changes under this page, so there is nothing to subscribe to. */
const NEVER_CHANGES = () => () => {};

/**
 * The token from `?token=`, or null when the link carried none.
 *
 * `undefined` on the server and through hydration — the same shape as
 * `useMounted` in `AccountCard` and for the same reason (§8.4): this HTML is
 * prerendered and cached by the service worker, so the *absence* of a token has
 * to be the state that renders on the server. Reporting "bad link" first and
 * correcting it after hydration would flash a failure at everyone who arrived
 * with a perfectly good one.
 *
 * A `useSearchParams` read would opt the route out of static prerendering, and
 * the whole app is static (§8.1). Returning a string keeps `getSnapshot` stable:
 * strings compare by value, so React sees no change between renders.
 */
function useResetToken(): string | null | undefined {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => new URLSearchParams(window.location.search).get("token"),
    () => undefined,
  );
}

export default function ResetPasswordPage() {
  const token = useResetToken();
  const [done, setDone] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status: Status = done
    ? { kind: "done" }
    : token === undefined
      ? { kind: "reading" }
      : token === null
        ? { kind: "bad-link" }
        : { kind: "ready", token };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (status.kind !== "ready") return;

    setBusy(true);
    setError(null);
    const result = await authClient.resetPassword({
      newPassword: password,
      token: status.token,
    });
    setBusy(false);

    if (result.error) {
      // The token is consumed on the first successful attempt, so a failure
      // here is usually a link that was already used or has since expired.
      setError(result.error.message ?? "That link did not work. Ask for a new one.");
      return;
    }

    // No session is created, deliberately: whoever opened the mail proves they
    // hold the address, not that they are at a device the account should stay
    // signed in on. They sign in with the new password like anyone else.
    setDone(true);
  }

  return (
    <section className="space-y-6">
      <h1 className="display-type text-[15px]">Choose a new password</h1>

      <div className="surface-card bg-surface p-4">
        {status.kind === "reading" && (
          <div aria-hidden="true" className="h-24 animate-pulse rounded-control bg-surface-2" />
        )}

        {status.kind === "bad-link" && (
          <>
            <p className="text-[13px] leading-relaxed">
              This link is not valid any more. Reset links work once and expire
              after an hour.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Nothing has changed on the account, and the habits on this device
              are untouched. Ask for a new link from the account card in
              Settings.
            </p>
            <div className="mt-3">
              <Link
                href="/settings"
                className="inline-flex h-10 items-center rounded-control border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
              >
                Back to Settings
              </Link>
            </div>
          </>
        )}

        {status.kind === "done" && (
          <>
            <p role="status" className="text-[13px] leading-relaxed">
              Password changed. Every device that was signed in has been signed
              out, including any you no longer have.
            </p>
            <p className="mt-2 text-[12px] leading-relaxed text-muted">
              Their habits are still on them — signing out never deletes what is
              on a device. Sign in again with the new password.
            </p>
            <div className="mt-3">
              <Link
                href="/settings"
                className="inline-flex h-10 items-center rounded-control border border-accent bg-accent px-3 text-[13px] font-medium text-accent-fg"
              >
                Sign in
              </Link>
            </div>
          </>
        )}

        {status.kind === "ready" && (
          <form onSubmit={submit} className="space-y-2">
            {error && (
              <div
                role="alert"
                className="rounded-control border border-danger px-3 py-2 text-[12px] leading-relaxed text-danger"
              >
                {error}
              </div>
            )}

            <label className="block">
              <span className="text-[11px] font-medium text-muted">New password</span>
              <input
                type="password"
                value={password}
                required
                minLength={MIN_PASSWORD}
                autoComplete="new-password"
                onChange={(event) => {
                  setPassword(event.target.value);
                  setError(null);
                }}
                className="mt-1 h-10 w-full rounded-control border border-border bg-surface-2 px-3 text-[14px] outline-none focus:border-accent"
              />
            </label>

            <p className="text-[11px] leading-relaxed text-muted">
              At least {MIN_PASSWORD} characters. Setting it signs out every
              device that was signed in to this account.
            </p>

            <div className="pt-1">
              <button
                type="submit"
                disabled={busy || password.length < MIN_PASSWORD}
                className="h-10 rounded-control border border-accent bg-accent px-3 text-[13px] font-medium text-accent-fg transition-opacity disabled:opacity-50"
              >
                {busy ? "Saving…" : "Set password"}
              </button>
            </div>
          </form>
        )}
      </div>
    </section>
  );
}
