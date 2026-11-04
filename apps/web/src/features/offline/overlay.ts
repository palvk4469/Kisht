import type { HistoryEntry, TodayItem } from "@kisht/contracts";
import { istDayOf } from "@kisht/domain";
import type { OutboxRow } from "./db";

/** A history line that exists only on this phone so far. */
export type LocalHistoryEntry = HistoryEntry & { unsent?: boolean };

export type FieldItem = Omit<TodayItem, "history"> & {
  history: LocalHistoryEntry[];
  unsent: boolean;
};

/**
 * Today's list as the officer should see it: the server's last word, plus
 * everything logged on this phone since. What the server will decide when the
 * events arrive is applied here too, so the screen doesn't wait for signal.
 */
export function applyUnsent(
  items: readonly TodayItem[],
  rows: readonly OutboxRow[],
  now: Date,
  officerName: string,
): FieldItem[] {
  const today = istDayOf(now);
  const byLoan = new Map<string, OutboxRow[]>();
  for (const row of rows) {
    if (row.status !== "pending") continue;
    const list = byLoan.get(row.loanId) ?? [];
    list.push(row);
    byLoan.set(row.loanId, list);
  }

  return items.map((item) => {
    const own = byLoan.get(item.loanId);
    if (!own) return { ...item, unsent: false };

    const next: FieldItem = { ...item, unsent: true, history: [...item.history] };
    const answered = new Set(
      own.flatMap((r) => (r.kind === "outcome" ? [r.event.attemptClientId] : [])),
    );
    if (next.openAttemptClientId && answered.has(next.openAttemptClientId)) {
      next.openAttemptClientId = null;
    }

    for (const row of own) {
      if (row.kind === "attempt") {
        if (row.blockedLocally) continue;
        if (istDayOf(new Date(row.event.at)) === today) next.attemptsToday += 1;
        if (!answered.has(row.clientId)) next.openAttemptClientId = row.clientId;
        continue;
      }
      const e = row.event;
      next.history.unshift({
        id: e.clientId,
        type: e.type,
        at: e.at,
        amount: e.amount,
        note: e.note,
        officerName,
        unsent: true,
      });
      next.lastOutcome = { type: e.type, at: e.at };
      if (istDayOf(new Date(e.at)) === today) next.state = "done";
      if (e.type === "PROMISE" && e.promiseDueDate) {
        next.promise = {
          dueDate: e.promiseDueDate,
          amount: e.amount ?? item.emiAmount,
          status: "PENDING",
        };
      }
      if (e.type === "DISPUTE") {
        next.contactPaused = true;
        next.state = "paused";
      }
    }
    return next;
  });
}
