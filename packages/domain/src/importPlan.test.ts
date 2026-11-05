import { describe, expect, it } from "vitest";
import type { OverdueRow } from "./csv.ts";
import {
  CURED_REVIEW_MIN_LOANS,
  CURED_REVIEW_SHARE,
  curedNeedsConfirmation,
  planImport,
} from "./importPlan.ts";

const row = (loanNo: string, over: Partial<OverdueRow> = {}): OverdueRow => ({
  row: 2,
  loanNo,
  borrowerName: "Company X",
  businessType: "-",
  phone: "9000012345",
  address: "-",
  pincode: "452001",
  outstanding: 300000,
  dpd: 10,
  emiAmount: 10000,
  lastPaymentDate: "2026-10-01",
  lastPaymentAmount: 10000,
  branchCode: "IND",
  ...over,
});

const base = {
  asOfDate: "2026-11-02",
  previous: new Map([
    ["LN-1", { outstanding: 300000, lastPaymentDate: "2026-10-01" }],
    ["LN-2", { outstanding: 300000, lastPaymentDate: "2026-10-01" }],
    ["LN-3", { outstanding: 300000, lastPaymentDate: "2026-10-01" }],
  ]),
  previousList: new Set(["LN-1", "LN-2", "LN-3"]),
  knownLoans: new Set(["LN-1", "LN-2", "LN-3"]),
};

describe("planImport", () => {
  it("finds no payment when nothing changed", () => {
    const p = planImport({ ...base, rows: [row("LN-1"), row("LN-2"), row("LN-3")] });
    expect(p).toEqual({ payments: [], cured: [], newLoans: [] });
  });

  it("records a payment when the last payment date moves forward", () => {
    const p = planImport({
      ...base,
      rows: [
        row("LN-1", { lastPaymentDate: "2026-11-01", lastPaymentAmount: 5000 }),
        row("LN-2"),
        row("LN-3"),
      ],
    });
    expect(p.payments).toEqual([
      { loanNo: "LN-1", date: "2026-11-01", amount: 5000, source: "LAST_PAYMENT_DATE" },
    ]);
  });

  it("falls back to a drop in outstanding, dated the day before (export lag)", () => {
    const p = planImport({
      ...base,
      rows: [row("LN-1", { outstanding: 292500 }), row("LN-2"), row("LN-3")],
    });
    expect(p.payments).toEqual([
      { loanNo: "LN-1", date: "2026-11-01", amount: 7500, source: "OUTSTANDING_DROP" },
    ]);
  });

  it("treats loans that fell off the overdue list as cured", () => {
    const p = planImport({ ...base, rows: [row("LN-2")] });
    expect(p.cured).toEqual(["LN-1", "LN-3"]);
  });

  it("flags loans seen for the first time", () => {
    const p = planImport({ ...base, rows: [row("LN-1"), row("LN-2"), row("LN-3"), row("LN-9")] });
    expect(p.newLoans).toEqual(["LN-9"]);
    // A new loan's last payment is recorded once; promise rules ignore old payments.
    expect(p.payments.map((x) => x.loanNo)).toEqual(["LN-9"]);
  });

  it("doesn't cure a loan whose row was rejected", () => {
    const plan = planImport({
      asOfDate: "2026-11-02",
      rows: [row("LN-1")],
      previous: new Map(),
      previousList: new Set(["LN-1", "LN-2", "LN-3"]),
      knownLoans: new Set(["LN-1", "LN-2", "LN-3"]),
      rejected: new Set(["LN-2"]),
    });
    expect(plan.cured).toEqual(["LN-3"]);
  });
});

describe("curedNeedsConfirmation", () => {
  it.each([
    ["an ordinary day", 15, 104, false],
    ["exactly at the share", 20, 100, false],
    ["just past the share", 21, 100, true],
    ["half the branch missing", 52, 104, true],
    ["a whole list missing", 104, 104, true],
    ["a few real cures on a small list", CURED_REVIEW_MIN_LOANS - 1, 6, false],
    ["the floor on a small list", CURED_REVIEW_MIN_LOANS, 6, true],
    ["nothing cured", 0, 0, false],
    ["the first import ever", 0, 0, false],
  ])("%s", (_, cured, previous, expected) => {
    expect(curedNeedsConfirmation(cured, previous)).toBe(expected);
  });

  it("keeps the measured normal peak below the line", () => {
    expect(0.135).toBeLessThan(CURED_REVIEW_SHARE);
  });
});
