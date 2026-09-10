/**
 * POST /api/email — the mail queue's entry point. See DESIGN.md §13.16.
 *
 * The fifth endpoint, and the second that is a machine's entry point rather than
 * a client's. The worker itself is `workers/email.ts`; this file holds only what
 * Next.js has to read statically from a route segment.
 */

import { handleEmailJob } from "@/workers/email";

/** `nodemailer` opens a TCP socket, which the edge runtime does not provide. */
export const runtime = "nodejs";

/** Reads the environment and a store per request. */
export const dynamic = "force-dynamic";

/**
 * An SMTP round trip, three of which may be attempted inside one invocation if
 * nodemailer's own timeouts are hit. Well under Vercel's ceiling, and stated so
 * a hung relay is killed by the platform rather than by nothing.
 */
export const maxDuration = 30;

export async function POST(request: Request): Promise<Response> {
  return handleEmailJob(request);
}
