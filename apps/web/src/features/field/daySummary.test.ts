import type { HistoryEntry, TodayItem } from "@kisht/contracts";
import { describe, expect, it } from "vitest";
import type { OutboxRow } from "../offline/db";
import { applyUnsent } from "../offline/overlay";
import { shareText, summarizeDay } from "./daySummary";

const NOW = new Date("2026-11-04T18:00:00+05:30");
const TODAY = "2026-11-04";
const TOMORROW = "2026-11-05";
const ME = "Ravi";

const entry = (over: Partial<HistoryEntry>): HistoryEntry => ({
  id: crypto.randomUUID(),
  type: "NOT_REACHABLE",
  at: "2026-11-04T10:00:00+05:30",
  amount: null,
  note: null,
  officerName: ME,
  ...over,
});

let n = 0;
const item = (over: Partial<TodayItem> = {}): TodayItem => {
  n++;
  return {
    loanId: `L${n}`,
    loanNo: `LN-${n}`,
    borrowerName: `Company ${n}`,
    businessType: "-",
    phone: "9000012345",
    phoneMasked: "••••••2345",
    address: "-",
    lat: null,
    lng: null,
    dpd: 10,
    outstanding: 100000,
    emiAmount: 5000,
    priority: null,
    state: "todo",
    contactPaused: false,
    attemptsToday: 0,
    promise: null,
    lastOutcome: null,
    managerNote: null,
    openAttemptClientId: null,
    history: [],
    changes: { newOverdue: false, newToYou: null, paid: null },
    ...over,
  };
};

const unsentPromise = (loanId: string): OutboxRow => ({
  clientId: crypto.randomUUID(),
  userId: "u",
  loanId,
  borrowerName: "Company Secret",
  status: "pending",
  reason: null,
  kind: "outcome",
  event: {
    clientId: crypto.randomUUID(),
    attemptClientId: crypto.randomUUID(),
    loanId,
    type: "PROMISE",
    at: NOW.toISOString(),
    amount: null,
    promiseDueDate: TOMORROW,
    note: null,
    lat: null,
    lng: null,
    accuracyM: null,
  },
});

function summarize(items: TodayItem[], rows: OutboxRow[] = [], beyondCapacity = 0) {
  return summarizeDay({
    items: applyUnsent(items, rows, NOW, ME),
    beyondCapacity,
    officerName: ME,
    today: TODAY,
    tomorrow: TOMORROW,
    unsent: rows.length,
    failed: 0,
  });
}

describe("the day summary", () => {
  it("counts today's outcomes and rupees, including what hasn't synced", () => {
    const paid = item({
      state: "done",
      attemptsToday: 1,
      history: [entry({ type: "PAID", amount: 3000 })],
    });
    const waiting = item({ attemptsToday: 1 });
    const s = summarize([paid, waiting, item()], [unsentPromise(waiting.loanId)], 2);
    expect(s).toMatchObject({
      worked: 2,
      // One untouched loan on the list, plus two beyond capacity.
      leftToDo: 3,
      contacts: 2,
      outcomes: { PAID: 1, PROMISE: 1, NOT_REACHABLE: 0, DISPUTE: 0 },
      paidRupees: 3000,
      // A promise with no amount is one EMI.
      promisedRupees: 5000,
      // The unsent promise is due tomorrow.
      dueTomorrow: { count: 1, rupees: 5000 },
      unsent: 1,
    });
  });

  it("leaves out yesterday, and another officer's entries on the same loan", () => {
    const s = summarize([
      item({
        history: [
          entry({ at: "2026-11-03T17:00:00+05:30", type: "PAID", amount: 900 }),
          entry({ officerName: "Someone else", type: "DISPUTE" }),
        ],
      }),
    ]);
    expect(s.worked).toBe(0);
    expect(s.outcomes).toEqual({ PAID: 0, PROMISE: 0, NOT_REACHABLE: 0, DISPUTE: 0 });
  });

  it("writes a message with counts only, never a borrower's name or number", () => {
    const items = [item({ history: [entry({ type: "PROMISE", amount: 7000 })] })];
    const rows = [unsentPromise(items[0]?.loanId ?? "")];
    const s = summarize(items, rows);
    const t = (key: string, vars?: Record<string, string | number>) =>
      `${key} ${JSON.stringify(vars ?? {})}`;
    const text = shareText(s, t, {
      rupees: (v) => `₹${v}`,
      officerName: ME,
      date: TODAY,
    });
    expect(text).toContain("day.shareUnsent");
    expect(text).toContain("₹12000");
    expect(text).not.toMatch(/Company|9000012345|2345/);
  });
});
