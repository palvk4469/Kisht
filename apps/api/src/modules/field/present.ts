import type { HistoryEntry, Priority, PromiseSummary, Reason } from "@kisht/contracts";
import { daysBetween, fromDbDate, type IsoDay, istDayOf } from "@kisht/domain";

/** Stored score row to the wire shape. Reasons' internal weights stay on the server. */
export function toPriority(score: {
  modelVersion: string;
  probability: number;
  expectedLoss: number;
  reasons: unknown;
  limitedHistory: boolean;
}): Priority {
  const reasons = (score.reasons as Reason[]).map(({ code, value }) => ({ code, value }));
  return {
    modelVersion: score.modelVersion,
    probability: score.probability,
    expectedLoss: score.expectedLoss,
    reasons,
    limitedHistory: score.limitedHistory,
  };
}

const RECENT_BROKEN_DAYS = 7;

/** A promise worth showing today: open, or broken in the last week. */
export function visiblePromise(
  p: { dueDate: Date; amount: number; status: PromiseSummary["status"]; resolvedAt: Date | null },
  today: IsoDay,
): PromiseSummary | null {
  const summary = { dueDate: fromDbDate(p.dueDate), amount: p.amount, status: p.status };
  if (p.status === "PENDING") return summary;
  const broken = p.status === "BROKEN" || p.status === "PARTIAL";
  if (broken && p.resolvedAt && daysBetween(istDayOf(p.resolvedAt), today) <= RECENT_BROKEN_DAYS) {
    return summary;
  }
  return null;
}

export function toHistory(o: {
  id: string;
  type: HistoryEntry["type"];
  correctedAt: Date;
  amount: number | null;
  note: string | null;
  officer: { name: string };
}): HistoryEntry {
  return {
    id: o.id,
    type: o.type,
    at: o.correctedAt.toISOString(),
    amount: o.amount,
    note: o.note,
    officerName: o.officer.name,
  };
}
