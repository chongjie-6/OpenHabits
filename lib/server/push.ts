import "server-only";

/**
 * Web Push transport. See DESIGN.md §8.5.
 *
 * The seam between "we decided to remind someone" (`reminders.ts`) and the
 * protocol that carries it. Kept apart so the sweep is testable without a VAPID
 * keypair or a push service: `runReminderSweep` takes its sender as an argument.
 *
 * Configured or not, like everything else in `lib/server/` — with no keys set
 * `pushConfigured()` is false, the endpoint says so in as many words, and no
 * reminder UI ever offers a toggle. §8.5's warning is the whole reason this is
 * answered honestly rather than assumed: a "remind me at 9:00" switch that
 * silently does nothing is worse than no switch.
 */

import webpush from "web-push";

export type PushKeys = { p256dh: string; auth: string };

export type PushTarget = { endpoint: string } & { keys: PushKeys };

/**
 * `gone` means the push service has disowned the endpoint — the browser was
 * cleared, the app uninstalled, the subscription rotated. It is the one outcome
 * that must reach the database, because the row will never work again.
 */
export type PushResult = "sent" | "gone" | "failed";

/**
 * A `mailto:` or `https:` contact the push service can use to reach the operator
 * about a misbehaving sender. Required by the VAPID spec, so a deployment with
 * keys but no subject is not configured for push.
 *
 * `BETTER_AUTH_URL` is accepted as a fallback only when it is a plain https
 * origin: `BETTER_AUTH_ALLOWED_HOSTS` deployments answer on several, and there is
 * no reason to prefer one of them as a contact address.
 */
function subject(): string | null {
  const explicit = process.env.VAPID_SUBJECT?.trim();
  if (explicit) return explicit;

  const url = process.env.BETTER_AUTH_URL?.trim();
  return url?.startsWith("https://") ? url : null;
}

function keys(): { publicKey: string; privateKey: string; subject: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const contact = subject();

  if (!publicKey || !privateKey || !contact) return null;
  return { publicKey, privateKey, subject: contact };
}

export function pushConfigured(): boolean {
  return keys() !== null;
}

/**
 * The public half of the VAPID pair, which the browser needs to create a
 * subscription. Public by construction — it is handed to a third-party push
 * service on every subscribe — so it is served rather than baked in at build
 * time with a `NEXT_PUBLIC_` variable. Fetching it also proves the server can
 * actually send before the app asks for notification permission, and permission
 * refused once is expensive to ask for again.
 */
export function applicationServerKey(): string | null {
  return keys()?.publicKey ?? null;
}

/** What a reminder looks like on the wire. `public/sw.js` is the other half. */
export type PushPayload = {
  title: string;
  body: string;
  /** Where a click lands. Same-origin path, never a full URL. */
  url: string;
  /**
   * Collapse key. Two reminders for the same day replace each other in the tray
   * rather than stacking, which is what makes an at-least-once cron harmless.
   */
  tag: string;
};

export async function sendPush(
  target: PushTarget,
  payload: PushPayload,
): Promise<PushResult> {
  const vapid = keys();
  if (!vapid) return "failed";

  try {
    await webpush.sendNotification(
      { endpoint: target.endpoint, keys: target.keys },
      JSON.stringify(payload),
      {
        vapidDetails: vapid,
        // The push service holds an undelivered message this long for a device
        // that is offline. A morning reminder is stale by the evening.
        TTL: 6 * 60 * 60,
        urgency: "normal",
      },
    );
    return "sent";
  } catch (cause) {
    const status = (cause as { statusCode?: number }).statusCode;
    if (status === 404 || status === 410) return "gone";

    // Logged in outline: the error carries the endpoint, which identifies a
    // device, and the body, which is the user's habit names.
    console.error(`openhabits: push failed with status ${status ?? "unknown"}`);
    return "failed";
  }
}
