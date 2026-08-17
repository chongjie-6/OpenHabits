/**
 * POST /api/sync — the only server endpoint in the app. See DESIGN.md §13.
 *
 * Push and pull in one round trip, because they have to succeed or fail
 * together: a push that committed alongside a pull that did not would leave the
 * client's cursor and the server's contents describing different worlds.
 *
 * Deliberately the *only* endpoint. There is no `GET /habits`, no per-record
 * write route, no server rendering of user data. IndexedDB remains the source of
 * truth (§7.1) and this is a replication channel between copies of it — a design
 * that keeps the app fully functional with the database switched off, which is
 * also how it behaves for anyone who never signs in.
 */

import { resolveUser } from "@/lib/server/auth";
import { getDb, syncConfigured } from "@/lib/server/db";
import { AccountMismatchError, runSync } from "@/lib/server/sync-store";
import type { SyncErrorBody, SyncErrorCode } from "@/lib/sync/protocol";
import { parseSyncPush } from "@/lib/sync/validate";

/** postgres.js opens a TCP socket, which the edge runtime does not provide. */
export const runtime = "nodejs";

/**
 * Roughly `MAX_ROWS_PER_REQUEST` records at a generous size each, with headroom.
 * Checked before the body is read so an oversized request is refused rather than
 * buffered — `request.json()` on an unbounded body is the cheapest denial of
 * service there is.
 */
const MAX_BODY_BYTES = 2_000_000;

function error(status: number, code: SyncErrorCode, message: string): Response {
  return Response.json({ error: code, message } satisfies SyncErrorBody, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request): Promise<Response> {
  if (!syncConfigured()) {
    // Honest rather than broken: an app deployed without a database still works,
    // and the client treats this as "sync is off" instead of retrying forever.
    return error(503, "server-error", "Sync is not configured on this deployment.");
  }

  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) {
    return error(413, "payload-too-large", "Sync payload is too large. Send fewer records.");
  }

  const user = await resolveUser(request);
  if (!user) {
    return error(401, "unauthenticated", "Sign in to sync.");
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return error(400, "malformed", "Body is not valid JSON.");
  }

  const push = parseSyncPush(body);
  if (!push.ok) {
    return error(400, "malformed", push.message);
  }

  try {
    const result = await runSync(getDb(), user, push.value);
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch (cause) {
    if (cause instanceof AccountMismatchError) {
      // Not an error condition so much as news: the client is holding data for
      // someone else and needs to hand the device over. Nothing was written.
      return error(409, "account-mismatch", "Local data belongs to a different account.");
    }

    // Logged in full, reported in outline. A driver error can quote the SQL it
    // failed on, and that SQL contains another user's row values.
    console.error("hapi: sync failed", cause);
    return error(500, "server-error", "Sync failed. Your data is safe on this device.");
  }
}
