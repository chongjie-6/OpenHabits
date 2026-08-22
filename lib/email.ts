/**
 * Outbound mail. The transport, and only the transport — every template lives
 * in its own module (`verification-email.ts`) and returns strings.
 *
 * ## Why the client is lazy
 *
 * `new Resend(undefined)` throws. Constructing at module scope would therefore
 * make importing this file fatal on a machine with no `RESEND_API_KEY`, and
 * `lib/server/better-auth.ts` imports it — so a missing key would take down the
 * whole auth stack at build time, on a project whose first rule is that every
 * environment variable is optional (§13.1). Same lazy-and-memoised shape as
 * `lib/server/db.ts` and for the same reason.
 *
 * ## Why sends are awaited
 *
 * They were not, originally, and that hid two bugs. A rejected send disappeared
 * into an unhandled promise, and on a serverless invocation the function could
 * return — and be frozen — before the HTTP request to Resend had gone out at
 * all. Callers decide what a failure means; this module's job is to report one.
 */

import { Resend } from "resend";
import { verificationEmail } from "./verification-email";

const FROM = "hapi <support@hapi.com>";

const globalForMail = globalThis as unknown as { hapiResend?: Resend };

/** Whether mail is configured at all. Lets callers answer honestly rather than throw. */
export function mailerConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

function client(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new Error(
      "RESEND_API_KEY is not set. Outbound mail is unavailable; see .env.example.",
    );
  }
  globalForMail.hapiResend ??= new Resend(key);
  return globalForMail.hapiResend;
}

async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const { error } = await client().emails.send({
    from: FROM,
    to,
    subject,
    html,
    text,
  });

  // Resend reports failures in the body rather than by rejecting, so an
  // unchecked call succeeds no matter what happened.
  if (error) {
    throw new Error(`${subject}: ${error.name} — ${error.message}`);
  }
}

export async function sendVerificationEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}): Promise<void> {
  const { subject, html, text } = verificationEmail(url);
  await sendEmail({ to, subject, html, text });
}
