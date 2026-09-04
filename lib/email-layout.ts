/**
 * The shell both OpenHabits emails are built in. See DESIGN.md §13.9.
 *
 * Extracted when the password-reset mail arrived and wanted the same chrome:
 * the grid, the ground, the rule, the footer. Two mails that look like two
 * different senders is exactly the smell a phishing filter — and a person —
 * reads as suspicious, so the shell is one thing rather than two that agree by
 * hand.
 *
 * ## The rules mail imposes
 *
 * Layout is tables and inline styles because margins on `<td>` and external
 * stylesheets are both ignored somewhere that matters. There are no `<img>`
 * tags anywhere: images are blocked by default in most clients, and an email
 * whose only content is a blocked image is an empty email. The artwork is table
 * cells with background colours, which nothing blocks.
 *
 * ## Dark mode
 *
 * Both mails used to lock themselves to light with `color-scheme: light only`,
 * which is what §13.9 recorded as "worth doing, not done". Clients that honour
 * `prefers-color-scheme` in a `<head>` `<style>` block — Apple Mail, Gmail on
 * iOS and Android, Outlook.com — get the dark palette through the class hooks
 * below. Everything else ignores the block entirely and keeps the inline light
 * styles, which is why the light values stay inline rather than moving into the
 * stylesheet: the media query is an enhancement, and the mail has to be right
 * without it.
 *
 * Gmail's web client strips a `<style>` block out of `<body>` but keeps one in
 * `<head>`, which is the only reason this works there at all.
 */

const INK = "#1a1a19";
const INK_2 = "#4a4a46";
const MUTED = "#6f6f68";
const RULE = "#e5e5df";
const SURFACE = "#ffffff";
const ACCENT = "#216e39";
const CELL_EMPTY = "#ebedf0";
const CELL_LIT = "#30a14e";

/**
 * The dark halves. Held to the same contrast bar as the app: `--muted` passes
 * AA with no headroom, so its counterpart here lightens rather than fades.
 */
const DARK_INK = "#e6edf3";
const DARK_INK_2 = "#c2ccd6";
const DARK_MUTED = "#9aa4ae";
const DARK_RULE = "#2c333a";
const DARK_SURFACE = "#161b22";
const DARK_ACCENT = "#2ea043";
const DARK_CELL_EMPTY = "#262c34";

export const SANS =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
export const SERIF = "Georgia,'Times New Roman',serif";

export const COLOURS = { INK, INK_2, MUTED, RULE, SURFACE, ACCENT, CELL_EMPTY, CELL_LIT };

/**
 * Escape for an HTML attribute. Every URL here is machine-generated and in
 * practice carries nothing worse than `&`, but it is interpolated into an
 * `href`, and "in practice" is not a security argument.
 */
export function escapeAttribute(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

const COLUMNS = 10;
const ROWS = 7;

/**
 * The hero grid, built rather than hand-written: seventy literal `<td>`s in a
 * template string is seventy chances to typo a hex value. Gaps come from
 * `cellspacing` — margins on table cells are ignored almost everywhere, and
 * padding would grow the cells instead of separating them.
 *
 * `lit` is the cell that carries the mail's meaning, so each message picks its
 * own: verification lights a first day, a reset lights the day you came back.
 */
export function grid(lit: { row: number; column: number }): string {
  const rows: string[] = [];
  for (let row = 0; row < ROWS; row++) {
    const cells: string[] = [];
    for (let column = 0; column < COLUMNS; column++) {
      const on = row === lit.row && column === lit.column;
      cells.push(
        `<td class="${on ? "cell-lit" : "cell"}" width="14" height="14" style="width:14px;height:14px;background-color:${
          on ? CELL_LIT : CELL_EMPTY
        };border-radius:3px;font-size:0;line-height:0;">&nbsp;</td>`,
      );
    }
    rows.push(`<tr>${cells.join("")}</tr>`);
  }
  return rows.join("");
}

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td class="btn" align="center" bgcolor="${ACCENT}" style="border-radius:999px;">
                  <a class="btn-a" href="${escapeAttribute(href)}" style="display:inline-block;padding:15px 34px;font-family:${SANS};font-size:15px;font-weight:600;line-height:1;color:${SURFACE};text-decoration:none;border-radius:999px;">${label}</a>
                </td>
              </tr>
            </table>`;
}

/**
 * The `prefers-color-scheme` half. Class hooks rather than element selectors,
 * so a client that supports the query but not descendant combinators still
 * matches — and so adding a row to a mail cannot silently opt out of dark mode.
 */
const DARK_STYLES = `
    @media (prefers-color-scheme: dark) {
      .body, .ground { background-color: ${DARK_SURFACE} !important; }
      .headline { color: ${DARK_INK} !important; }
      .copy { color: ${DARK_INK_2} !important; }
      .footer { color: ${DARK_MUTED} !important; border-top-color: ${DARK_RULE} !important; }
      .cell { background-color: ${DARK_CELL_EMPTY} !important; }
      .btn { background-color: ${DARK_ACCENT} !important; }
      .btn-a { color: ${DARK_SURFACE} !important; }
    }`;

/**
 * `preheader` is what an inbox list shows after the subject; it is then hidden
 * in the body by the usual zero-height div, padded with word joiners so the
 * client does not pull the next real sentence in after it.
 */
export function shell({
  title,
  preheader,
  content,
}: {
  title: string;
  preheader: string;
  content: string;
}): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${title}</title>
<style>${DARK_STYLES}
</style>
</head>
<body class="body" style="margin:0;padding:0;width:100%;background-color:${SURFACE};-webkit-font-smoothing:antialiased;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;&#847;&nbsp;</div>
<table class="ground" role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:${SURFACE};">
  <tr>
    <td align="center" style="padding:56px 24px 48px;">
      <table role="presentation" width="480" cellpadding="0" cellspacing="0" border="0" style="width:480px;max-width:100%;">
${content}        <tr>
          <td class="footer" align="center" style="border-top:1px solid ${RULE};padding-top:22px;font-family:${SANS};font-size:12px;line-height:1.65;color:${MUTED};">
            <p style="margin:0 0 6px;">Didn&rsquo;t ask for this? Ignore it and nothing happens.</p>
            <p style="margin:0;">OpenHabits &middot; daily quotes &amp; habits</p>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** The four rows a message body is made of: grid, headline, paragraph, button. */
export function hero({
  lit,
  headline,
  copy,
  cta,
}: {
  lit: { row: number; column: number };
  headline: string;
  copy: string;
  cta: string;
}): string {
  return `        <tr>
          <td align="center" style="padding-bottom:32px;">
            <table role="presentation" cellpadding="0" cellspacing="3" border="0" style="border-collapse:separate;">${grid(lit)}</table>
          </td>
        </tr>
        <tr>
          <td class="headline" align="center" style="padding-bottom:10px;font-family:${SERIF};font-size:27px;line-height:1.3;font-weight:normal;color:${INK};">
            ${headline}
          </td>
        </tr>
        <tr>
          <td class="copy" align="center" style="padding-bottom:32px;font-family:${SANS};font-size:15px;line-height:1.65;color:${INK_2};">
            ${copy}
          </td>
        </tr>
        <tr>
          <td align="center" style="padding-bottom:28px;">
            ${cta}
          </td>
        </tr>
`;
}
