import { resetEmail } from "./reset-email";
import { verificationEmail } from "./verification-email";
import nodemailer from "nodemailer";

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
  });

  return transporter;
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

export async function sendResetPasswordEmail({
  to,
  url,
}: {
  to: string;
  url: string;
}): Promise<void> {
  const { subject, html, text } = resetEmail(url);
  await sendEmail({ to, subject, html, text });
}
