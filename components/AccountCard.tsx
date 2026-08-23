"use client";

/**
 * Sign in, create an account, sign out, and the sync state that follows from
 * them. See DESIGN.md §13.6 and §13.10.
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
 * What just happened to the account, held above the form rather than in it.
 *
 * It has to live here, not inside `SignedOut`: a sign-up on a deployment with no
 * mailer comes back with a live session, Better Auth's `useSession` flips, and
 * the whole signed-out subtree unmounts on the next tick. A confirmation held in
 * that subtree's state would flash and vanish — which is the thing being fixed,
 * not a fix for it.
 *
 * `verify` is the §13.10 wait, reachable from both sides: a sign-up that created
 * no session, and a sign-in the server answered 403. Which one it was is the
 * only difference the copy has, so `origin` carries it.
 *
 * `created` is the *certain* one, and it is only ever certain on a deployment
 * with no mailer. Once `requireEmailVerification` is on, Better Auth answers a
 * sign-up for an address that already exists with a synthetic success — same
 * shape, null token, no account made — so that nobody can use the form to test
 * whether an address is registered. The client therefore cannot know, and
 * `AwaitingVerification` must not claim to.
 */
type Outcome =
  | { kind: "verify"; email: string; origin: Mode }
  | { kind: "created"; email: string };

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
  const { habits, syncStatus } = useHapi();
  const mounted = useMounted();
  const [outcome, setOutcome] = useState<Outcome | null>(null);

  if (!mounted || isPending) {
    return (
      <Card>
        <div aria-hidden="true" className="h-24 animate-pulse rounded-control bg-surface-2" />
      </Card>
    );
  }

  // Ahead of the session check on purpose: the wait is the state of a browser
  // that has no session yet, and the one route into it that could have one — a
  // 403 on sign-in — is still not the state of that account.
  if (outcome?.kind === "verify") {
    return (
      <Card>
        <AwaitingVerification
          email={outcome.email}
          origin={outcome.origin}
          onDone={() => setOutcome(null)}
        />
      </Card>
    );
  }

  return (
    <Card>
      {session?.user ? (
        <SignedIn
          email={session.user.email}
          syncStatus={syncStatus}
          created={outcome?.kind === "created" ? habits.length : null}
          onClearCreated={() => setOutcome(null)}
        />
      ) : (
        <SignedOut onOutcome={setOutcome} />
      )}
    </Card>
  );
}

/**
 * A failure worth reading, plus the one case that has an obvious next move:
 * signing up with an address that already has an account is not really an
 * error, it is the wrong half of the form.
 */
type FormError = { text: string; offerSignIn?: boolean };

function SignedOut({ onOutcome }: { onOutcome: (outcome: Outcome) => void }) {
  const [mode, setMode] = useState<Mode>("sign-in");
  const [email, setEmail] = useState("");
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
        onOutcome({ kind: "verify", email: credentials.email, origin: "sign-in" });
        return;
      }
      // Only reachable with no mailer configured. Better Auth hides duplicates
      // behind a synthetic success whenever `requireEmailVerification` is on
      // (its `shouldReturnGenericDuplicateResponse`), so on a deployment that
      // can send mail this branch never fires and the wait below has to carry
      // the case instead. Both spellings, because the sign-up route throws the
      // longer one and other paths throw the shorter.
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

    // A sign-up under mandatory verification creates no session — Better Auth
    // returns a null token — so there is nothing to sync yet and the hint must
    // stay unset, or `lib/sync/client.ts` spends the wait collecting 401s. With
    // no mailer configured the token is real and this is the old path.
    if (!result.data?.token) {
      onOutcome({ kind: "verify", email: credentials.email, origin: "sign-up" });
      return;
    }

    // The hint is what lets `lib/sync/client.ts` decide to sync without asking
    // the network first. Set here rather than waiting for `useSessionSync` to
    // notice, so the first sync starts on this tick instead of the next fetch.
    markSignedIn();
    void syncNow();

    // Signing in explains itself — the card becomes the signed-in card. Being
    // handed one silently, because this deployment has no mailer, does not.
    if (mode === "sign-up") {
      onOutcome({ kind: "created", email: credentials.email });
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
 * It is a state of the *form*, not of the app: no session exists yet, nothing
 * has synced, and the habits on this device are untouched — which is what the
 * copy has to get across, because "check your email" on a screen that just
 * swallowed your account reads as data loss otherwise. `origin` is why the same
 * screen can also confirm the sign-up went through: arriving from a 403 there is
 * no sign-up to confirm, and even arriving from one, what is certain is that the
 * request was accepted — not that an account was created. See `Outcome`.
 *
 * The resend endpoint answers the same way for an address that is unknown, or
 * already verified, as for one that is waiting — deliberately, so it cannot be
 * used to test whether an account exists. There is therefore nothing to branch
 * on there and nothing to report but "sent".
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
    // Or the next sign-in on this device is congratulated on an account it did
    // not just create.
    onClearCreated();
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

/**
 * One slot, two tones, for anything this card has to report.
 *
 * `alert` interrupts a screen reader and `status` waits its turn, which is the
 * right way round: a failure stands between you and what you asked for, a
 * confirmation does not. Both borders are full-strength tokens — the rule that
 * `--muted` may never be thinned is about legibility, and these are no
 * different.
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
