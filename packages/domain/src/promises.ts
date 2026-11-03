import { addDays, type IsoDay } from "./dates.ts";

// Promise-to-pay resolution (A7).
//
// The loan system export runs a day behind, so payments made on the promised
// day may only appear in the next day's import: the promise stays open until
// dueDate + 1. A promise is KEPT as soon as ≥ 90% of the amount has arrived
// (early payment closes it at once); once the grace day has passed it is
// PARTIAL if something arrived, BROKEN if nothing did.

export const PROMISE_KEPT_RATIO = 0.9;
export const PROMISE_GRACE_DAYS = 1;

export type PromiseStatus = "PENDING" | "KEPT" | "PARTIAL" | "BROKEN";

export type PromiseInput = {
  madeOn: IsoDay;
  dueDate: IsoDay;
  amount: number;
};

export type PaymentInput = { date: IsoDay; amount: number };

export type PromiseResolution = {
  status: PromiseStatus;
  paidAmount: number;
  /** The day the status became final; null while pending. */
  resolvedOn: IsoDay | null;
};

export function resolvePromise(
  promise: PromiseInput,
  payments: readonly PaymentInput[],
  today: IsoDay,
): PromiseResolution {
  const windowEnd = addDays(promise.dueDate, PROMISE_GRACE_DAYS);
  const target = promise.amount * PROMISE_KEPT_RATIO;

  // Walk payments in date order so an early "kept" is dated correctly.
  const counted = payments
    .filter((p) => p.date >= promise.madeOn && p.date <= windowEnd && p.date <= today)
    .sort((a, b) => a.date.localeCompare(b.date));

  let paid = 0;
  for (const p of counted) {
    paid += p.amount;
    if (paid >= target) return { status: "KEPT", paidAmount: paid, resolvedOn: p.date };
  }

  if (today <= windowEnd) return { status: "PENDING", paidAmount: paid, resolvedOn: null };
  return {
    status: paid > 0 ? "PARTIAL" : "BROKEN",
    paidAmount: paid,
    resolvedOn: addDays(windowEnd, 1),
  };
}
