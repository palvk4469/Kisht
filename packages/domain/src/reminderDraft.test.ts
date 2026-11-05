import { describe, expect, it } from "vitest";
import { checkDraft, chooseDraftTemplate, type DraftTemplate } from "./reminderDraft.ts";
import { fillPlaceholders, REMINDER_TEMPLATES } from "./reminders.ts";

const TODAY = "2026-11-05";
const GOOD_EN =
  "Hello {borrowerName}, a quick note that {amount} on loan {loanNo} is overdue. Please speak to your officer to agree a date. Thank you.";
const GOOD_HI = "नमस्ते {borrowerName}, लोन {loanNo} पर {amount} बकाया है। कृपया अपने अधिकारी से बात करें।";
const overdue = (text: string, lang: "hi" | "en" = "en") =>
  checkDraft(text, "BORROWER_OVERDUE", lang);

describe("chooseDraftTemplate", () => {
  it.each([
    [{ status: "PENDING", dueDate: "2026-11-06" }, "BORROWER_BEFORE"],
    [{ status: "PENDING", dueDate: TODAY }, "BORROWER_DUE"],
    [{ status: "PENDING", dueDate: "2026-11-04" }, "BORROWER_MISSED"],
    [{ status: "BROKEN", dueDate: "2026-10-31" }, "BORROWER_MISSED"],
    [{ status: "KEPT", dueDate: "2026-10-31" }, "BORROWER_OVERDUE"],
    [{ status: "PARTIAL", dueDate: "2026-10-31" }, "BORROWER_OVERDUE"],
    [null, "BORROWER_OVERDUE"],
  ])("%j gets %s", (promise, template) => {
    expect(chooseDraftTemplate(promise, TODAY)).toBe(template);
  });
});

describe("checkDraft", () => {
  it("passes a respectful rewording in either language", () => {
    expect(overdue(GOOD_EN)).toEqual([]);
    expect(overdue(GOOD_HI, "hi")).toEqual([]);
  });

  it("passes every approved template as written", () => {
    const templates: DraftTemplate[] = [
      "BORROWER_BEFORE",
      "BORROWER_DUE",
      "BORROWER_MISSED",
      "BORROWER_OVERDUE",
    ];
    for (const template of templates) {
      for (const lang of ["hi", "en"] as const) {
        expect(checkDraft(REMINDER_TEMPLATES[template][lang], template, lang)).toEqual([]);
      }
    }
  });

  it.each([
    ["threats", `${GOOD_EN} Or we will send the police.`, "BLOCKED_WORD"],
    ["consequences", `${GOOD_EN} There will be consequences.`, "BLOCKED_WORD"],
    ["a dropped placeholder", "Hello {borrowerName}, please pay {amount} soon.", "PLACEHOLDERS"],
    ["a made-up placeholder", `${GOOD_EN} {officerPhone}`, "PLACEHOLDERS"],
    ["a repeated placeholder", `${GOOD_EN} {amount}`, "PLACEHOLDERS"],
    ["a broken placeholder", `${GOOD_EN} {amount`, "PLACEHOLDERS"],
    ["an invented amount", `${GOOD_EN} Pay ₹500 extra.`, "INVENTED_NUMBER"],
    ["an invented date", `${GOOD_EN} Pay by the 9th.`, "INVENTED_NUMBER"],
    ["a link", `${GOOD_EN} Pay at www.pay-now.example.`, "LINK"],
    ["Hindi in an English draft", `${GOOD_EN} धन्यवाद`, "WRONG_LANGUAGE"],
    ["too much", `${GOOD_EN} ${"Please. ".repeat(40)}`, "TOO_LONG"],
    ["nothing", "   ", "EMPTY"],
  ])("rejects %s", (_, text, problem) => {
    expect(overdue(text)).toContain(problem);
  });

  it("rejects Hindi threats and Devanagari numbers", () => {
    expect(overdue(`${GOOD_HI} नहीं तो पुलिस आएगी।`, "hi")).toContain("BLOCKED_WORD");
    expect(overdue(`${GOOD_HI} ५०० रुपये।`, "hi")).toContain("INVENTED_NUMBER");
  });

  it("rejects English where Hindi was asked for", () => {
    expect(overdue(GOOD_EN, "hi")).toContain("WRONG_LANGUAGE");
  });

  it("isn't tripped by what fills the placeholders", () => {
    expect(overdue(GOOD_EN)).toEqual([]);
    expect(
      fillPlaceholders(GOOD_EN, {
        borrowerName: "Court Road Traders",
        amount: "₹5,000",
        date: "7 Nov",
        loanNo: "LN-1",
      }),
    ).toContain("Court Road Traders");
  });
});
