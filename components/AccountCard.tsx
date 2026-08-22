"use client";

/**
 * Sign in, sign out, and the sync state that follows from them. See DESIGN.md §13.6.
 *
 * Everything here is gated on `mounted`, which is the §8.4 rule rather than
 * caution: these routes prerender to static HTML and the service worker caches
 * it, so anything account-shaped rendered on the server would be handed to the
 * next visitor. The server snapshot is "signed out, and not yet sure", and the
 * real state only ever replaces it after hydration.
 */

import { useState, useSyncExternalStore } from "react";
import { authClient, markSignedIn, markSignedOut } from "@/lib/session";
import { adoptAccount, useHapi, type SyncStatus } from "@/lib/store";
import { syncNow } from "@/lib/sync/client";

type Mode = "sign-in" | "sign-up";

/**
 * False on the server and through hydration, true afterwards.
 *
 * The house pattern for browser-only state (`DownloadAppButton`, `lib/session.ts`):
 * a `useSyncExternalStore` whose server snapshot reports the hidden case, rather
 * than a `setState` in an effect. Same reason as §8.4 — the prerendered HTML is
 * cached by the service worker, so the account UI must be something that only
 * ever appears, never something that flashes and disappears.
 */
const NEVER_CHANGES = () => () => {};

function useMounted(): boolean {
  return useSyncExternalStore(
    NEVER_CHANGES,
    () => true,
    () => false,
  );
}

export function AccountCard() {
  const { data: session, isPending } = authClient.useSession();
  const { syncStatus } = useHapi();
  const mounted = useMounted();

  if (!mounted || isPending) {
    return (
      <Card>
        <div aria-hidden="true" className="h-24 animate-pulse rounded-control bg-surface-2" />
      </Card>
    );
  }

  return (
    <Card>
      {session?.user ? (
        <SignedIn email={session.user.email} syncStatus={syncStatus} />
      ) : (
        <SignedOut />
      )}
    </Card>
  );
}

function SignedOut() {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** The address waiting on a click, or null. Both routes into §13.10 set it. */
  const [awaiting, setAwaiting] = useState<string | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const credentials = { email: email.trim(), password };
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            ...credentials,
            // The schema requires a name and this app never asks for one. The
            // local part of the address is a better placeholder than an empty
            // string, which would look like a bug in any admin tool.
            name: credentials.email.split("@")[0] || "hapi",
          })
        : await authClient.signIn.email(credentials);

    setBusy(false);

    if (result.error) {
      // Signing in before the link is clicked is a 403, and the server has
      // already sent a fresh mail on its way out (`sendOnSignIn`) — so this is
      // not a failure to report, it is the wait, entered from the other side.
      if (result.error.code === "EMAIL_NOT_VERIFIED") {
        setAwaiting(credentials.email);
        setPassword("");
        return;
      }
      setError(result.error.message ?? "That did not work. Try again.");
      return;
    }

    // A sign-up under mandatory verification creates no session — Better Auth
    // returns a null token — so there is nothing to sync yet and the hint must
    // stay unset, or `lib/sync/client.ts` spends the wait collecting 401s. With
    // no mailer configured the token is real and this is the old path.
    if (!result.data?.token) {
      setAwaiting(credentials.email);
      setPassword("");
      return;
    }

    // The hint is what lets `lib/sync/client.ts` decide to sync without asking
    // the network first. Set here rather than waiting for `useSessionSync` to
    // notice, so the first sync starts on this tick instead of the next fetch.
    markSignedIn();
    void syncNow();
  }

  if (awaiting !== null) {
    return (
      <AwaitingVerification
        email={awaiting}
        onDone={() => {
          setMode("sign-in");
          setAwaiting(null);
        }}
      />
    );
  }

  return (
    <>
      <p className="text-[13px] leading-relaxed text-muted">
        An account keeps your habits on your other devices. It is entirely
        optional — everything works signed out, and nothing leaves this device
        until you sign in. Habits already here are added to the account when you
        do.
      </p>

      <form onSubmit={submit} className="mt-3 space-y-2">
        <Field
          label="Email"
          type="email"
          value={email}
          autoComplete="username"
          onChange={setEmail}
        />
        <Field
          label="Password"
          type="password"
          value={password}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          onChange={setPassword}
        />

        {mode === "sign-up" && (
          <p className="text-[11px] leading-relaxed text-muted">
            At least 10 characters. We send a link to confirm the address before
            the account can be used, so use one you can open. There is no
            password reset yet — if you lose it your habits are still on this
            device, and Export backup below is how you move them.
          </p>
        )}

        {error && (
          <p role="alert" className="text-[12px] text-danger">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="submit"
            disabled={busy || email.trim() === "" || password === ""}
            className="h-10 rounded-control border border-accent bg-accent px-3 text-[13px] font-medium text-accent-fg transition-opacity disabled:opacity-50"
          >
            {busy ? "Working…" : mode === "sign-up" ? "Create account" : "Sign in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setMode(mode === "sign-up" ? "sign-in" : "sign-up");
              setError(null);
            }}
            className="h-10 rounded-control px-2 text-[13px] text-muted underline underline-offset-4 hover:text-foreground"
          >
            {mode === "sign-up" ? "I already have an account" : "Create an account"}
          </button>
        </div>
      </form>
    </>
  );
}

/**
 * The gap between signing up and clicking the link (§13.10).
 *
 * It is a state of the *form*, not of the app: no session exists yet, nothing
 * has synced, and the habits on this device are untouched — which is what the
 * copy has to get across, because "check your email" on a screen that just
 * swallowed your account reads as data loss otherwise.
 *
 * The resend endpoint answers the same way for an address that is unknown, or
 * already verified, as for one that is waiting — deliberately, so it cannot be
 * used to test whether an account exists. There is therefore nothing to branch
 * on here and nothing to report but "sent".
 */
function AwaitingVerification({
  email,
  onDone,
}: {
  email: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setError(null);
    // `callbackURL` is where the link lands once the address is confirmed. The
    // click signs that browser in, so home is the right place to arrive.
    const result = await authClient.sendVerificationEmail({
      email,
      callbackURL: "/",
    });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Could not send it. Try again shortly.");
      return;
    }
    setSent(true);
  }

  return (
    <>
      <p className="text-[13px] leading-relaxed">
        Check <span className="font-medium">{email}</span> for a link to confirm
        the address. Signing in needs it.
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Nothing has left this device, and nothing will until you sign in — your
        habits are where they were. The link works on any device, and opening it
        signs that one in.
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[12px] text-danger">
          {error}
        </p>
      )}
      {sent && !error && (
        <p role="status" className="mt-2 text-[12px] text-muted">
          Sent again. It can take a minute — check spam.
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void resend()}
          className="h-10 rounded-control border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
        >
          {busy ? "Sending…" : "Resend email"}
        </button>
        <button
          type="button"
          onClick={onDone}
          className="h-10 rounded-control px-2 text-[13px] text-muted underline underline-offset-4 hover:text-foreground"
        >
          I have confirmed it — sign in
        </button>
      </div>
    </>
  );
}

function SignedIn({ email, syncStatus }: { email: string; syncStatus: SyncStatus }) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warned, setWarned] = useState(false);

  async function attemptSignOut() {
    setBusy(true);

    // Push before wiping. Signing out removes this device's copy, so anything
    // ticked offline since the last sync exists nowhere else — and "sign out"
    // silently eating a week of history is not a trade-off anyone agreed to.
    await syncNow();
    setBusy(false);

    // `syncNow` reports through the store rather than throwing, so this is how
    // we learn it failed. Ask a second time instead of deciding for them.
    if (syncStatus.kind === "error") {
      setWarned(true);
      return;
    }

    await finish();
  }

  async function finish() {
    setBusy(true);
    await authClient.signOut();
    markSignedOut();
    // The wipe. Same path as the 409 account-mismatch case: the local store is
    // emptied and the cursor reset, so the next person to sign in on this device
    // starts from their own server state rather than inheriting this one.
    adoptAccount(null);
    setBusy(false);
    setConfirming(false);
    setWarned(false);
  }

  return (
    <>
      <p className="text-[13px]">
        Signed in as <span className="font-medium">{email}</span>
      </p>
      <p className="mt-1 text-[12px] text-muted">{describe(syncStatus)}</p>

      {confirming ? (
        <div className="mt-3 space-y-2">
          <p className="text-[13px] leading-relaxed">
            Sign out and remove your habits from this device? They stay in your
            account, and signing back in brings them here again.
          </p>
          {warned && (
            <p role="alert" className="text-[12px] text-danger">
              Could not reach the server, so changes made here may not be saved
              yet. Signing out now would lose them.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void (warned ? finish() : attemptSignOut())}
              className="h-10 rounded-control border border-danger px-3 text-[13px] font-medium text-danger transition-colors hover:bg-danger hover:text-surface disabled:opacity-50"
            >
              {busy ? "Saving…" : warned ? "Sign out anyway" : "Sign out"}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setConfirming(false);
                setWarned(false);
              }}
              className="h-10 rounded-control border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="h-10 rounded-control border border-border px-3 text-[13px] font-medium text-muted transition-colors hover:text-foreground"
          >
            Sign out
          </button>
        </div>
      )}
    </>
  );
}

function describe(status: SyncStatus): string {
  switch (status.kind) {
    case "syncing":
      return "Syncing…";
    case "idle":
      return "Everything is up to date.";
    case "error":
      return status.message;
    case "off":
      return "Not syncing yet.";
  }
}

function Field({
  label,
  type,
  value,
  autoComplete,
  onChange,
}: {
  label: string;
  type: "email" | "password";
  value: string;
  autoComplete: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[11px] font-medium text-muted">{label}</span>
      <input
        type={type}
        value={value}
        required
        autoComplete={autoComplete}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 h-10 w-full rounded-control border border-border bg-surface-2 px-3 text-[14px] outline-none focus:border-accent"
      />
    </label>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-card border border-border bg-surface p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Account
      </h2>
      {children}
    </div>
  );
}
