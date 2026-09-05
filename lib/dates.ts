/**
 * All DayKey arithmetic. See DESIGN.md §9.
 *
 * The only module that should call `new Date()` to produce a DayKey. Day maths is
 * done in UTC-space on parsed components so a DST transition can never shift a
 * boundary; conversion to and from *local* civil time happens only at the edges
 * (`dayKeyFromDate`, `todayKey`, and the formatters).
 */

import type { DayKey } from "./types";

const MS_DAY = 86_400_000;

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

/** Parsed calendar components of a DayKey. */
export function parseDayKey(key: DayKey): { y: number; m: number; d: number } {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  const d = Number(key.slice(8, 10));
  return { y, m, d };
}

/** DayKey → an epoch ms anchored at UTC midnight. Internal maths only. */
function toEpoch(key: DayKey): number {
  const { y, m, d } = parseDayKey(key);
  return Date.UTC(y, m - 1, d);
}

function fromEpoch(ms: number): DayKey {
  const dt = new Date(ms);
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

/** A local `Date` → the civil day the user is living in. */
export function dayKeyFromDate(date: Date): DayKey {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** A DayKey → a local `Date` at midnight, for formatting only. */
export function dateFromDayKey(key: DayKey): Date {
  const { y, m, d } = parseDayKey(key);
  return new Date(y, m - 1, d);
}

/**
 * Today, honouring the user's `dayStartHour`. With `dayStartHour: 4`, anything
 * before 4am still counts as yesterday.
 */
export function todayKey(dayStartHour = 0): DayKey {
  const now = new Date();
  if (dayStartHour > 0) now.setHours(now.getHours() - dayStartHour);
  return dayKeyFromDate(now);
}

export function addDays(key: DayKey, n: number): DayKey {
  return fromEpoch(toEpoch(key) + n * MS_DAY);
}

/** Signed whole days from `a` to `b`. */
export function daysBetween(a: DayKey, b: DayKey): number {
  return Math.round((toEpoch(b) - toEpoch(a)) / MS_DAY);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(key: DayKey): number {
  return new Date(toEpoch(key)).getUTCDay();
}

export function startOfWeek(key: DayKey, weekStartsOn: 0 | 1): DayKey {
  const offset = (weekdayOf(key) - weekStartsOn + 7) % 7;
  return addDays(key, -offset);
}

/**
 * The first day of the month `key` falls in, `monthsBack` months earlier if
 * given.
 *
 * Here rather than at the caller because it is the one piece of month
 * arithmetic in the app, and this file is where `new Date()` is allowed to
 * produce a DayKey. `Date.UTC` normalises a negative month index into the
 * previous year on its own, so December needs no special case.
 */
export function startOfMonth(key: DayKey, monthsBack = 0): DayKey {
  const { y, m } = parseDayKey(key);
  return fromEpoch(Date.UTC(y, m - 1 - monthsBack, 1));
}

/** "Thursday, 14 August" */
export function formatDayLong(key: DayKey): string {
  return dateFromDayKey(key).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "Thu, 14 Aug 2026" */
export function formatDayFull(key: DayKey): string {
  return dateFromDayKey(key).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

/** "Aug" */
export function formatMonthShort(key: DayKey): string {
  return dateFromDayKey(key).toLocaleDateString(undefined, { month: "short" });
}

/** Single-letter weekday initials, ordered from the user's week start. */
export function weekdayInitials(weekStartsOn: 0 | 1): string[] {
  const base = ["S", "M", "T", "W", "T", "F", "S"];
  return weekStartsOn === 1 ? [...base.slice(1), base[0]] : base;
}

/** Short weekday names, ordered from the user's week start. */
export function weekdayShortNames(weekStartsOn: 0 | 1): string[] {
  const base = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return weekStartsOn === 1 ? [...base.slice(1), base[0]] : base;
}

/** Row/column index of a day within a week, relative to the user's week start. */
export function weekdayIndex(key: DayKey, weekStartsOn: 0 | 1): number {
  return (weekdayOf(key) - weekStartsOn + 7) % 7;
}

/**
 * Formatters are cached because the reminder cron builds one per subscription
 * and constructing an `Intl.DateTimeFormat` is the expensive half.
 */
const zoneFormatters = new Map<string, Intl.DateTimeFormat>();

function zoneFormatter(timeZone: string): Intl.DateTimeFormat {
  let formatter = zoneFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      // Without this the hour comes back as "24" at midnight under some
      // locales' default cycle, and `Number("24")` is a day that never matches.
      hourCycle: "h23",
    });
    zoneFormatters.set(timeZone, formatter);
  }
  return formatter;
}

/** Does the runtime's ICU know this zone? Anything else is client-supplied junk. */
export function isTimeZone(value: unknown): value is string {
  if (typeof value !== "string" || value.length === 0 || value.length > 64) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/**
 * The civil day and the wall-clock hour at `at`, in someone else's timezone.
 *
 * The reminder cron needs this and `todayKey` cannot give it: the server's own
 * clock is UTC, and nine in the morning is a fact about where the user is. Parts
 * are read by name rather than off a formatted string, so no locale's ordering
 * or separators can change the answer.
 *
 * `hour` is the real wall-clock hour — it is what a reminder time is compared
 * against. `day` honours `dayStartHour` the way `todayKey` does, so the tasks
 * listed in the notification are the ones the app would show at that moment.
 */
export function civilInZone(
  timeZone: string,
  at: Date = new Date(),
  dayStartHour = 0,
): { day: DayKey; hour: number } {
  const parts = zoneFormatter(timeZone).formatToParts(at);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  const hour = Number(part("hour"));
  const day = `${part("year")}-${part("month")}-${part("day")}`;

  return { day: hour < dayStartHour ? addDays(day, -1) : day, hour };
}
