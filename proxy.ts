/**
 * The global rate limit tier. See DESIGN.md §13.17.
 *
 * `proxy.ts` rather than `middleware.ts`: Next 16 renamed the convention, and
 * the old name is deprecated. It runs on the Node runtime, and a `runtime`
 * export here throws rather than being ignored — so there is none.
 *
 * The first cross-cutting thing in this app that is not a header in
 * `next.config.ts`, and the matcher is what makes it affordable. Every route in
 * this app but five prerenders to static HTML that a CDN serves; a proxy with no
 * matcher would put a function invocation in front of all of it, and a Redis
 * command in front of every stylesheet. Scoped to `/api`, it runs only where
 * there was already going to be a function.
 *
 * Per the proxy docs it must not expect shared module state to reach the app,
 * and it does not: the verdict is the whole of its output.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { check, clientIp, metered, tooMany } from "@/lib/server/ratelimit";

export async function proxy(request: NextRequest): Promise<NextResponse | Response> {
  const { pathname } = request.nextUrl;

  // The exclusions live here rather than in the matcher, so the rule about which
  // endpoints are metered is stated once, in a module a test can import.
  if (!metered(pathname)) return NextResponse.next();

  const verdict = await check("global", clientIp(request.headers));
  if (verdict.ok) return NextResponse.next();

  return tooMany(
    "Too many requests from this address. Your habits are safe on this device; try again shortly.",
    verdict.retryAfter,
  );
}

/**
 * `/api` and nothing else. Broad rather than exact on purpose: the two endpoints
 * that must not be metered — `/api/email`, where QStash delivers a queued mail,
 * and `/api/cron/…`, the hourly reminder sweep — are excluded by
 * `ratelimit.ts:metered` inside the function instead of by a negative lookahead
 * here. Expressing it twice would mean two rules that have to agree, and only one
 * of them can be unit-tested; the cost of the broad matcher is an invocation that
 * returns immediately without touching Redis.
 */
export const config = {
  matcher: ["/api/:path*"],
};
