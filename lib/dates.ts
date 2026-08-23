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
