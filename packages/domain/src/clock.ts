// Offline events carry the phone's clock, which can be wrong or tampered with.
// A batch also says what the phone's clock read when it was sent, so the gap
// to the server's clock at arrival corrects every event in it. Setting a phone
// back to 3 pm at 9 pm therefore changes nothing: both readings shift together.

const DAY_MS = 24 * 60 * 60 * 1000;

/** Older than this, an event is refused: nobody should sync a month-old visit. */
export const MAX_EVENT_AGE_DAYS = 30;

/** Skew beyond this is worth a manager's attention. */
export const CLOCK_SKEW_WARNING_MS = 5 * 60 * 1000;

export function correctedTime(deviceAt: Date, deviceSentAt: Date, serverNow: Date): Date {
  const corrected = deviceAt.getTime() + (serverNow.getTime() - deviceSentAt.getTime());
  // An event cannot have happened after the server received it.
  return new Date(Math.min(corrected, serverNow.getTime()));
}

export function isTooOld(at: Date, serverNow: Date): boolean {
  return serverNow.getTime() - at.getTime() > MAX_EVENT_AGE_DAYS * DAY_MS;
}
