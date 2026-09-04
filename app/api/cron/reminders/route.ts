/**
 * GET /api/cron/reminders — the hourly reminder sweep. See DESIGN.md §8.5.
 *
 * Hourly, not daily. "9am" is a wall clock, and one daily invocation can only be
 * nine o'clock in a single timezone; `lib/server/reminders.ts` decides per device
 * whether it is that hour *there*. `vercel.json` holds the schedule.
 *
 * It fails closed. `CRON_SECRET` unset is not "no authentication needed" — it is
 * a deployment that cannot authenticate the caller, and this route reads every
 * account's habits and sends to every registered device, so it refuses to run at
 * all rather than run for whoever asks.
 */

import { timingSafeEqual } from "node:crypto";
import { getDb, syncConfigured } from "@/lib/server/db";
import { pushConfigured } from "@/lib/server/push";
import { runReminderSweep } from "@/lib/server/reminders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Long enough that the sweep is the cost, short enough to fit a cron slot. */
export const maxDuration = 60;

const NO_STORE = { "Cache-Control": "no-store" };

/**
 * Constant-time, and length-safe: `timingSafeEqual` throws on a length mismatch,
 * which would leak the secret's length through a 500 rather than a 401.
 */
function authorised(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const offered = request.headers.get("authorization");
  if (!offered) return false;

  const expected = Buffer.from(`Bearer ${secret}`);
  const actual = Buffer.from(offered);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request: Request): Promise<Response> {
  if (!process.env.CRON_SECRET) {
    return Response.json(
      { error: "CRON_SECRET is not set; the reminder cron is disabled." },
      { status: 503, headers: NO_STORE },
    );
  }

  if (!authorised(request)) {
    return Response.json({ error: "Unauthorised." }, { status: 401, headers: NO_STORE });
  }

  if (!syncConfigured() || !pushConfigured()) {
    // Not an error: a deployment can perfectly well run with the cron wired up
    // and reminders switched off, and answering 200 keeps the scheduler from
    // alerting about it every hour.
    return Response.json(
      { skipped: "Reminders are not configured on this deployment." },
      { headers: NO_STORE },
    );
  }

  try {
    const summary = await runReminderSweep(getDb());
    // Counts only. The interesting fields — who, and which habits — are the
    // ones that must not end up in a log aggregator.
    console.log("openhabits: reminder sweep", summary);
    return Response.json(summary, { headers: NO_STORE });
  } catch (cause) {
    console.error("openhabits: reminder sweep failed", cause);
    return Response.json(
      { error: "Reminder sweep failed." },
      { status: 500, headers: NO_STORE },
    );
  }
}
