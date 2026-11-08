import type { TodayItem } from "@kisht/contracts";
import { describe, expect, it } from "vitest";
import type { OutboxRow } from "./db";
import { applyUnsent } from "./overlay";

const NOW = new Date("2026-11-04T11:00:00+05:30");
const AT = NOW.toISOString();

const item = (over: Partial<TodayItem> = {}): TodayItem => ({
  loanId: "L1",
  loanNo: "LN-1",
  borrowerName: "Company X",
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
});

const base = {
  userId: "u",
  loanId: "L1",
  borrowerName: "Company X",
  status: "pending" as const,
  reason: null,
};
const gps = { lat: null, lng: null, accuracyM: null };

const attempt = (clientId: string, blockedLocally = false): OutboxRow => ({
  ...base,
  clientId,
  kind: "attempt",
  blockedLocally,
  event: { clientId, loanId: "L1", channel: "CALL", at: AT, ...gps },
});

const outcome = (clientId: string, attemptClientId: string, over: object = {}): OutboxRow => ({
  ...base,
  clientId,
  kind: "outcome",
  event: {
    clientId,
    attemptClientId,
    loanId: "L1",
    type: "NOT_REACHABLE",
    at: AT,
    amount: null,
    promiseDueDate: null,
    note: null,
    ...gps,
    ...over,
  },
});

const one = (rows: OutboxRow[], over: Partial<TodayItem> = {}) => {
  const [result] = applyUnsent([item(over)], rows, NOW, "Rahul");
  if (!result) throw new Error("no item");
  return result;
};

describe("applyUnsent", () => {
  it("leaves a loan with nothing unsent alone", () => {
    expect(one([])).toMatchObject({ state: "todo", unsent: false, attemptsToday: 0 });
  });

  it("an unsent call opens an attempt that the outcome can link to", () => {
    expect(one([attempt("a")])).toMatchObject({
      openAttemptClientId: "a",
      attemptsToday: 1,
      unsent: true,
    });
  });

  it("a blocked call opens nothing and doesn't count against the cap", () => {
    expect(one([attempt("a", true)])).toMatchObject({
      openAttemptClientId: null,
      attemptsToday: 0,
    });
  });

  it("an unsent outcome moves the loan to done and shows in its history", () => {
    const r = one([attempt("a"), outcome("o", "a")]);
    expect(r.state).toBe("done");
    expect(r.openAttemptClientId).toBeNull();
    expect(r.lastOutcome?.type).toBe("NOT_REACHABLE");
    expect(r.history[0]).toMatchObject({ id: "o", unsent: true, officerName: "Rahul" });
  });

  it("answers an attempt the server already has", () => {
    const r = one([outcome("o", "server-attempt")], { openAttemptClientId: "server-attempt" });
    expect(r.openAttemptClientId).toBeNull();
  });

  it("an unsent promise shows with the EMI as its default amount", () => {
    const r = one([
      attempt("a"),
      outcome("o", "a", { type: "PROMISE", promiseDueDate: "2026-11-07" }),
    ]);
    expect(r.promise).toEqual({ dueDate: "2026-11-07", amount: 5000, status: "PENDING" });
  });

  it("an unsent dispute pauses contact straight away, as the server will", () => {
    expect(one([attempt("a"), outcome("o", "a", { type: "DISPUTE" })])).toMatchObject({
      state: "paused",
      contactPaused: true,
    });
  });

  it("yesterday's unsent work doesn't count as today's", () => {
    const old = "2026-11-03T11:00:00+05:30";
    const a = attempt("a");
    if (a.kind === "attempt") a.event.at = new Date(old).toISOString();
    const r = one([a, outcome("o", "a", { at: new Date(old).toISOString() })]);
    expect(r.attemptsToday).toBe(0);
    expect(r.state).toBe("todo");
  });

  it("ignores refused events and other loans", () => {
    const failed: OutboxRow = { ...attempt("a"), status: "failed", reason: "TOO_OLD" };
    const other: OutboxRow = { ...attempt("b"), loanId: "L2" };
    expect(one([failed, other])).toMatchObject({ unsent: false, attemptsToday: 0 });
  });
});
