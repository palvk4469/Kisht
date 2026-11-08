import type { OutcomeType } from "@kisht/contracts";
import { type IsoDay, istDayOf } from "@kisht/domain";
import type { MessageKey } from "@/lib/i18n";
import type { FieldItem } from "../offline/overlay";

/** An officer's day, worked out on the phone so it counts what hasn't synced yet. */
export type DaySummary = {
  /** Loans with an outcome logged today. */
  worked: number;
  /** Loans still to do, including those beyond today's capacity. */
  leftToDo: number;
  /** Allowed calls, visits and messages today. */
  contacts: number;
  outcomes: Record<OutcomeType, number>;
  promisedRupees: number;
  paidRupees: number;
  dueTomorrow: { count: number; rupees: number };
  /** Entries on this phone waiting for signal. */
  unsent: number;
  /** Entries the server refused, which the officer needs to look at. */
  failed: number;
};

export function summarizeDay(input: {
  items: readonly FieldItem[];
  beyondCapacity: number;
  officerName: string;
  today: IsoDay;
  tomorrow: IsoDay;
  unsent: number;
  failed: number;
}): DaySummary {
  const { items, today, tomorrow } = input;
  const outcomes: Record<OutcomeType, number> = {
    PAID: 0,
    PROMISE: 0,
    NOT_REACHABLE: 0,
    DISPUTE: 0,
  };
  let worked = 0;
  let promisedRupees = 0;
  let paidRupees = 0;
  const dueTomorrow = { count: 0, rupees: 0 };

  for (const item of items) {
    // A loan's history shows every officer's entries; only this officer's day counts.
    const mine = item.history.filter(
      (h) => h.officerName === input.officerName && istDayOf(new Date(h.at)) === today,
    );
    if (mine.length > 0) worked++;
    for (const h of mine) {
      outcomes[h.type]++;
      if (h.type === "PROMISE") promisedRupees += h.amount ?? item.emiAmount;
      if (h.type === "PAID") paidRupees += h.amount ?? 0;
    }
    if (item.promise?.status === "PENDING" && item.promise.dueDate === tomorrow) {
      dueTomorrow.count++;
      dueTomorrow.rupees += item.promise.amount;
    }
  }

  return {
    worked,
    leftToDo: items.filter((i) => i.state === "todo").length + input.beyondCapacity,
    contacts: items.reduce((sum, i) => sum + i.attemptsToday, 0),
    outcomes,
    promisedRupees,
    paidRupees,
    dueTomorrow,
    unsent: input.unsent,
    failed: input.failed,
  };
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/**
 * The evening message to the branch, in the officer's language. Counts and
 * rupees only: no borrower names or numbers leave the app this way (A30).
 */
export function shareText(
  s: DaySummary,
  t: Translate,
  fmt: { rupees: (n: number) => string; officerName: string; date: string },
): string {
  const lines = [
    t("day.shareTitle", { name: fmt.officerName, date: fmt.date }),
    t("day.shareWorked", {
      worked: s.worked,
      total: s.worked + s.leftToDo,
      contacts: s.contacts,
    }),
    t("day.sharePaid", { n: s.outcomes.PAID, amount: fmt.rupees(s.paidRupees) }),
    t("day.sharePromised", { n: s.outcomes.PROMISE, amount: fmt.rupees(s.promisedRupees) }),
    t("day.shareOther", { nr: s.outcomes.NOT_REACHABLE, d: s.outcomes.DISPUTE }),
    t("day.shareTomorrow", {
      left: s.leftToDo,
      n: s.dueTomorrow.count,
      amount: fmt.rupees(s.dueTomorrow.rupees),
    }),
  ];
  if (s.unsent > 0) lines.push(t("day.shareUnsent", { n: s.unsent }));
  return lines.join("\n");
}
