import "server-only";

/**
 * The parsed body, or `undefined` if it is not JSON. `undefined` is free to mean
 * failure because no JSON text parses to it — `"null"` comes back as `null`.
 *
 * The caller answers the failure: the routes disagree on the shape of a 400
 * (`/api/sync` owes its client a `SyncErrorBody`), and one caller is not a route.
 */
export async function readJson(source: Request | string): Promise<unknown> {
  try {
    return typeof source === "string" ? JSON.parse(source) : await source.json();
  } catch {
    return undefined;
  }
}
