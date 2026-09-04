"use client";

/**
 * The daily reminder card on Settings. See DESIGN.md §8.5.
 *
 * §8.5 spent its length on one warning — a "remind me at 9:00" toggle that
 * silently does nothing is the worst outcome available — so this card shows a
 * switch only in the one state where a reminder can actually arrive, and names
 * the obstacle in every other. That is why there are six branches for what is
 * nominally a checkbox.
 *
 * The split between the two controls is real, not cosmetic. **Whether** this
 * device is reminded is a property of this browser's push subscription and lives
 * on the server per device; **when** is a preference in the synced settings blob,
 * so a phone and a laptop cannot disagree about morning.
 */

import { authClient } from "@/lib/session";
import { useReminders } from "@/lib/reminders";
import { updateSettings, useOpenHabits } from "@/lib/store";

/** 0 → "12am", 9 → "9am", 13 → "1pm". */
function formatHour(hour: number): string {
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve}${suffix}`;
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);

export function ReminderCard() {
  const { settings } = useOpenHabits();
  const { data: session, isPending } = authClient.useSession();
  const signedIn = Boolean(session?.user);
  const { status, busy, error, enable, disable } = useReminders(signedIn);

  return (
    <Card>
      {status === "checking" || isPending ? (
        <div aria-hidden="true" className="h-16 animate-pulse rounded-control bg-surface-2" />
      ) : (
        <Body
          status={status}
          signedIn={signedIn}
          busy={busy}
          error={error}
          hour={settings.reminderHour}
          onEnable={enable}
          onDisable={disable}
        />
      )}
    </Card>
  );
}

function Body({
  status,
  signedIn,
  busy,
  error,
  hour,
  onEnable,
  onDisable,
}: {
  status: ReturnType<typeof useReminders>["status"];
  signedIn: boolean;
  busy: boolean;
  error: string | null;
  hour: number;
  onEnable: () => void;
  onDisable: () => void;
}) {
  if (status === "unsupported") {
    return (
      <Explain>
        This browser cannot receive reminders. On an iPhone or iPad they only work
        once OpenHabits is on the Home Screen — install it from the card above and
        open it from there, then this will offer a switch.
      </Explain>
    );
  }

  if (status === "no-worker") {
    return (
      <Explain>
        Reminders are delivered by the service worker, which a development build
        deliberately never registers. Run a production build to try them.
      </Explain>
    );
  }

  if (status === "unconfigured") {
    return (
      <Explain>
        This copy of OpenHabits has no reminder service behind it, so there is
        nothing to switch on — a toggle here would do nothing at all. Everything
        else works exactly as before; the Today tab still shows what is
        outstanding the moment you open it.
      </Explain>
    );
  }

  // Checked after the capability branches: being signed out is the one obstacle
  // with a fix on this very screen, and saying so is only useful once the
  // browser and the deployment can actually deliver.
  if (!signedIn) {
    return (
      <Explain>
        A reminder has to be sent to this device while the app is closed, which
        means the server needs to know whose habits to count — so reminders need
        the account above. Sign in and this becomes a switch.
      </Explain>
    );
  }

  if (status === "denied") {
    return (
      <Explain>
        Notifications are blocked for this site. Only the browser can undo that:
        allow notifications for OpenHabits in its site settings, then reload this
        page.
      </Explain>
    );
  }

  return (
    <>
      <p className="text-[13px] leading-relaxed text-muted">
        {status === "on" ? (
          <>
            This device is reminded at {formatHour(hour)} — once a day, and only
            when something is still outstanding. Finish everything before then and
            it stays quiet.
          </>
        ) : (
          <>
            One notification a day listing what is still outstanding, sent at{" "}
            {formatHour(hour)} in this device&rsquo;s timezone. Nothing arrives on
            a day you have already finished.
          </>
        )}
      </p>

      {error && (
        <p role="alert" className="mt-2 text-[12px] leading-relaxed text-danger">
          {error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={status === "on" ? onDisable : onEnable}
          className={`h-10 rounded-control border px-3 text-[13px] font-medium transition-colors disabled:opacity-50 ${
            status === "on"
              ? "border-border text-muted hover:text-foreground"
              : "border-accent bg-accent text-accent-fg"
          }`}
        >
          {busy ? "Working…" : status === "on" ? "Turn off on this device" : "Turn on reminders"}
        </button>
      </div>

      {status === "on" && (
        <label className="mt-4 block">
          <span className="text-[13px] font-medium">Remind me at</span>
          <span className="mt-0.5 block text-[11px] leading-relaxed text-muted">
            Your local time. Unlike the switch above, this is part of your account
            — change it here and your other devices follow.
          </span>
          {/* 16px, like every text field: below it a tap zooms iOS in for good. */}
          <select
            value={hour}
            onChange={(event) => updateSettings({ reminderHour: Number(event.target.value) })}
            className="mt-2 h-10 rounded-control border border-border bg-surface-2 px-3 text-[16px] outline-none focus:border-accent"
          >
            {HOURS.map((value) => (
              <option key={value} value={value}>
                {formatHour(value)}
              </option>
            ))}
          </select>
        </label>
      )}

      <p className="mt-4 text-[11px] leading-relaxed text-muted">
        The switch is per device — turning it on here does not turn it on for your
        phone, and signing out turns it off again.
      </p>
    </>
  );
}

function Explain({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] leading-relaxed text-muted">{children}</p>;
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="surface-card bg-surface p-4">
      <h2 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
        Reminders
      </h2>
      {children}
    </div>
  );
}
