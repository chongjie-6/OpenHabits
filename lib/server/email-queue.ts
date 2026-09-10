import "server-only";

/**
 * Outbound mail, handed to QStash instead of awaited. See DESIGN.md §13.16.
 *
 * The seam has one shape and two implementations, and which one runs is a
 * property of the deployment rather than of the caller: `queueConfigured()`
 * answers honestly, `better-auth.ts` sends inline when it says no, and a
 * deployment with none of these variables behaves exactly as it did before this
 * file existed.
 *
 * **What travels, and what does not.** A verification link is a session
 * (§13.12), and a QStash message body is retained for observability — so the
 * link never enters one. The envelope goes into Redis under a random id with an
 * hour's TTL and the message carries only the id, which means the token is
 * readable by whoever holds the Redis credentials and nobody else, and expires
 * on its own whether or not the worker ever runs.
 */

import { Client } from "@upstash/qstash";
import { mailableOrigin } from "./base-url";
import { getRedis, redisConfigured } from "./redis";
import { siteURL } from "../site-url";
import { type EmailJob, isEmailKind } from "../email";

/**
 * An hour, matching `resetPasswordTokenExpiresIn`. An envelope that outlives
 * its own token is a job whose only possible outcome is a dead link.
 */
const ENVELOPE_TTL_SECONDS = 3600;

const QUEUE_NAME = "email";
const KEY_PREFIX = "openhabits:email:";

/** RFC 5321's limit on a path, which is the longest an address may be. */
const MAX_ADDRESS = 320;
const MAX_URL = 2048;

/** Three attempts. A fourth would still be inside the token's hour, but a send
 * that has failed three times is failing for a reason retrying will not fix,
 * and the DLQ is where someone can see it. */
const RETRIES = 3;

const globalForQueue = globalThis as unknown as {
  openHabitsQStash?: Client;
};

/**
 * `baseUrl` is passed rather than left to the SDK's default, and it is the
 * difference between mail sending and mail vanishing: a QStash account belongs
 * to one region, `https://qstash.upstash.io` *is* eu-central-1, and a token
 * issued in us-east-1 gets a 404 from it — "user not found in this region",
 * which reads like a bad token and is not one. `QSTASH_URL` is what the Upstash
 * console and its Vercel integration hand out beside the token; unset, the
 * default is kept, which is correct for a European account and wrong in a way
 * only production reveals for every other one.
 */
function client(): Client {
  const token = process.env.QSTASH_TOKEN;
  if (!token) {
    throw new Error(
      "QSTASH_TOKEN is not set. The mail queue is unavailable; see .env.example. " +
        "Mail is sent inline without it, which is what this app did before the queue existed.",
    );
  }
  const baseUrl = process.env.QSTASH_URL;
  globalForQueue.openHabitsQStash ??= new Client(
    baseUrl ? { token, baseUrl } : { token },
  );
  return globalForQueue.openHabitsQStash;
}

/** Where QStash calls back. The origin comes from `siteURL()` rather than a
 * second resolver of its own — there is already one module that answers "what
 * is this deployment's public origin". */
export function workerURL(env: NodeJS.ProcessEnv = process.env): URL {
  return new URL("/api/email", siteURL(env));
}

function reachable(url: URL): boolean {
  return (
    url.hostname !== "localhost" &&
    url.hostname !== "127.0.0.1" &&
    url.hostname !== "[::1]"
  );
}

/**
 * Three conditions, and the third is the one that surprises: QStash delivers by
 * making an HTTP request from its own network, so it cannot reach a laptop. A
 * development machine holding a real token would otherwise enqueue messages
 * that fail their way into the DLQ while no mail arrives — worse than not
 * queueing at all, and silently so. So localhost answers "not configured" and
 * mail is sent inline, which is the behaviour a developer wants anyway.
 */
export function queueConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return (
    Boolean(env.QSTASH_TOKEN) &&
    redisConfigured(env) &&
    reachable(workerURL(env))
  );
}

function isString(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= max;
}

/**
 * Validated on the way out *and* on the way back in. The re-check in the worker
 * is not paranoia about our own writes: it is the one thing standing between a
 * compromised envelope store and this app mailing a genuine, branded link into
 * somebody else's origin — see `base-url.ts:mailableOrigin` and §13.12.
 *
 * Hand-rolled like `app/api/reminders/route.ts:parse`, for the same reason:
 * there is no schema library in this tree and one predicate does not justify one.
 */
export function parseEmailJob(
  value: unknown,
  env: NodeJS.ProcessEnv = process.env,
): EmailJob | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
  const job = value as Record<string, unknown>;

  if (!isEmailKind(job.kind)) return null;
  if (!isString(job.to, MAX_ADDRESS)) return null;
  if (!isString(job.url, MAX_URL)) return null;
  if (!mailableOrigin(job.url, env)) return null;

  return { kind: job.kind, to: job.to, url: job.url };
}

/**
 * Awaited by the caller, and the distinction matters: this is a hand-off, not a
 * send. A failure here is a failure to accept the job at all, which is why
 * §13.10's rule survives the change — `better-auth.ts` still throws on it, and
 * Better Auth still rolls the sign-up back and frees the address.
 */
export async function enqueueEmail(job: EmailJob): Promise<void> {
  const id = crypto.randomUUID();

  // The envelope first. Enqueueing before storing would let QStash deliver
  // before the worker has anything to read, spending a retry on a race.
  await getRedis().set(`${KEY_PREFIX}${id}`, job, { ex: ENVELOPE_TTL_SECONDS });

  try {
    await client().queue({ queueName: QUEUE_NAME }).enqueueJSON({
      url: workerURL().toString(),
      body: { id },
      retries: RETRIES,
    });
  } catch (cause) {
    // Nothing will ever read this envelope, and it holds a live link for the
    // hour of its TTL. Dropping it also means an orphan in Redis is evidence of
    // a lost *send* rather than of a rejected hand-off, which is the one signal
    // that tells these two failures apart from the outside — the reset path
    // reports nothing to its caller by design (§13.13).
    await getRedis()
      .del(`${KEY_PREFIX}${id}`)
      .catch(() => {});
    throw cause;
  }
}

/**
 * Read, but deliberately **not** claimed. `lib/server/reminders.ts` does the
 * opposite — it claims a device with the same `UPDATE` that selects it, so an
 * at-least-once cron sends at most once — and the divergence is intentional:
 * there a retry is the thing to prevent, here it is the entire reason the queue
 * exists. A consumed envelope would make a failed send unretryable.
 *
 * The cost is that a send whose 200 is lost produces a second mail. For a
 * verification or reset link that is a duplicate in the inbox, not a wrong
 * outcome, and the alternative is a link that never arrives at all.
 */
export async function dequeueEmail(
  id: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<EmailJob | null> {
  const stored = await getRedis().get<unknown>(`${KEY_PREFIX}${id}`);
  if (stored === null || stored === undefined) return null;
  return parseEmailJob(stored, env);
}

/** Called only after the send succeeded, so a retry has something to read
 * until then. A missing key on a later retry is how the worker knows the mail
 * is already gone. */
export async function completeEmail(id: string): Promise<void> {
  await getRedis().del(`${KEY_PREFIX}${id}`);
}
