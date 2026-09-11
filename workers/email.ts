import "server-only";

/**
 * The mail queue's worker: what `POST /api/email` does. See DESIGN.md §13.16.
 *
 * Its shape is the one `/api/cron/reminders` already established: fail closed
 * with no secret, authenticate the caller, do bounded work, and report a status
 * the scheduler can act on. What differs is what a failure means — QStash
 * retries a non-2xx, so a 500 here is a request to try again rather than an
 * incident.
 *
 * It carries no user data in the sync sense and needs no session. The body is an
 * envelope id and nothing else: the link itself never travelled through QStash.
 */

import { Receiver } from "@upstash/qstash";
import { completeEmail, dequeueEmail } from "@/lib/server/email-queue";
import { readJson, readText } from "@/lib/server/json";
import { sendEmail } from "@/lib/email";

const NO_STORE = { "Cache-Control": "no-store" };

/** The body is `{ "id": "<uuid>" }`; anything near this size is not ours. */
const MAX_BODY_BYTES = 4 * 1024;

/** A `randomUUID`, which is what `enqueueEmail` mints. Length-capped and
 * character-checked because it is concatenated into a Redis key. */
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function json(status: number, body: Record<string, unknown>): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

function receiver(): Receiver | null {
  const currentSigningKey = process.env.QSTASH_CURRENT_SIGNING_KEY;
  const nextSigningKey = process.env.QSTASH_NEXT_SIGNING_KEY;
  if (!currentSigningKey || !nextSigningKey) return null;
  return new Receiver({ currentSigningKey, nextSigningKey });
}

export async function handleEmailJob(request: Request): Promise<Response> {
  /**
   * Unset is not "no authentication needed" — this worker mails a link to an
   * address its own body names, so with no way to tell who is asking it refuses
   * to run at all. The same reading of a missing secret as the cron route's.
   *
   * `Receiver` directly rather than `verifySignatureAppRouter`, so this gate is
   * the first thing that happens and the failure modes below stay as legible as
   * the other four routes'.
   */
  const verifier = receiver();
  if (!verifier) {
    return json(503, {
      error:
        "QStash signing keys are not set; the mail queue worker is disabled.",
    });
  }

  const signature = request.headers.get("upstash-signature");
  if (!signature) return json(401, { error: "Unauthorised." });

  // Read before the signature can be checked, so bounded: until `verify`
  // passes, whoever sent this is anyone.
  const raw = await readText(request, MAX_BODY_BYTES);
  if (raw === null) return json(413, { error: "Body too large." });
  try {
    // `url` is passed so the signature is bound to this endpoint: a message
    // signed for somewhere else is not one to act on here.
    const valid = await verifier.verify({
      signature,
      body: raw,
      url: request.url,
    });
    if (!valid) return json(401, { error: "Unauthorised." });
  } catch {
    // A `SignatureError` and a malformed header are the same answer.
    return json(401, { error: "Unauthorised." });
  }

  const body = await readJson(raw);
  if (body === undefined) return json(400, { error: "Body is not valid JSON." });

  const id = (body as { id?: unknown } | null)?.id;
  if (typeof id !== "string" || !UUID_REGEX.test(id)) {
    return json(400, { error: "Malformed job." });
  }

  let job: Awaited<ReturnType<typeof dequeueEmail>>;
  try {
    job = await dequeueEmail(id);
  } catch (cause) {
    console.error("[openhabits] mail envelope read failed", cause);
    // The store, not the job. Worth a retry.
    return json(500, { error: "Envelope store unavailable." });
  }

  /**
   * 200, not an error, and this is the branch that keeps a delivered mail out of
   * the DLQ. A missing envelope means one of two harmless things: a retry after
   * a send whose response was lost, or a job whose hour ran out — and in the
   * second case the token in it had expired too, so there was nothing left to
   * deliver. Answering non-2xx here would retry both to exhaustion.
   */
  if (!job) return json(200, { done: true, envelope: "gone" });

  try {
    await sendEmail(job);
  } catch (cause) {
    // Logged in full, reported in outline — and the envelope is deliberately
    // left in place so the retry has something to read.
    console.error(`[openhabits] queued ${job.kind} email failed`, cause);
    return json(500, { error: "Send failed." });
  }

  // Only now. Until this line a retry is still possible, which is the whole
  // reason `dequeueEmail` reads rather than claims. Past it the mail has gone,
  // so a failed delete is logged and still answered 200 — a 500 here would have
  // QStash deliver the same mail again. The envelope's TTL tidies up after it.
  try {
    await completeEmail(id);
  } catch (cause) {
    console.error("[openhabits] mail envelope delete failed after send", cause);
  }

  return json(200, { done: true, kind: job.kind });
}
