import { describe, expect, it } from "vitest";
import type { OverdueRow } from "./csv.ts";
import { planImport } from "./importPlan.ts";

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
});
