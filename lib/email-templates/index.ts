import { resetEmail } from "./reset";
import { verificationEmail } from "./verification";

export type Rendered = { subject: string; html: string; text: string };

/**
 * Every mail this app sends, by kind. A new one is a template in this folder and
 * a line here: `EmailKind`, the queue's validation and both send paths all read
 * this table, so nothing downstream branches on the kind.
 */
export const TEMPLATES = {
  verification: verificationEmail,
  reset: resetEmail,
} satisfies Record<string, (url: string) => Rendered>;

export type EmailKind = keyof typeof TEMPLATES;

/** `Object.hasOwn` rather than `in`: the kind arrives from a stored envelope,
 * and `"constructor" in TEMPLATES` is true. */
export function isEmailKind(value: unknown): value is EmailKind {
  return typeof value === "string" && Object.hasOwn(TEMPLATES, value);
}
