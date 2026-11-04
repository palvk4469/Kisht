import type { Prisma } from "@kisht/db";
import { addDays, fromDbDate, type IsoDay, istDayOf, toDbDate } from "@kisht/domain";
import { CURRENT_MODEL, factsAt, type LoanEvents, scoreLoan } from "@kisht/domain/scoring";

const LOOKBACK_DAYS = 90;

/**
 * Scores the given loans for one day from what the database knows as of that
 * day, replacing any earlier score for the same day (a re-upload). Advisory:
 * managers can reorder lists, and the score never blocks anything.
 */
export async function scoreLoans(
  tx: Prisma.TransactionClient,
  loanIds: readonly string[],
  day: IsoDay,
): Promise<number> {
  if (loanIds.length === 0) return 0;
  const since = toDbDate(addDays(day, -LOOKBACK_DAYS - 1));
  const loans = await tx.loan.findMany({
    where: { id: { in: [...loanIds] } },
    select: {
      id: true,
      snapshots: {
        where: { asOfDate: { gte: since, lte: toDbDate(day) } },
        select: { asOfDate: true, dpd: true, outstanding: true, lastPaymentDate: true },
      },
      promises: {
        where: { status: { not: "SUPERSEDED" } },
        select: { createdAt: true, dueDate: true, status: true, resolvedAt: true },
      },
      outcomes: { select: { correctedAt: true, type: true } },
    },
  });

  const rows: Prisma.PriorityScoreCreateManyInput[] = [];
  for (const loan of loans) {
    const events: LoanEvents = {
      snapshots: loan.snapshots.map((s) => ({
        asOfDate: fromDbDate(s.asOfDate),
        dpd: s.dpd,
        outstanding: s.outstanding,
        lastPaymentDate: s.lastPaymentDate ? fromDbDate(s.lastPaymentDate) : null,
      })),
      promises: loan.promises.map((p) => ({
        madeOn: istDayOf(p.createdAt),
        dueDate: fromDbDate(p.dueDate),
        status: p.status,
        resolvedOn: p.resolvedAt ? istDayOf(p.resolvedAt) : null,
      })),
      outcomes: loan.outcomes.map((o) => ({ day: istDayOf(o.correctedAt), type: o.type })),
    };
    const facts = factsAt(events, day);
    if (!facts) continue;
    const score = scoreLoan(CURRENT_MODEL, facts);
    rows.push({
      loanId: loan.id,
      asOfDate: toDbDate(day),
      modelVersion: score.modelVersion,
      probability: score.probability,
      expectedLoss: score.expectedLoss,
      reasons: score.reasons as unknown as Prisma.InputJsonValue,
      limitedHistory: score.limitedHistory,
    });
  }

  await tx.priorityScore.deleteMany({
    where: {
      loanId: { in: [...loanIds] },
      asOfDate: toDbDate(day),
      modelVersion: CURRENT_MODEL.version,
    },
  });
  await tx.priorityScore.createMany({ data: rows });
  return rows.length;
}
