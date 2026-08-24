"use client";

/**
 * Sign in, create an account, sign out. See DESIGN.md §13.6 and §13.10.
 *
 * Everything is gated on `mounted` (§8.4): these routes prerender to static HTML
 * that the service worker caches, so anything account-shaped rendered on the
 * server would be handed to the next visitor.
 */

import { useState, useSyncExternalStore } from "react";
import { authClient, markSignedIn, markSignedOut } from "@/lib/session";
import { adoptAccount, useOpenHabits, type SyncStatus } from "@/lib/store";
import { syncNow } from "@/lib/sync/client";

type Mode = "sign-in" | "sign-up";

/**
 * What just happened to the account. Held here rather than in `SignedOut`, which
 * unmounts the moment a mailer-less sign-up flips `useSession` — a confirmation
 * held in that subtree would flash and vanish.
 *
 * `verify` is reachable from both sides — a sign-up that created no session, and
 * a 403 on sign-in — and `origin` is the only difference the copy has.
 *
 * `created` is only ever certain with no mailer: under `requireEmailVerification`
 * Better Auth answers a duplicate sign-up with a synthetic success, so the client
 * cannot know an account was made and must not claim to.
 *
 * `habits` is counted at sign-up rather than read live, because the `syncNow()`
 * fired alongside can come back 409 and empty the store — a live count would
 * narrate that wipe as a welcome. `session` binds the banner to the token that
 * earned it, so an unrelated session ending cannot leave it to congratulate the
 * next sign-in.
 */
type Outcome =
  | { kind: "verify"; email: string; origin: Mode }
  | { kind: "created"; email: string; habits: number; session: string };

/**
 * False on the server and through hydration, true afterwards. The server snapshot
 * reports the hidden case, so account UI only ever appears — never flashes out of
 * cached HTML and disappears (§8.4).
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
  const { syncStatus } = useOpenHabits();
  const mounted = useMounted();
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  // The wait renders instead of `SignedOut`, so leaving it is a remount with
  // every field blank — and retyping the address you were just shown reads as
  // the sign-up having come undone.
  const [resumeEmail, setResumeEmail] = useState("");

  if (!mounted || isPending) {
    return (
      <Card>
        <div aria-hidden="true" className="h-24 animate-pulse rounded-control bg-surface-2" />
      </Card>
    );
  }

  // Ahead of the session check: the wait is the state of a browser with no
  // session, and the 403 route into it is not the state of that account either.
  if (outcome?.kind === "verify") {
    return (
      <Card>
        <AwaitingVerification
          email={outcome.email}
          origin={outcome.origin}
          onDone={() => {
            setResumeEmail(outcome.email);
            setOutcome(null);
          }}
        />
      </Card>
    );
  }

  const created =
    outcome?.kind === "created" && outcome.session === session?.session.token
      ? outcome.habits
      : null;

  return (
    <Card>
      {session?.user ? (
        <SignedIn
          email={session.user.email}
          syncStatus={syncStatus}
          created={created}
          onClearCreated={() => setOutcome(null)}
        />
      ) : (
        <SignedOut initialEmail={resumeEmail} onOutcome={setOutcome} />
      )}
    </Card>
  );
}

/** A failure worth reading; `offerSignIn` marks the one with an obvious fix. */
type FormError = { text: string; offerSignIn?: boolean };

function SignedOut({
  initialEmail,
  onOutcome,
}: {
  /** Seeds the field on mount only — returning from the wait is a fresh mount. */
  initialEmail: string;
  onOutcome: (outcome: Outcome) => void;
}) {
  const { habits } = useOpenHabits();
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<FormError | null>(null);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    const credentials = { email: email.trim(), password };
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            ...credentials,
            // The schema requires a name and this app never asks for one; an
            // empty string would look like a bug in any admin tool.
            name: credentials.email.split("@")[0] || "OpenHabits",
          })
        : await authClient.signIn.email(credentials);

    setBusy(false);

    if (result.error) {
      // The server already resent the mail on its way out (`sendOnSignIn`), so
      // a 403 here is the wait entered from the other side, not a failure.
      if (result.error.code === "EMAIL_NOT_VERIFIED") {
        onOutcome({ kind: "verify", email: credentials.email, origin: "sign-in" });
        return;
      }
      // Only reachable with no mailer: `requireEmailVerification` makes Better
      // Auth hide duplicates behind a synthetic success, and the wait carries the
      // case instead. Both spellings — the sign-up route throws the longer one.
      if (
        result.error.code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
        result.error.code === "USER_ALREADY_EXISTS"
      ) {
        setError({
          text: "That address already has an account.",
          offerSignIn: true,
        });
        return;
      }
      setError({ text: result.error.message ?? "That did not work. Try again." });
      return;
    }

    // A sign-up under mandatory verification returns a null token. Nothing to
    // sync yet, and the hint must stay unset or `lib/sync/client.ts` spends the
    // wait collecting 401s.
    if (!result.data?.token) {
      onOutcome({ kind: "verify", email: credentials.email, origin: "sign-up" });
      return;
    }

    // Set here rather than waiting for `useSessionSync` to notice, so the first
    // sync starts on this tick instead of the next fetch.
    markSignedIn();
    void syncNow();

    // Signing in explains itself — the card becomes the signed-in card. Being
    // handed one silently, because this deployment has no mailer, does not.
    if (mode === "sign-up") {
      onOutcome({
        kind: "created",
        email: credentials.email,
        habits: habits.length,
        session: result.data.token,
      });
    }
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
        {error && (
          <Banner tone="error">
            {error.text}
            {error.offerSignIn && (
              <>
                {" "}
                <button
                  type="button"
                  onClick={() => {
                    setMode("sign-in");
                    setError(null);
                  }}
                  className="underline underline-offset-4"
                >
                  Sign in instead
                </button>
              </>
            )}
          </Banner>
        )}

        <Field
          label="Email"
          type="email"
          value={email}
          autoComplete="username"
          onChange={(value) => {
            setEmail(value);
            setError(null);
          }}
        />
        <Field
          label="Password"
          type="password"
          value={password}
          autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
          onChange={(value) => {
            setPassword(value);
            setError(null);
          }}
        />

        {mode === "sign-up" && (
          <p className="text-[11px] leading-relaxed text-muted">
            At least 10 characters. We send a link to confirm the address before
            the account can be used, so use one you can open. There is no
            password reset yet — if you lose it your habits are still on this
            device, and Export backup below is how you move them.
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
 * A state of the form, not the app: no session exists and the local habits are
 * untouched, which the copy has to say or "check your email" reads as data loss.
 * Arriving from a 403 there is no sign-up to confirm, hence `origin`.
 *
 * The resend endpoint answers identically for an address that is unknown,
 * verified, or waiting, so it cannot be used to test whether an account exists —
 * nothing to branch on, and nothing to report but "sent".
 */
function AwaitingVerification({
  email,
  origin,
  onDone,
}: {
  email: string;
  origin: Mode;
  onDone: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function resend() {
    setBusy(true);
    setError(null);
    // Where the link lands once confirmed; the click signs that browser in.
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
      {origin === "sign-up" && (
        <div className="mb-2">
          <Banner tone="ok">
            Sign-up accepted — your link is on its way to{" "}
            <span className="font-medium">{email}</span>.
          </Banner>
        </div>
      )}

      <p className="text-[13px] leading-relaxed">
        {origin === "sign-up" ? (
          <>Open it to confirm the address and finish the account.</>
        ) : (
          <>
            Check <span className="font-medium">{email}</span> for a link to
            confirm the address.
          </>
        )}{" "}
        Signing in needs it.
      </p>
      <p className="mt-1 text-[12px] leading-relaxed text-muted">
        Nothing has left this device, and nothing will until you sign in — your
        habits are where they were. The link works on any device, and opening it
        signs that one in.
      </p>
      {origin === "sign-up" && (
        <p className="mt-1 text-[12px] leading-relaxed text-muted">
          If that address already had an account, no second one was made and no
          mail was sent — sign in with it instead. We answer the same way either
          way, so that this form cannot be used to find out who has an account.
        </p>
      )}

      {error && (
        <div className="mt-2">
          <Banner tone="error">{error}</Banner>
        </div>
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

function SignedIn({
  email,
  syncStatus,
  created,
  onClearCreated,
}: {
  email: string;
  syncStatus: SyncStatus;
  /** Habits on this device when the account was just created here, else null. */
  created: number | null;
  onClearCreated: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warned, setWarned] = useState(false);
  const [failed, setFailed] = useState(false);

  async function attemptSignOut() {
    setBusy(true);

    // Push before wiping: anything ticked offline since the last sync exists
    // nowhere else.
    await syncNow();
    setBusy(false);

    // `syncNow` reports through the store rather than throwing. Ask a second
    // time instead of deciding for them.
    if (syncStatus.kind === "error") {
      setWarned(true);
      return;
    }

    await finish();
  }

  async function finish() {
    setBusy(true);
    setFailed(false);

    // Unguarded, a dead network leaves the button on "Saving…" for good. The
    // wipe waits on success because the cookie survives a failed sign-out —
    // `useSession` would report a session over an already-emptied store.
    let ok = false;
    try {
      ok = (await authClient.signOut()).error == null;
    } catch {
      ok = false;
    }

    setBusy(false);
    if (!ok) {
      setFailed(true);
      return;
    }

    markSignedOut();
    // Same path as the 409 mismatch: emptied and the cursor reset, so the next
    // person to sign in here starts from their own server state.
    adoptAccount(null);
    setConfirming(false);
    setWarned(false);
  }

  return (
    <>
      {created !== null && (
        <div className="mb-3">
          <Banner tone="ok">
            Account created.{" "}
            {created > 0
              ? `The ${created} habit${created === 1 ? "" : "s"} on this device ${
                  created === 1 ? "is" : "are"
                } being added to it now.`
              : "Anything you add here is kept in it from now on."}{" "}
            <button
              type="button"
              onClick={onClearCreated}
              className="underline underline-offset-4"
            >
              Dismiss
            </button>
          </Banner>
        </div>
      )}

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
          {failed && (
            <p role="alert" className="text-[12px] text-danger">
              Could not sign out — the server did not answer. Nothing has
              changed on this device; try again in a moment.
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
                setFailed(false);
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

/**
 * `alert` interrupts a screen reader and `status` waits its turn: a failure
 * stands between you and what you asked for, a confirmation does not.
 */
function Banner({
  tone,
  children,
}: {
  tone: "ok" | "error";
  children: React.ReactNode;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-control border px-3 py-2 text-[12px] leading-relaxed ${
        tone === "error" ? "border-danger text-danger" : "border-accent text-accent"
      }`}
    >
      {children}
    </div>
  );
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
