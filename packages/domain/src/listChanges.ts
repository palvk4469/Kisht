import type { IsoDay } from "./dates.ts";

// What changed on an officer's list since the previous one (A32): the things
// worth knowing before the first call of the morning.

export type SnapshotFacts = {
  asOfDate: IsoDay;
  lastPaymentDate: IsoDay | null;
  lastPaymentAmount: number | null;
};

export type ListChanges = {
  /** Not on the previous list: newly overdue, or overdue again. */
  newOverdue: boolean;
  /** Came to this officer since the previous list; MANUAL means a manager moved it. */
  newToYou: "AUTO" | "MANUAL" | null;
  /** A payment the loan system reported since the previous list. */
  paid: { date: IsoDay; amount: number | null } | null;
};

export const NO_CHANGES: ListChanges = { newOverdue: false, newToYou: null, paid: null };

export function listChanges(input: {
  /** The loan's snapshot on the latest list. */
  latest: SnapshotFacts;
  /** The loan's snapshot before that, if any. */
  previous: SnapshotFacts | null;
  /** The list day before the latest; null if this is the first list. */
  previousListDay: IsoDay | null;
  /** The loan's current assignment: the IST day it started, and how. */
  assignment: { startedOn: IsoDay; source: "AUTO" | "MANUAL" } | null;
}): ListChanges {
  const { latest, previous, previousListDay, assignment } = input;
  // With nothing to compare against, everything would look new: say nothing.
  if (previousListDay === null) return NO_CHANGES;

  const newOverdue = previous === null || previous.asOfDate < previousListDay;
  const newToYou =
    !newOverdue && assignment !== null && assignment.startedOn >= latest.asOfDate
      ? assignment.source
      : null;
  const paid =
    !newOverdue &&
    previous !== null &&
    latest.lastPaymentDate !== null &&
    (previous.lastPaymentDate === null || latest.lastPaymentDate > previous.lastPaymentDate)
      ? { date: latest.lastPaymentDate, amount: latest.lastPaymentAmount }
      : null;
  return { newOverdue, newToYou, paid };
}
