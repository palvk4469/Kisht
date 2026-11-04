import { addDays, istDayOf, istDayStart } from "./dates.ts";

// RBI recovery rules: borrowers may be contacted only between 08:00 and 19:00
// local time (A4). The window is half-open, [08:00, 19:00): 18:59:59 is
// allowed, 19:00:00 is not. Judged in IST regardless of the device's timezone.

export const CONTACT_WINDOW_START_MIN = 8 * 60;
export const CONTACT_WINDOW_END_MIN = 19 * 60;

const MINUTE_MS = 60 * 1000;

/** Minutes since IST midnight, with fractions (so 18:59:59 < 19:00). */
export function istMinuteOfDay(instant: Date): number {
  return (instant.getTime() - istDayStart(istDayOf(instant)).getTime()) / MINUTE_MS;
}

export function isContactAllowed(instant: Date): boolean {
  const m = istMinuteOfDay(instant);
  return m >= CONTACT_WINDOW_START_MIN && m < CONTACT_WINDOW_END_MIN;
}

/** The instant contact next becomes allowed: `instant` itself if it already is. */
export function nextAllowedAt(instant: Date): Date {
  if (isContactAllowed(instant)) return instant;
  const day = istDayOf(instant);
  const opensToday = new Date(istDayStart(day).getTime() + CONTACT_WINDOW_START_MIN * MINUTE_MS);
  if (instant < opensToday) return opensToday;
  return new Date(istDayStart(addDays(day, 1)).getTime() + CONTACT_WINDOW_START_MIN * MINUTE_MS);
}

// Anti-harassment cap (A5): allowed contact attempts per loan per day.
export const MAX_ATTEMPTS_PER_DAY = 3;

export type ContactBlockReason = "OUTSIDE_CONTACT_WINDOW" | "CONTACT_PAUSED" | "DAILY_ATTEMPT_CAP";

/** Whether a contact attempt may go ahead. Blocked attempts are still recorded. */
export function checkContact(input: {
  at: Date;
  contactPaused: boolean;
  allowedAttemptsToday: number;
}): ContactBlockReason | null {
  if (!isContactAllowed(input.at)) return "OUTSIDE_CONTACT_WINDOW";
  if (input.contactPaused) return "CONTACT_PAUSED";
  if (input.allowedAttemptsToday >= MAX_ATTEMPTS_PER_DAY) return "DAILY_ATTEMPT_CAP";
  return null;
}
