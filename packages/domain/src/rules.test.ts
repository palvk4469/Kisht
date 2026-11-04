import { describe, expect, it } from "vitest";
import { assignLoans } from "./assignment.ts";
import { isContactAllowed } from "./contactWindow.ts";
import { applyPins } from "./listOrder.ts";
import { formatRupees, planReminders, REMINDER_TEMPLATES, renderReminder } from "./reminders.ts";
import { findBlockedWords } from "./wordFilter.ts";

const ist = (t: string) => new Date(`${t}+05:30`);

describe("planReminders", () => {
  it("reminds the borrower the day before and on the day, and the officer that morning", () => {
    const plan = planReminders("2026-11-07", ist("2026-11-04T12:00:00"));
    expect(plan.map((r) => [r.recipient, r.at])).toEqual([
      ["BORROWER", ist("2026-11-06T10:00:00")],
      ["OFFICER", ist("2026-11-07T08:30:00")],
      ["BORROWER", ist("2026-11-07T09:00:00")],
    ]);
  });

  it("never plans a reminder outside 8 am to 7 pm", () => {
    for (const r of planReminders("2026-11-07", ist("2026-11-01T12:00:00"))) {
      expect(isContactAllowed(r.at)).toBe(true);
    }
  });

  it("skips any moment already past: a promise for tomorrow made this afternoon", () => {
    const plan = planReminders("2026-11-05", ist("2026-11-04T15:00:00"));
    expect(plan.map((r) => r.template)).toEqual(["OFFICER_DUE", "BORROWER_DUE"]);
  });
});

describe("renderReminder", () => {
  const vars = {
    borrowerName: "Company B",
    amount: formatRupees(26700),
    date: "7 Nov",
    loanNo: "LN-10293",
  };

  it("fills every placeholder in both languages", () => {
    for (const lang of ["hi", "en"] as const) {
      const text = renderReminder("BORROWER_BEFORE", lang, vars);
      expect(text).toContain("Company B");
      expect(text).toContain("₹26,700");
      expect(text).not.toMatch(/[{}]/);
    }
  });
});

describe("findBlockedWords", () => {
  it("blocks threats in English and Hindi", () => {
    expect(findBlockedWords("Pay now or we call the police")).toEqual(["police"]);
    expect(findBlockedWords("भुगतान करो नहीं तो जेल जाओगे")).toEqual(["जेल"]);
    expect(findBlockedWords("Legal action against YOUR FAMILY")).toEqual([
      "legal action",
      "your family",
    ]);
  });

  it("matches whole English words only", () => {
    expect(findBlockedWords("Our courteous team offers unbeatable service")).toEqual([]);
  });

  it("passes a polite reminder", () => {
    expect(findBlockedWords("Please pay by Friday. Thank you.")).toEqual([]);
  });

  it("every approved template passes its own filter", () => {
    for (const langs of Object.values(REMINDER_TEMPLATES)) {
      for (const text of Object.values(langs)) expect(findBlockedWords(text)).toEqual([]);
    }
  });
});

describe("applyPins", () => {
  const pin = (pins: Record<string, number>) => (x: string) => pins[x] ?? null;

  it("keeps the model's order when nothing is pinned", () => {
    expect(applyPins(["a", "b", "c"], pin({}))).toEqual(["a", "b", "c"]);
  });

  it("puts a pinned loan at its position, the rest keep their order", () => {
    expect(applyPins(["a", "b", "c", "d"], pin({ d: 1 }))).toEqual(["d", "a", "b", "c"]);
    expect(applyPins(["a", "b", "c", "d"], pin({ a: 3 }))).toEqual(["b", "c", "a", "d"]);
  });

  it("handles a position past the end, and several pins", () => {
    expect(applyPins(["a", "b"], pin({ a: 99 }))).toEqual(["b", "a"]);
    expect(applyPins(["a", "b", "c"], pin({ c: 1, b: 2 }))).toEqual(["c", "b", "a"]);
  });
});

describe("assignLoans: a manager's choice sticks", () => {
  it("keeps a manually assigned loan even if the officer doesn't cover its pincode", () => {
    const r = assignLoans(
      [{ loanId: "L1", pincode: "999999", currentOfficerId: "rahul", keepCurrent: true }],
      [{ officerId: "rahul", pincodes: ["452001"] }],
    );
    expect(r.assigned).toEqual([{ loanId: "L1", officerId: "rahul", kind: "KEPT" }]);
  });

  it("doesn't keep it with an officer who has left the scope", () => {
    const r = assignLoans(
      [{ loanId: "L1", pincode: "452001", currentOfficerId: "gone", keepCurrent: true }],
      [{ officerId: "rahul", pincodes: ["452001"] }],
    );
    expect(r.assigned[0]).toMatchObject({ officerId: "rahul", kind: "MOVED" });
  });
});
