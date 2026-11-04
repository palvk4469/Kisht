import { daysBetween, type IsoDay } from "../dates.ts";
import { PROMISE_GRACE_DAYS } from "../promises.ts";

// What a lender knows about a loan on a given day, and the model's inputs.
// Everything here is point-in-time: nothing after `day` may influence the
// result, otherwise the back-test would be peeking at the future.

export type LoanEvents = {
  snapshots: readonly {
    asOfDate: IsoDay;
    dpd: number;
    outstanding: number;
    lastPaymentDate: IsoDay | null;
  }[];
  promises: readonly {
    madeOn: IsoDay;
    dueDate: IsoDay;
    status: string;
    /** The day the final status became known; null while pending. */
    resolvedOn: IsoDay | null;
  }[];
  outcomes: readonly { day: IsoDay; type: string }[];
};

export type LoanFacts = {
  dpd: number;
  outstanding: number;
  daysSincePayment: number | null;
  /** Days overdue out of the last 90: how chronic the lateness is. */
  overdueDays90: number;
  brokenPromises90: number;
  keptPromises90: number;
  /** Days until a pending promise falls due (negative once past); null if none. */
  promiseDueInDays: number | null;
  daysSinceContact: number | null;
  notReachable30: number;
  /** Days since this loan first appeared on an overdue list. */
  historyDays: number;
};

const LOOKBACK = 90;

export function factsAt(events: LoanEvents, day: IsoDay): LoanFacts | null {
  const now = events.snapshots.find((s) => s.asOfDate === day);
  if (!now) return null;

  let overdueDays90 = 0;
  let historyDays = 0;
  for (const s of events.snapshots) {
    const age = daysBetween(s.asOfDate, day);
    if (age < 0) continue;
    if (age < LOOKBACK) overdueDays90++;
    if (age > historyDays) historyDays = age;
  }

  let brokenPromises90 = 0;
  let keptPromises90 = 0;
  let promiseDueInDays: number | null = null;
  for (const p of events.promises) {
    if (p.madeOn > day) continue;
    const known = p.resolvedOn !== null && p.resolvedOn <= day;
    if (!known) {
      promiseDueInDays = daysBetween(day, p.dueDate);
      continue;
    }
    if (daysBetween(p.resolvedOn as IsoDay, day) >= LOOKBACK) continue;
    if (p.status === "BROKEN" || p.status === "PARTIAL") brokenPromises90++;
    if (p.status === "KEPT") keptPromises90++;
  }

  let daysSinceContact: number | null = null;
  let notReachable30 = 0;
  for (const o of events.outcomes) {
    const age = daysBetween(o.day, day);
    if (age < 0) continue;
    if (daysSinceContact === null || age < daysSinceContact) daysSinceContact = age;
    if (age < 30 && o.type === "NOT_REACHABLE") notReachable30++;
  }

  return {
    dpd: now.dpd,
    outstanding: now.outstanding,
    daysSincePayment: now.lastPaymentDate ? daysBetween(now.lastPaymentDate, day) : null,
    overdueDays90,
    brokenPromises90,
    keptPromises90,
    promiseDueInDays,
    daysSinceContact,
    notReachable30,
    historyDays,
  };
}

/** Too little to go on: the score leans on DPD and amount, and the UI says so. */
export function hasLimitedHistory(f: LoanFacts): boolean {
  return (
    f.historyDays < 14 &&
    f.daysSincePayment === null &&
    f.brokenPromises90 + f.keptPromises90 === 0 &&
    f.daysSinceContact === null
  );
}

/** A promise that is still open: it shouldn't be chased until it falls due (A19). */
export function isWaitingOnPromise(f: LoanFacts): boolean {
  return f.promiseDueInDays !== null && f.promiseDueInDays > 0;
}

export const FEATURES = [
  "dpdWithin30",
  "dpdBeyond30",
  "pastRoll",
  "logOutstanding",
  "monthsSincePayment",
  "priorOverdueShare90",
  "brokenPromises90",
  "keptPromises90",
  "openPromise",
  "monthsSinceContact",
  "notReachable30",
] as const;

export type FeatureName = (typeof FEATURES)[number];

/** Days overdue in the last 90 before the current spell: repeat lateness, not this bout. */
export function priorOverdueDays(f: LoanFacts): number {
  return Math.max(f.overdueDays90 - Math.min(f.dpd, LOOKBACK), 0);
}

/** Reference amount for the log scale: the median outstanding in the brief's range. */
const REFERENCE_OUTSTANDING = 350_000;

/** Model inputs, in FEATURES order. null = unknown, treated as average. */
export function toVector(f: LoanFacts): (number | null)[] {
  return [
    Math.min(f.dpd, 30) / 30,
    Math.max(Math.min(f.dpd, 120) - 30, 0) / 30,
    f.dpd > 30 ? 1 : 0,
    Math.log(Math.max(f.outstanding, 1) / REFERENCE_OUTSTANDING),
    f.daysSincePayment === null ? null : Math.min(f.daysSincePayment, 180) / 30,
    priorOverdueDays(f) / LOOKBACK,
    Math.min(f.brokenPromises90, 4),
    Math.min(f.keptPromises90, 4),
    f.promiseDueInDays !== null && f.promiseDueInDays >= -PROMISE_GRACE_DAYS ? 1 : 0,
    f.daysSinceContact === null ? null : Math.min(f.daysSinceContact, 30) / 30,
    Math.min(f.notReachable30, 5),
  ];
}
