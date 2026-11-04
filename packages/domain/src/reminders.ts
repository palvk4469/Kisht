import { addDays, type IsoDay, istDayOf, istDayStart } from "./dates.ts";

// Promise-to-pay reminders. Only approved templates are ever used, so the
// wording is fixed, polite and reviewable; the dispatcher still holds anything
// due outside 8 am–7 pm until the window opens.

export type ReminderRecipient = "BORROWER" | "OFFICER";
export type ReminderTemplate = "BORROWER_BEFORE" | "BORROWER_DUE" | "OFFICER_DUE";
export type ReminderLang = "hi" | "en";

export type PlannedReminder = {
  recipient: ReminderRecipient;
  template: ReminderTemplate;
  at: Date;
};

const HOUR_MS = 60 * 60 * 1000;
const atHour = (day: IsoDay, hour: number) => new Date(istDayStart(day).getTime() + hour * HOUR_MS);

/** Evening before is off-limits, so: 10 am the day before, then the morning it's due. */
export function planReminders(dueDate: IsoDay, madeAt: Date): PlannedReminder[] {
  const plan: PlannedReminder[] = [
    { recipient: "BORROWER", template: "BORROWER_BEFORE", at: atHour(addDays(dueDate, -1), 10) },
    { recipient: "OFFICER", template: "OFFICER_DUE", at: atHour(dueDate, 8.5) },
    { recipient: "BORROWER", template: "BORROWER_DUE", at: atHour(dueDate, 9) },
  ];
  return plan.filter((r) => r.at > madeAt && istDayOf(r.at) >= istDayOf(madeAt));
}

type Vars = { borrowerName: string; amount: string; date: string; loanNo: string };

export const REMINDER_TEMPLATES: Record<ReminderTemplate, Record<ReminderLang, string>> = {
  BORROWER_BEFORE: {
    hi: "नमस्ते {borrowerName}, आपने {date} को {amount} के भुगतान का वादा किया है (लोन {loanNo})। कोई समस्या हो तो कृपया अपने अधिकारी से बात करें। धन्यवाद।",
    en: "Hello {borrowerName}, you agreed to pay {amount} on {date} (loan {loanNo}). If anything has changed, please speak to your officer. Thank you.",
  },
  BORROWER_DUE: {
    hi: "नमस्ते {borrowerName}, लोन {loanNo} के {amount} के भुगतान की तारीख आज है। यदि भुगतान हो चुका है तो कृपया इस संदेश को अनदेखा करें। धन्यवाद।",
    en: "Hello {borrowerName}, your payment of {amount} on loan {loanNo} is due today. If you have already paid, please ignore this message. Thank you.",
  },
  OFFICER_DUE: {
    hi: "आज का वादा: {borrowerName}, लोन {loanNo}, {amount}।",
    en: "Promise due today: {borrowerName}, loan {loanNo}, {amount}.",
  },
};

export function renderReminder(template: ReminderTemplate, lang: ReminderLang, vars: Vars): string {
  return REMINDER_TEMPLATES[template][lang].replace(
    /\{(\w+)\}/g,
    (_, key: keyof Vars) => vars[key],
  );
}

export function formatRupees(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** "7 Nov" or "7 नव॰". Never an ISO date in a message a person reads. */
export function formatDay(day: IsoDay, lang: ReminderLang): string {
  return new Intl.DateTimeFormat(lang === "hi" ? "hi-IN" : "en-IN", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(new Date(`${day}T00:00:00Z`));
}
