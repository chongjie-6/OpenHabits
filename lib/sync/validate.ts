/**
 * Payload validation for the sync endpoint.
 *
 * The caps matter beyond rejecting malformed data: these records go back out to
 * the user's *other* devices, so a field accepted here is a field every one of
 * them renders. Bounding at the boundary keeps one bad request from becoming a
 * payload that breaks the user's phone on every sync.
 *
 * Hand-written rather than schema-library-driven, as in `lib/db.ts`: the surface
 * is small and fixed, and this is where a supply chain dependency is least
 * welcome.
 */

import {
  DEFAULT_SETTINGS,
  normaliseHabitColor,
  type Cadence,
  type Entry,
  type Habit,
  type Settings,
} from "../types";
import { MAX_ROWS_PER_REQUEST, type SyncPush } from "./protocol";

/** Generous enough that no real habit hits it, small enough to be harmless. */
const MAX_NAME = 120;
const MAX_EMOJI = 16;
const MAX_ID = 64;
const MAX_TARGET = 1000;
const MAX_COUNT = 100_000;
const MAX_FAVOURITES = 5000;
/** Comfortably past both tag unions put together, with room for both to grow. */
const MAX_TAGS = 200;
const MAX_ORDER = 100_000;

export type ParseResult<T> = { ok: true; value: T } | { ok: false; message: string };

function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isId(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= MAX_ID;
}

/** A non-negative integer within the safe-integer range — every stamp and count. */
function isCount(value: unknown, max: number): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= max;
}

function isStamp(value: unknown): value is number {
  return isCount(value, Number.MAX_SAFE_INTEGER);
}

/**
 * A civil date, checked for existence rather than shape. The round-trip
 * comparison is what rejects '2026-02-30', which `Date` would silently roll
 * forward to March 2nd.
 */
function isDayKey(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function parseCadence(value: unknown): ParseResult<Cadence> {
  if (!isObject(value)) return fail("cadence must be an object");

  switch (value.kind) {
    case "daily":
      return { ok: true, value: { kind: "daily" } };

    case "weekdays": {
      if (!Array.isArray(value.days)) return fail("cadence.days must be an array");
      if (value.days.length > 7) return fail("cadence.days has more than seven days");
      if (!value.days.every((d) => isCount(d, 6))) return fail("cadence.days must be 0–6");
      // Sorted so the fingerprint in `protocol.ts` is stable across devices
      // that stored the same days in another order.
      const days = [...new Set(value.days as number[])].sort((a, b) => a - b);
      return { ok: true, value: { kind: "weekdays", days } };
    }

    case "weekly": {
      if (!isCount(value.times, 7) || value.times < 1) return fail("cadence.times must be 1–7");
      return { ok: true, value: { kind: "weekly", times: value.times } };
    }

    default:
      return fail(`unknown cadence kind: ${String(value.kind)}`);
  }
}

function parseHabit(value: unknown): ParseResult<Habit> {
  if (!isObject(value)) return fail("habit must be an object");
  if (!isId(value.id)) return fail("habit.id must be a non-empty string");
  if (typeof value.name !== "string" || value.name.length > MAX_NAME) {
    return fail(`habit.name must be a string of at most ${MAX_NAME} characters`);
  }
  if (typeof value.emoji !== "string" || value.emoji.length > MAX_EMOJI) {
    return fail("habit.emoji must be a short string");
  }
  if (!isCount(value.target, MAX_TARGET) || value.target < 1) {
    return fail(`habit.target must be 1–${MAX_TARGET}`);
  }
  if (!isCount(value.order, MAX_ORDER)) return fail("habit.order must be a non-negative integer");
  if (!isDayKey(value.createdAt)) return fail("habit.createdAt must be a YYYY-MM-DD date");
  if (value.archivedAt !== null && !isDayKey(value.archivedAt)) {
    return fail("habit.archivedAt must be a YYYY-MM-DD date or null");
  }
  if (!isStamp(value.updatedAt)) return fail("habit.updatedAt must be epoch ms");
  if (value.deletedAt !== null && !isStamp(value.deletedAt)) {
    return fail("habit.deletedAt must be epoch ms or null");
  }

  // A palette key or a #rrggbb the user picked from the wheel, lowercased here
  // so two devices that spelled the same colour differently still fingerprint
  // alike in `protocol.ts:wins`.
  const color =
    typeof value.color === "string" ? normaliseHabitColor(value.color) : null;
  if (color === null) return fail("habit.color must be a palette key or a #rrggbb colour");

  const cadence = parseCadence(value.cadence);
  if (!cadence.ok) return cadence;

  return {
    ok: true,
    // Field by field rather than spread, so an unexpected property cannot ride
    // into the database and back out to other devices.
    value: {
      id: value.id,
      name: value.name,
      emoji: value.emoji,
      color,
      cadence: cadence.value,
      target: value.target,
      order: value.order,
      createdAt: value.createdAt,
      archivedAt: value.archivedAt as string | null,
      updatedAt: value.updatedAt,
      deletedAt: value.deletedAt as number | null,
    },
  };
}

function parseEntry(value: unknown): ParseResult<Entry> {
  if (!isObject(value)) return fail("entry must be an object");
  if (!isId(value.habitId)) return fail("entry.habitId must be a non-empty string");
  if (!isDayKey(value.date)) return fail("entry.date must be a YYYY-MM-DD date");
  if (!isCount(value.count, MAX_COUNT)) return fail("entry.count must be a non-negative integer");
  if (!isStamp(value.updatedAt)) return fail("entry.updatedAt must be epoch ms");

  return {
    ok: true,
    value: {
      habitId: value.habitId,
      date: value.date,
      count: value.count,
      updatedAt: value.updatedAt,
    },
  };
}

function parseSettings(value: unknown): ParseResult<Settings> {
  if (!isObject(value)) return fail("settings must be an object");
  // `theme` is deliberately not read. It was a synced field until §13.8 #1 made
  // appearance device-local, and a device still on the older build pushes a blob
  // carrying it. Rejecting that would stop such a device syncing its habits over
  // a preference this build no longer stores; the field is accepted and dropped
  // by the field-by-field construction below.
  if (value.weekStartsOn !== 0 && value.weekStartsOn !== 1) {
    return fail("settings.weekStartsOn must be 0 or 1");
  }
  if (!isCount(value.dayStartHour, 6)) return fail("settings.dayStartHour must be 0–6");
  // Optional for the reason `haptics` is: a device on a build from before
  // reminders existed pushes a blob without it, and refusing that would stop it
  // syncing habits too.
  if (value.reminderHour !== undefined && !isCount(value.reminderHour, 23)) {
    return fail("settings.reminderHour must be 0–23");
  }
  // Optional, unlike its neighbours: a device still on a build from before
  // haptics existed pushes a blob without the field, and rejecting that would
  // stop it syncing anything at all until it updated.
  if (value.haptics !== undefined && typeof value.haptics !== "boolean") {
    return fail("settings.haptics must be a boolean");
  }
  // Optional for the same reason, and checked against the union rather than
  // "is a string": an unknown mode would reach every other device and leave the
  // daily card with no corpus to draw from.
  if (
    value.dailyMode !== undefined &&
    value.dailyMode !== "quotes" &&
    value.dailyMode !== "facts"
  ) {
    return fail("settings.dailyMode must be 'quotes' or 'facts'");
  }
  if (!Array.isArray(value.favourites)) return fail("settings.favourites must be an array");
  if (value.favourites.length > MAX_FAVOURITES) return fail("settings.favourites is too long");
  if (!value.favourites.every(isId)) {
    return fail("settings.favourites must be quote or fact ids");
  }
  // Optional like `haptics`, and checked for shape rather than membership: the
  // tag unions grow, and a device on a newer build must be able to push a tag
  // this one has never heard of. `lib/daily.ts` intersects with the corpus it
  // is about to draw from, so an unknown tag narrows nothing and breaks nothing.
  if (value.dailyTags !== undefined) {
    if (!Array.isArray(value.dailyTags)) return fail("settings.dailyTags must be an array");
    if (value.dailyTags.length > MAX_TAGS) return fail("settings.dailyTags is too long");
    if (!value.dailyTags.every(isId)) return fail("settings.dailyTags must be tag names");
  }

  return {
    ok: true,
    value: {
      weekStartsOn: value.weekStartsOn,
      dayStartHour: value.dayStartHour,
      reminderHour: value.reminderHour ?? DEFAULT_SETTINGS.reminderHour,
      haptics: value.haptics ?? DEFAULT_SETTINGS.haptics,
      dailyMode: value.dailyMode ?? DEFAULT_SETTINGS.dailyMode,
      favourites: value.favourites as string[],
      dailyTags: (value.dailyTags as string[] | undefined) ?? DEFAULT_SETTINGS.dailyTags,
    },
  };
}

function parseList<T>(
  value: unknown,
  field: string,
  parse: (item: unknown) => ParseResult<T>,
): ParseResult<T[]> {
  if (!Array.isArray(value)) return fail(`${field} must be an array`);
  if (value.length > MAX_ROWS_PER_REQUEST) {
    return fail(`${field} has more than ${MAX_ROWS_PER_REQUEST} records`);
  }

  const out: T[] = [];
  for (let i = 0; i < value.length; i++) {
    const parsed = parse(value[i]);
    // The client chunks its push, so without the index a rejected batch gives
    // no way to find the record at fault.
    if (!parsed.ok) return fail(`${field}[${i}]: ${parsed.message}`);
    out.push(parsed.value);
  }
  return { ok: true, value: out };
}

export function parseSyncPush(body: unknown): ParseResult<SyncPush> {
  if (!isObject(body)) return fail("body must be a JSON object");
  if (!isStamp(body.since)) return fail("since must be a non-negative integer");
  if (body.accountId !== null && !isId(body.accountId)) {
    return fail("accountId must be a non-empty string or null");
  }

  const habits = parseList(body.habits, "habits", parseHabit);
  if (!habits.ok) return habits;

  const entries = parseList(body.entries, "entries", parseEntry);
  if (!entries.ok) return entries;

  let settings: SyncPush["settings"] = null;
  if (body.settings !== null && body.settings !== undefined) {
    if (!isObject(body.settings)) return fail("settings must be an object or null");
    if (!isStamp(body.settings.updatedAt)) return fail("settings.updatedAt must be epoch ms");

    const value = parseSettings(body.settings.value);
    if (!value.ok) return value;
    settings = { value: value.value, updatedAt: body.settings.updatedAt };
  }

  return {
    ok: true,
    value: {
      since: body.since,
      accountId: body.accountId as string | null,
      habits: habits.value,
      entries: entries.value,
      settings,
    },
  };
}
