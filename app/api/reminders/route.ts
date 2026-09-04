/**
 * GET/POST /api/reminders — the push subscription register. See DESIGN.md §8.5.
 *
 * The second endpoint the app has ever had, and it is deliberately not part of
 * `/api/sync`: a subscription is a device fact, not replicated state, and
 * folding it into the sync payload would give every device a copy of every other
 * device's push endpoint for no purpose.
 *
 * `GET` answers whether this deployment can send at all, and hands back the
 * public VAPID key needed to subscribe. Asked *before* the browser's permission
 * prompt on purpose — permission is expensive to ask for and can only be
 * refused once, and §8.5's warning is that a reminder toggle that silently does
 * nothing is the worst outcome available. A deployment with no keys says so and
 * the UI offers no switch.
 */

import { isTimeZone } from "@/lib/dates";
import { resolveUser } from "@/lib/server/auth";
import { getDb, syncConfigured } from "@/lib/server/db";
import { applicationServerKey, pushConfigured } from "@/lib/server/push";
import { pushSubscriptions, users } from "@/lib/server/schema";
import { and, eq } from "drizzle-orm";

/** postgres.js opens a TCP socket, and `web-push` needs Node crypto. */
export const runtime = "nodejs";

/** Both handlers read the environment and the database per request. */
export const dynamic = "force-dynamic";

/** A push endpoint URL is long — FCM's run past 200 characters — but bounded. */
const MAX_ENDPOINT = 1024;
const MAX_KEY = 256;

const NO_STORE = { "Cache-Control": "no-store" };

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

export async function GET(): Promise<Response> {
  const ready = syncConfigured() && pushConfigured();
  return Response.json(
    {
      /** Both halves: reminders need an account to know whose habits they are. */
      configured: ready,
      applicationServerKey: ready ? applicationServerKey() : null,
    },
    { headers: NO_STORE },
  );
}

type Subscribe = {
  action: "subscribe";
  endpoint: string;
  keys: { p256dh: string; auth: string };
  timeZone: string;
};

type Unsubscribe = { action: "unsubscribe"; endpoint: string };

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKey(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_KEY;
}

/**
 * https only, and length-capped. The endpoint is a URL this server will make
 * requests to on a schedule, so an unvalidated one turns the cron into a
 * request forgery primitive pointed wherever the caller likes.
 */
function isEndpoint(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > MAX_ENDPOINT) {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

function parse(body: unknown): Subscribe | Unsubscribe | null {
  if (!isObject(body) || !isEndpoint(body.endpoint)) return null;

  if (body.action === "unsubscribe") {
    return { action: "unsubscribe", endpoint: body.endpoint };
  }

  if (body.action !== "subscribe") return null;
  if (!isObject(body.keys) || !isKey(body.keys.p256dh) || !isKey(body.keys.auth)) return null;
  // Checked against the runtime's ICU rather than a regex: the cron formats a
  // date in this zone, and an unknown one throws there instead of here.
  if (!isTimeZone(body.timeZone)) return null;

  return {
    action: "subscribe",
    endpoint: body.endpoint,
    keys: { p256dh: body.keys.p256dh, auth: body.keys.auth },
    timeZone: body.timeZone,
  };
}

export async function POST(request: Request): Promise<Response> {
  if (!syncConfigured()) {
    return error(503, "Reminders are not configured on this deployment.");
  }

  const user = await resolveUser(request);
  if (!user) return error(401, "Sign in to turn on reminders.");

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "Body is not valid JSON.");
  }

  const command = parse(body);
  if (!command) return error(400, "Malformed subscription.");

  const db = getDb();

  if (command.action === "unsubscribe") {
    // Scoped to the account: an endpoint is a device handle anyone holding it
    // could send, and deleting it must be the owner's call.
    await db
      .delete(pushSubscriptions)
      .where(
        and(
          eq(pushSubscriptions.endpoint, command.endpoint),
          eq(pushSubscriptions.userId, user.id),
        ),
      );
    return Response.json({ subscribed: false }, { headers: NO_STORE });
  }

  if (!pushConfigured()) {
    // Refused rather than stored. A row here with no keypair behind it is a
    // subscription that will never fire, and the client has just spent the
    // user's one notification-permission prompt on it.
    return error(503, "This deployment cannot send reminders.");
  }

  // The same upsert `runSync` opens with — a device can subscribe before it has
  // ever synced, and the foreign key needs the account row to exist.
  await db.insert(users).values({ id: user.id, email: user.email }).onConflictDoNothing({
    target: users.id,
  });

  await db
    .insert(pushSubscriptions)
    .values({
      endpoint: command.endpoint,
      userId: user.id,
      p256dh: command.keys.p256dh,
      auth: command.keys.auth,
      timeZone: command.timeZone,
      lastSeenAt: new Date(),
    })
    // Conflict on the endpoint alone, which is how a device that changed hands
    // stops belonging to the previous account (see `schema.ts`). `lastSentDay`
    // is deliberately left as it was: resubscribing after this morning's
    // reminder should not produce a second one.
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId: user.id,
        p256dh: command.keys.p256dh,
        auth: command.keys.auth,
        timeZone: command.timeZone,
        // This upsert is the heartbeat the sweep ages a device against: the
        // client re-sends it on app start and whenever the settings card is
        // opened. Without it a browser that stopped visiting is indistinguishable
        // from one being used daily, and neither is ever collected.
        lastSeenAt: new Date(),
      },
    });

  return Response.json({ subscribed: true }, { headers: NO_STORE });
}
