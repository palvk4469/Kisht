import { z } from "zod";

// Calendar days in this app are IST days, written as "YYYY-MM-DD" strings.
//
// Postgres DATE columns (Prisma @db.Date) keep only the UTC date part of a JS
// Date. IST midnight is 18:30 UTC on the previous day, so writing
// `new Date("2026-11-02T00:00:00+05:30")` stores 2026-11-01. Always convert
// through these helpers instead of passing Dates for days around.

export const APP_TIMEZONE = "Asia/Kolkata";

/** IST is UTC+05:30 all year (no daylight saving). */
const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export type IsoDay = string;

export function isIsoDay(value: string): value is IsoDay {
  const m = DAY_RE.exec(value);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === value;
}

function assertIsoDay(day: string): asserts day is IsoDay {
  if (!isIsoDay(day)) throw new RangeError(`Not a valid YYYY-MM-DD day: ${day}`);
}

/** The IST calendar day an instant falls on. */
export function istDayOf(instant: Date): IsoDay {
  return new Date(instant.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** The instant IST midnight begins on `day`. Use for "during this day" queries. */
export function istDayStart(day: IsoDay): Date {
  assertIsoDay(day);
  return new Date(Date.parse(`${day}T00:00:00.000Z`) - IST_OFFSET_MS);
}

/** Value to write into a @db.Date column for `day`. */
export function toDbDate(day: IsoDay): Date {
  assertIsoDay(day);
  return new Date(`${day}T00:00:00.000Z`);
}

/** Read a @db.Date column back as a day. */
export function fromDbDate(value: Date): IsoDay {
  return value.toISOString().slice(0, 10);
}

export function addDays(day: IsoDay, n: number): IsoDay {
  return fromDbDate(new Date(toDbDate(day).getTime() + n * DAY_MS));
}

/** Whole days from `from` to `to` (positive when `to` is later). */
export function daysBetween(from: IsoDay, to: IsoDay): number {
  return Math.round((toDbDate(to).getTime() - toDbDate(from).getTime()) / DAY_MS);
}

/** Zod schema for an IST calendar day, for API inputs and contracts. */
export const IsoDaySchema = z.string().refine(isIsoDay, "must be a real date as YYYY-MM-DD");
