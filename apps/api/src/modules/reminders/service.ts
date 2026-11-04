import type { Prisma } from "@kisht/db";
import {
  formatDay,
  formatRupees,
  fromDbDate,
  isContactAllowed,
  nextAllowedAt,
  planReminders,
  type ReminderLang,
  renderReminder,
} from "@kisht/domain";
import type { AppContext } from "../../context.js";

// Promise reminders, from approved templates only. Sending is mocked: a "sent"
// message lands in MessageLog (D11). Nothing goes to a borrower outside 8 am to
// 7 pm, or once the promise is settled or the loan is in dispute.

const BATCH = 200;

export async function scheduleReminders(
  tx: Prisma.TransactionClient,
  promiseId: string,
  madeAt: Date,
): Promise<void> {
  const promise = await tx.promiseToPay.findUniqueOrThrow({
    where: { id: promiseId },
    include: { loan: { include: { borrower: true } } },
  });
  const { borrower } = promise.loan;
  const dueDate = fromDbDate(promise.dueDate);
  const varsFor = (lang: ReminderLang) => ({
    borrowerName: borrower.name,
    amount: formatRupees(promise.amount),
    date: formatDay(dueDate, lang),
    loanNo: promise.loan.loanNo,
  });
  await tx.reminder.createMany({
    data: planReminders(dueDate, madeAt).map((r) => {
      const lang = r.recipient === "OFFICER" ? "hi" : borrower.preferredLang;
      return {
        promiseId,
        recipient: r.recipient,
        scheduledFor: r.at,
        body: renderReminder(r.template, lang, varsFor(lang)),
      };
    }),
  });
}

export type DispatchResult = { sent: number; deferred: number; cancelled: number };

/** Safe to run at any time, and twice at once: each reminder is claimed before it's sent. */
export async function dispatchReminders(ctx: AppContext): Promise<DispatchResult> {
  const { prisma } = ctx;
  const now = ctx.clock();
  const due = await prisma.reminder.findMany({
    where: { status: { in: ["QUEUED", "DEFERRED_WINDOW"] }, scheduledFor: { lte: now } },
    orderBy: { scheduledFor: "asc" },
    take: BATCH,
    include: {
      promise: {
        select: {
          status: true,
          loan: {
            select: {
              contactPaused: true,
              borrower: { select: { phone: true } },
              assignments: {
                where: { endedAt: null },
                select: { officer: { select: { name: true } } },
              },
            },
          },
        },
      },
    },
  });

  const result: DispatchResult = { sent: 0, deferred: 0, cancelled: 0 };
  for (const reminder of due) {
    const { status, loan } = reminder.promise;
    const open = { id: reminder.id, status: reminder.status };

    if (status !== "PENDING" || loan.contactPaused) {
      await prisma.reminder.updateMany({ where: open, data: { status: "CANCELLED" } });
      result.cancelled++;
      continue;
    }
    if (!isContactAllowed(now)) {
      await prisma.reminder.updateMany({
        where: open,
        data: { status: "DEFERRED_WINDOW", scheduledFor: nextAllowedAt(now) },
      });
      result.deferred++;
      continue;
    }
    await prisma.$transaction(async (tx) => {
      const claimed = await tx.reminder.updateMany({
        where: open,
        data: { status: "SENT_MOCK", sentAt: now },
      });
      if (claimed.count !== 1) return;
      await tx.messageLog.create({
        data: {
          channel: "SMS (mock)",
          to:
            reminder.recipient === "BORROWER"
              ? loan.borrower.phone
              : (loan.assignments[0]?.officer.name ?? "unassigned"),
          body: reminder.body,
          reminderId: reminder.id,
        },
      });
      result.sent++;
    });
  }
  return result;
}
