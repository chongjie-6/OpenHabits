import { type EmailKind, type Rendered, TEMPLATES } from "./email-templates";
import nodemailer from "nodemailer";

export { type EmailKind, isEmailKind } from "./email-templates";
export type EmailJob = { kind: EmailKind; to: string; url: string };

/** Whether mail is configured at all. Lets callers answer honestly rather than throw. */
export function mailerConfigured(): boolean {
  return Boolean(process.env.SMTP_USER) && Boolean(process.env.SMTP_PASSWORD);
}

/**
 * The From header. Gmail rewrites this to the authenticated account unless the
 * address is a verified "Send mail as" alias, so only the display name is
 * reliably ours on a default deployment — which is why the fallback names the
 * app around SMTP_USER rather than inventing an address the relay would drop.
 */
function from(): string {
  return process.env.MAIL_FROM ?? `OpenHabits <${process.env.SMTP_USER}>`;
}

function client(): nodemailer.Transporter {
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASSWORD;

  if (!user || !pass) {
    throw new Error(
      "SMTP configuration is incomplete. Outbound mail is unavailable; see .env.example.",
    );
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user,
      pass,
    },
    /**
     * Bounded on purpose. Nodemailer's defaults leave a stalled relay to the
     * platform's own request timeout, which is how a slow Gmail becomes a slow
     * sign-up — and on the queued path (§13.16) a hang is strictly worse than a
     * failure, because a failure is retried and a hang burns the invocation.
     * Ten seconds is several times a healthy round trip.
     */
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });

  return transporter;
}

async function sendMessage(to: string, { subject, html, text }: Rendered): Promise<void> {
  let info: nodemailer.SentMessageInfo;
  try {
    info = await client().sendMail({ from: from(), to, subject, html, text });
  } catch (cause) {
    throw new Error(`${subject}: send failed`, { cause });
  }

  if (info.rejected?.length) {
    throw new Error(`${subject}: rejected by the server for ${to}`);
  }
}

export async function sendEmail({ kind, to, url }: EmailJob): Promise<void> {
  await sendMessage(to, TEMPLATES[kind](url));
}
