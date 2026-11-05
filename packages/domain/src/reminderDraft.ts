import type { IsoDay } from "./dates.ts";
import { REMINDER_TEMPLATES, type ReminderLang, type ReminderTemplate } from "./reminders.ts";
import { findBlockedWords } from "./wordFilter.ts";

// AI-drafted reminders (D31). The AI rewords an approved template; it only ever
// sees placeholders, never a borrower's details. Whatever it returns must pass
// every check here, or the officer gets the approved template itself.

export type DraftTemplate = Extract<
  ReminderTemplate,
  "BORROWER_BEFORE" | "BORROWER_DUE" | "BORROWER_MISSED" | "BORROWER_OVERDUE"
>;

type PromiseState = { status: string; dueDate: IsoDay };

/** The approved template that fits the loan's latest promise, if it has one. */
export function chooseDraftTemplate(promise: PromiseState | null, today: IsoDay): DraftTemplate {
  if (promise?.status === "BROKEN") return "BORROWER_MISSED";
  if (promise?.status !== "PENDING") return "BORROWER_OVERDUE";
  if (promise.dueDate > today) return "BORROWER_BEFORE";
  return promise.dueDate === today ? "BORROWER_DUE" : "BORROWER_MISSED";
}

export const DRAFT_SITUATIONS: Record<DraftTemplate, string> = {
  BORROWER_BEFORE: "The borrower promised to pay soon. The date has not arrived yet.",
  BORROWER_DUE: "The borrower promised to pay today.",
  BORROWER_MISSED: "The promised date has passed and the payment has not been seen.",
  BORROWER_OVERDUE: "An instalment is overdue and no payment date is agreed.",
};

export type DraftProblem =
  | "EMPTY"
  | "TOO_LONG"
  | "BLOCKED_WORD"
  | "PLACEHOLDERS"
  | "INVENTED_NUMBER"
  | "LINK"
  | "WRONG_LANGUAGE";

export const MAX_DRAFT_LENGTH = 320;

const PLACEHOLDER = /\{(\w+)\}/g;
const DEVANAGARI_LETTER = /[ऄ-ह]/;

const placeholdersOf = (text: string) =>
  [...text.matchAll(PLACEHOLDER)].map((match) => match[1]).sort();

/**
 * Everything wrong with a draft; empty means it may be shown to the officer.
 * Runs on the text with its placeholders, so a borrower named "Court Road
 * Traders" can't trip the word filter, and an amount the AI made up is caught.
 */
export function checkDraft(
  text: string,
  template: DraftTemplate,
  lang: ReminderLang,
): DraftProblem[] {
  const problems: DraftProblem[] = [];
  if (!text.trim()) problems.push("EMPTY");
  if (text.length > MAX_DRAFT_LENGTH) problems.push("TOO_LONG");
  if (findBlockedWords(text).length > 0) problems.push("BLOCKED_WORD");

  const wanted = placeholdersOf(REMINDER_TEMPLATES[template][lang]);
  const found = placeholdersOf(text);
  const withoutPlaceholders = text.replace(PLACEHOLDER, "");
  if (wanted.join() !== found.join() || /[{}]/.test(withoutPlaceholders)) {
    problems.push("PLACEHOLDERS");
  }
  if (/[0-9०-९₹]/.test(withoutPlaceholders)) problems.push("INVENTED_NUMBER");
  if (/https?:|www\.|@|\.(com|in|org|net)\b/i.test(withoutPlaceholders)) problems.push("LINK");
  if (DEVANAGARI_LETTER.test(withoutPlaceholders) !== (lang === "hi")) {
    problems.push("WRONG_LANGUAGE");
  }
  return problems;
}
