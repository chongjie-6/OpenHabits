/**
 * The verification email — the first thing hapi ever says to a new account.
 */

const INK = "#1a1a19";
const INK_2 = "#4a4a46";
const MUTED = "#6f6f68";
const RULE = "#e5e5df";
const SURFACE = "#ffffff";
const ACCENT = "#216e39";
const CELL_EMPTY = "#ebedf0";
const CELL_TODAY = "#30a14e";

const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',serif";

const COLUMNS = 10;
const ROWS = 7;
const TODAY = { row: 3, column: 6 };

/**
 * The hero grid, built rather than hand-written: seventy literal `<td>`s in a
 * template string is seventy chances to typo a hex value. Gaps come from
 * `cellspacing` — margins on table cells are ignored almost everywhere, and
 * padding would grow the cells instead of separating them.
 */
function grid(): string {
  const rows: string[] = [];
  for (let row = 0; row < ROWS; row++) {
    const cells: string[] = [];
    for (let column = 0; column < COLUMNS; column++) {
      const lit = row === TODAY.row && column === TODAY.column;
      cells.push(
        `<td width="14" height="14" style="width:14px;height:14px;background-color:${
          lit ? CELL_TODAY : CELL_EMPTY
        };border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>`,
      );
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return rows.join("");
}

/**
 * Escape for an HTML attribute. The URL is machine-generated and in practice
 * carries nothing worse than `&`, but it is interpolated into an `href`, and "in
 * practice" is not a security argument.
 */
function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export const VERIFICATION_SUBJECT = "One square from day one";

/** Shown after the subject in the inbox list, then hidden in the body. */
const PREHEADER = "Verify your address and hapi starts keeping your grid.";

export function verificationEmail(url: string): {
  subject: string;
  html: string;
  text: string;
} {
  const href = escapeAttribute(url);

  const html = `<!doctype html>
<html lang="en" style="color-scheme:light only;supported-color-schemes:light only;">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<meta name="supported-color-schemes" content="light only">
<title>${VERIFICATION_SUBJECT}</title>
</head>
<body style="margin:0;padding:0;width:100%;background-color:${SURFACE};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${PREHEADER}&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};">
  <tr>
    <td align="center" style="padding:56px 24px 48px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;">
        <tr>
          <td align="center" style="padding-bottom:32px;">
            <table role="presentation" cellpadding="0" cellspacing="3" border="0" style="border-collapse:separate;">${grid()}</table>
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:10px;font-family:${SERIF};font-size:27px;line-height:1.3;font-weight:normal;color:${INK};">
            One square from day one.
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:32px;font-family:${SANS};font-size:15px;line-height:1.65;color:${INK_2};">
            hapi keeps a square for every day of the year. Verify this address and the grid above becomes yours &mdash; on your phone, your laptop, and anywhere else you sign in.
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:28px;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td align="center" bgcolor="${ACCENT}" style="border-radius:999px;">
                  <a href="${href}" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1;color:${SURFACE};text-decoration:none;border-radius:999px;">Verify and start today</a>
                </td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td align="center" style="border-top:1px solid ${RULE};padding-top:22px;font-family:${SANS};font-size:12px;line-height:1.65;color:${MUTED};">
            <p style="margin:0 0 6px;">Didn&rsquo;t sign up? Ignore this and nothing happens.</p>
            <p style="margin:0;">hapi &middot; daily quotes &amp; habits</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;

  const text = [
    "One square from day one.",
    "",
    "hapi keeps a square for every day of the year. Verify this address and",
    "the grid becomes yours — on your phone, your laptop, and anywhere else",
    "you sign in.",
    "",
    "Verify and start today:",
    url,
    "",
    "Didn't sign up? Ignore this and nothing happens.",
    "",
    "hapi · daily quotes & habits",
  ].join("\n");

  return { subject: VERIFICATION_SUBJECT, html, text };
}
