import { randomUUID } from "node:crypto";
import type { ReminderDraft, ReminderSendResult } from "@kisht/contracts";
import {
  addDays,
  checkContact,
  checkDraft,
  chooseDraftTemplate,
  DRAFT_SITUATIONS,
  type DraftTemplate,
  fillPlaceholders,
  formatDay,
  formatRupees,
  fromDbDate,
  type IsoDay,
  istDayOf,
  istDayStart,
  REMINDER_TEMPLATES,
  type ReminderLang,
} from "@kisht/domain";
import type { AppContext } from "../../context.js";
import { HttpError, notFound } from "../../http/errors.js";
import type { AuthUser } from "../../http/guards.js";
import { audit } from "../audit/audit.js";
import { loanWhere, scopeOf } from "../auth/scope.js";

// Reminders an officer asks for (D31): drafted on one tap, sent only on another.
// Sending is mocked (D11) but ruled like a call: it needs an open contact
// window, counts towards the day's limit, and every try is recorded.

export type DraftInput = { template: string; lang: ReminderLang; situation: string };
/** Returns reworded text with the placeholders kept, or null if it has nothing usable. */
export type ReminderDrafter = (input: DraftInput) => Promise<string | null>;

type Wording = { text: string; source: "AI" | "TEMPLATE"; fallbackReason: string | null };

async function wordingFor(
  ctx: AppContext,
  template: DraftTemplate,
  lang: ReminderLang,
): Promise<Wording> {
  const approved = REMINDER_TEMPLATES[template][lang];
  const useApproved = (fallbackReason: string): Wording => ({
    text: approved,
    source: "TEMPLATE",
    fallbackReason,
  });
  if (!ctx.drafter) return useApproved("NO_DRAFTER");

  let text: string | null;
  try {
    text = await ctx.drafter({ template: approved, lang, situation: DRAFT_SITUATIONS[template] });
  } catch (err) {
    const status = (err as { status?: unknown }).status;
    return useApproved(`AI_ERROR:${typeof status === "number" ? status : (err as Error).name}`);
  }
  if (text === null) return useApproved("AI_NO_ANSWER");
  const problems = checkDraft(text, template, lang);
  return problems.length > 0
    ? useApproved(`CHECK_FAILED:${problems.join(",")}`)
    : { text, source: "AI", fallbackReason: null };
}

const toContract = (row: {
  id: string;
  lang: ReminderLang;
  source: "AI" | "TEMPLATE";
  body: string;
}): ReminderDraft => ({ id: row.id, lang: row.lang, source: row.source, body: row.body });

const dayRange = (day: IsoDay) => ({
  gte: istDayStart(day),
  lt: istDayStart(addDays(day, 1)),
});

export async function draftReminder(
  ctx: AppContext,
  user: AuthUser,
  loanId: string,
  requestedLang: ReminderLang | null,
): Promise<ReminderDraft> {
  const now = ctx.clock();
  const today = istDayOf(now);
  const loan = await ctx.prisma.loan.findFirst({
    where: { id: loanId, ...loanWhere(scopeOf(user)) },
    select: {
      loanNo: true,
      emiAmount: true,
      contactPaused: true,
      borrower: { select: { name: true, preferredLang: true } },
      promises: {
        where: { status: { not: "SUPERSEDED" } },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { status: true, dueDate: true, amount: true },
      },
    },
  });
  if (!loan) throw notFound("Loan");
  if (loan.contactPaused) throw new HttpError(409, "Contact is paused on this loan");

  const lang = requestedLang ?? loan.borrower.preferredLang;
  const row = loan.promises[0];
  const promise = row ? { status: row.status, dueDate: fromDbDate(row.dueDate) } : null;
  const template = chooseDraftTemplate(promise, today);

  // Asked again today, the officer gets the same AI wording without another call.
  // A fallback isn't kept: free models fail often, and the next try may well work.
  const existing = await ctx.prisma.reminderDraft.findFirst({
    where: {
      loanId,
      officerId: user.id,
      lang,
      template,
      source: "AI",
      sentAt: null,
      createdAt: dayRange(today),
    },
    orderBy: { createdAt: "desc" },
  });
  if (existing) return toContract(existing);

  const wording = await wordingFor(ctx, template, lang);
  const usesPromise = template !== "BORROWER_OVERDUE" && promise && row;
  const draft = await ctx.prisma.reminderDraft.create({
    data: {
      loanId,
      officerId: user.id,
      lang,
      template,
      source: wording.source,
      fallbackReason: wording.fallbackReason,
      createdAt: now,
      body: fillPlaceholders(wording.text, {
        borrowerName: loan.borrower.name,
        loanNo: loan.loanNo,
        amount: formatRupees(usesPromise ? row.amount : loan.emiAmount),
        date: formatDay(promise?.dueDate ?? today, lang),
      }),
    },
  });
  return toContract(draft);
}

export async function sendReminder(
  ctx: AppContext,
  user: AuthUser,
  draftId: string,
): Promise<ReminderSendResult> {
  const { prisma } = ctx;
  const now = ctx.clock();
  const draft = await prisma.reminderDraft.findFirst({
    where: { id: draftId, officerId: user.id, loan: loanWhere(scopeOf(user)) },
    select: {
      id: true,
      loanId: true,
      body: true,
      source: true,
      sentAt: true,
      createdAt: true,
      loan: { select: { contactPaused: true, borrower: { select: { phone: true } } } },
    },
  });
  if (!draft) throw notFound("Draft");
  if (draft.sentAt) return { status: "already_sent", reason: null };

  const today = istDayOf(now);
  // "Due today" must not go out tomorrow. The officer asks for a fresh draft.
  if (istDayOf(draft.createdAt) !== today) throw new HttpError(409, "This draft is out of date");

  const allowedAttemptsToday = await prisma.contactAttempt.count({
    where: { loanId: draft.loanId, allowed: true, correctedAt: dayRange(today) },
  });
  const block = checkContact({
    at: now,
    contactPaused: draft.loan.contactPaused,
    allowedAttemptsToday,
  });
  const attempt = {
    clientId: randomUUID(),
    loanId: draft.loanId,
    officerId: user.id,
    channel: "MESSAGE" as const,
    deviceAt: now,
    correctedAt: now,
    receivedAt: now,
    allowed: block === null,
    blockReason: block,
  };
  if (block) {
    await prisma.contactAttempt.create({ data: attempt });
    return { status: "blocked", reason: block };
  }

  return prisma.$transaction(async (tx) => {
    // A double tap claims nothing the second time.
    const claimed = await tx.reminderDraft.updateMany({
      where: { id: draft.id, sentAt: null },
      data: { sentAt: now },
    });
    if (claimed.count !== 1) return { status: "already_sent" as const, reason: null };
    await tx.contactAttempt.create({ data: attempt });
    await tx.messageLog.create({
      data: { channel: "SMS (mock)", to: draft.loan.borrower.phone, body: draft.body },
    });
    await audit(tx, {
      actorId: user.id,
      action: "reminder.send",
      entity: "loan",
      entityId: draft.loanId,
      meta: { draftId: draft.id, source: draft.source },
    });
    return { status: "sent" as const, reason: null };
  });
}
