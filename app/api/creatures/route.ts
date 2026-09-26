/**
 * GET/POST /api/creatures — creature progression. See DESIGN.md §13.18. Not part
 * of `/api/sync`: this is not replicated data but state only the server writes,
 * and a client asks for a change rather than sending one.
 */

import { resolveUser } from "@/lib/server/auth";
import {
  chooseStarter,
  claimDay,
  CreatureRefusal,
  parseCommand,
  readCreatures,
  setParty,
} from "@/lib/server/creatures";
import { getDb, syncConfigured } from "@/lib/server/db";
import { readJson } from "@/lib/server/json";
import { check, tooMany } from "@/lib/server/ratelimit";

/** postgres.js opens a TCP socket, which the edge runtime does not provide. */
export const runtime = "nodejs";

export const dynamic = "force-dynamic";

const MAX_BODY_BYTES = 4 * 1024;

const NO_STORE = { "Cache-Control": "no-store" };

function error(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: NO_STORE });
}

/** The session and the budget, in that order; a Response when either refuses. */
async function caller(request: Request) {
  if (!syncConfigured()) {
    return error(503, "Creatures are not configured on this deployment.");
  }

  const user = await resolveUser(request);
  if (!user) return error(401, "Sign in to raise creatures.");

  const metered = await check("creatures", user.id);
  if (!metered.ok) {
    return tooMany("Too many requests. Try again shortly.", metered.retryAfter);
  }
  return user;
}

export async function GET(request: Request): Promise<Response> {
  const user = await caller(request);
  if (user instanceof Response) return user;

  const state = await readCreatures(getDb(), user.id);
  return Response.json(state, { headers: NO_STORE });
}

export async function POST(request: Request): Promise<Response> {
  const user = await caller(request);
  if (user instanceof Response) return user;

  const body = await readJson(request, MAX_BODY_BYTES);
  const command = body === undefined ? null : parseCommand(body);
  if (!command) return error(400, "Malformed request.");

  const db = getDb();
  try {
    const result =
      command.action === "claim"
        ? await claimDay(db, user, command.day)
        : command.action === "choose"
          ? await chooseStarter(db, user, command.line)
          : await setParty(db, user, command.lines);
    return Response.json(result, { headers: NO_STORE });
  } catch (cause) {
    if (cause instanceof CreatureRefusal) return error(400, cause.message);
    console.error("openhabits: creatures failed", cause);
    return error(500, "Something went wrong. Try again shortly.");
  }
}
