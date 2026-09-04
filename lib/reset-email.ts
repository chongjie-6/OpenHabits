/**
 * The password-reset email. See DESIGN.md §13.13.
 *
 * Says less than the verification mail on purpose. This one is sent to an
 * address on request from an unauthenticated form, so it reaches people who did
 * not ask for it whenever someone types their address into the box — it must
 * not confirm that an account exists, must not name the person, and must read
 * as calm rather than urgent. "Someone asked" is the framing, not "your account
 * is at risk".
 *
 * The lit square is the last one rather than the first: the verification mail
 * is a beginning, this is a return.
 */

import { button, hero, shell } from "./email-layout";

export const RESET_SUBJECT = "A new password for OpenHabits";

const PREHEADER = "The link is good for one hour, then it expires on its own.";

const LIT = { row: 3, column: 9 };

export function resetEmail(url: string): {
  subject: string;
  html: string;
  text: string;
} {
  const html = shell({
    title: RESET_SUBJECT,
    preheader: PREHEADER,
    content: hero({
      lit: LIT,
      headline: "Pick up where you left off.",
      copy: "Someone asked to reset the password on this address. Choose a new one and your grid is waiting exactly as you left it. The link works once and expires after an hour.",
      cta: button(url, "Choose a new password"),
    }),
  });

  const text = [
    "Pick up where you left off.",
    "",
    "Someone asked to reset the password on this address. Choose a new one and",
    "your grid is waiting exactly as you left it. The link works once and",
    "expires after an hour.",
    "",
    "Choose a new password:",
    url,
    "",
    "Didn't ask for this? Ignore it and nothing happens — the password on the",
    "account is unchanged until the link above is used.",
    "",
    "OpenHabits · daily quotes & habits",
  ].join("\n");

  return { subject: RESET_SUBJECT, html, text };
}
