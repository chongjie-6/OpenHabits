"use client";

/**
 * The client half of daily reminders. See DESIGN.md §8.5.
 *
 * §8.5's rule is that a reminder switch which silently does nothing is worse
 * than no switch, so this module's job is less "subscribe" than "find out
 * truthfully whether a reminder could arrive". Every way it cannot is a distinct
 * `ReminderStatus`, and `components/ReminderCard.tsx` says which one out loud
 * rather than showing a toggle over it.
 *
 * The order of the checks is deliberate. The server is asked whether it can send
 * *before* `Notification.requestPermission()` — a browser grants that prompt
 * once, and spending it on a deployment with no VAPID keypair leaves the user
 * with a permission they gave for nothing and no obvious way to be asked again.
 */

import { useCallback, useEffect, useRef, useState } from "react";

export type ReminderStatus =
  /** Before the first check resolves, and the server snapshot. Shows nothing. */
  | "checking"
  /** No Push API. Safari on iOS until the app is installed to the home screen. */
  | "unsupported"
  /** Supported, but no service worker — a development build never registers one. */
  | "no-worker"
  /** This deployment has no database or no VAPID keypair, so it cannot send. */
  | "unconfigured"
  /** Notifications were refused. Only the browser's own UI can undo this. */
  | "denied"
  | "off"
  | "on";

export type ReminderState = {
  status: ReminderStatus;
  busy: boolean;
  /** The last failure, in words meant for the settings card. */
  error: string | null;
};

type Config = { configured: boolean; applicationServerKey: string | null };

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

/** The zone the cron will use to decide when it is morning here. */
function timeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * `getRegistration` rather than `ready`, which never settles when no worker was
 * ever registered — that is every development build (see `AppChrome.tsx`), and a
 * promise that hangs would leave the card on its skeleton forever.
 */
async function registration(): Promise<ServiceWorkerRegistration | null> {
  try {
    return (await navigator.serviceWorker.getRegistration("/")) ?? null;
  } catch {
    return null;
  }
}

async function readConfig(): Promise<Config> {
  const response = await fetch("/api/reminders", { headers: { Accept: "application/json" } });
  if (!response.ok) return { configured: false, applicationServerKey: null };
  return (await response.json()) as Config;
}

/**
 * VAPID keys travel base64url; `PushManager` wants the raw bytes. Backed by an
 * explicit `ArrayBuffer` because `BufferSource` excludes a view over a
 * `SharedArrayBuffer`, which is what the bare `Uint8Array` constructor widens to.
 */
function decodeKey(value: string): Uint8Array<ArrayBuffer> {
  const padded = value + "=".repeat((4 - (value.length % 4)) % 4);
  const binary = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

type SubscriptionKeys = { p256dh: string; auth: string };

function keysOf(subscription: PushSubscription): SubscriptionKeys | null {
  const keys = subscription.toJSON().keys;
  if (!keys?.p256dh || !keys.auth) return null;
  return { p256dh: keys.p256dh, auth: keys.auth };
}

async function post(body: unknown): Promise<Response> {
  return fetch("/api/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

/**
 * Tell the server about a subscription this browser already holds. Idempotent,
 * and worth doing on every visit to the settings screen: it repairs a row lost
 * to a sign-out on another device, and it is the only moment the stored timezone
 * catches up with a user who has moved.
 */
async function announce(subscription: PushSubscription): Promise<boolean> {
  const keys = keysOf(subscription);
  if (!keys) return false;

  const response = await post({
    action: "subscribe",
    endpoint: subscription.endpoint,
    keys,
    timeZone: timeZone(),
  });
  return response.ok;
}

/**
 * Drop this browser's subscription, locally and on the server. Called from the
 * settings card and from signing out — a row left behind after a sign-out would
 * deliver the previous account's habits into the tray of whoever has the device
 * now.
 */
export async function disableReminders(): Promise<void> {
  if (!supported()) return;

  const registered = await registration();
  const subscription = await registered?.pushManager.getSubscription();
  if (!subscription) return;

  // Server first: an unsubscribed browser can no longer prove it owned the
  // endpoint, and a row nothing will ever delete keeps waking the device.
  try {
    await post({ action: "unsubscribe", endpoint: subscription.endpoint });
  } catch {
    // Offline. The local unsubscribe below still stops delivery on this device,
    // and the push service answers 410 for the row on the next sweep.
  }

  await subscription.unsubscribe().catch(() => false);
}

const INITIAL: ReminderState = { status: "checking", busy: false, error: null };

/**
 * Reminder state for the settings card, plus the two actions that change it.
 *
 * `status` is `checking` on the server and through hydration — the same rule
 * §8.4 applies to install UI. These routes prerender to static HTML that the
 * service worker caches, so a card rendered server-side would tell the next
 * visitor about a subscription that is not theirs.
 */
export function useReminders(signedIn: boolean): ReminderState & {
  enable: () => void;
  disable: () => void;
} {
  const [state, setState] = useState<ReminderState>(INITIAL);
  // Both resolved during the check and held, so `enable` can run its first
  // statement without an `await` — see the note on the permission prompt there.
  const config = useRef<Config | null>(null);
  const worker = useRef<ServiceWorkerRegistration | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const set = useCallback((patch: Partial<ReminderState>) => {
    if (alive.current) setState((current) => ({ ...current, ...patch }));
  }, []);

  const check = useCallback(async () => {
    if (!supported()) return set({ status: "unsupported" });

    const registered = await registration();
    if (!registered) return set({ status: "no-worker" });
    worker.current = registered;

    let ready: Config;
    try {
      ready = await readConfig();
    } catch {
      // Offline, most likely. Reported as unconfigured rather than guessed at:
      // this screen must not offer a switch it cannot honour.
      return set({ status: "unconfigured" });
    }
    config.current = ready;
    if (!ready.configured || !ready.applicationServerKey) {
      return set({ status: "unconfigured" });
    }

    const subscription = await registered.pushManager.getSubscription();
    if (subscription) {
      // Re-asserted rather than trusted: see `announce`.
      if (signedIn) void announce(subscription);
      return set({ status: "on" });
    }

    set({ status: Notification.permission === "denied" ? "denied" : "off" });
  }, [set, signedIn]);

  useEffect(() => {
    void check();
  }, [check]);

  const enable = useCallback(() => {
    const registered = worker.current;
    const serverKey = config.current?.applicationServerKey;
    if (!registered || !serverKey) {
      return set({ status: "unconfigured" });
    }

    // First statement, before any `await`: Safari only grants the permission
    // prompt from inside the user gesture that asked for it, and a resolved
    // promise is a later task. Asking here still keeps the ordering §8.5 wants —
    // the server was asked whether it can send at all when the card mounted, not
    // now.
    const asked = Notification.requestPermission();
    set({ busy: true, error: null });

    void (async () => {
      const permission = await asked;
      if (permission !== "granted") {
        return set({ busy: false, status: permission === "denied" ? "denied" : "off" });
      }

      let subscription: PushSubscription;
      try {
        subscription = await registered.pushManager.subscribe({
          // Required by every browser, and Chrome refuses a subscription
          // without it: a push that shows no notification is not allowed.
          userVisibleOnly: true,
          applicationServerKey: decodeKey(serverKey),
        });
      } catch {
        return set({
          busy: false,
          error: "The browser would not create a subscription. Try again in a moment.",
        });
      }

      if (!(await announce(subscription))) {
        // Rolled back rather than left half-done: a browser holding a
        // subscription the server does not know about looks switched on and
        // never fires.
        await subscription.unsubscribe().catch(() => false);
        return set({
          busy: false,
          error: "Could not register with the server. Check you are signed in, then try again.",
        });
      }

      set({ busy: false, status: "on" });
    })();
  }, [set]);

  const disable = useCallback(() => {
    void (async () => {
      set({ busy: true, error: null });
      await disableReminders();
      set({ busy: false, status: "off" });
    })();
  }, [set]);

  return { ...state, enable, disable };
}
