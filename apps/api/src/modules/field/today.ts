import type { TodayItem, TodayItemState, TodayList } from "@kisht/contracts";
import {
  fromDbDate,
  type IsoDay,
  isContactAllowed,
  istDayOf,
  maskPhone,
  nextAllowedAt,
} from "@kisht/domain";
import { compareByPriority } from "@kisht/domain/scoring";
import type { AppContext } from "../../context.js";
import type { AuthUser } from "../../http/guards.js";
import { loanWhere, scopeOf } from "../auth/scope.js";
import { toPriority, visiblePromise } from "./present.js";

export function contactState(now: Date) {
  return { allowed: isContactAllowed(now), nextAllowedAt: nextAllowedAt(now).toISOString() };
}

/** Which part of the day's list a loan belongs to. Order of checks matters. */
export function stateOf(input: {
  contactPaused: boolean;
  today: IsoDay;
  lastOutcomeDay: IsoDay | null;
  pendingDueDate: IsoDay | null;
}): TodayItemState {
  if (input.contactPaused) return "paused";
  if (input.lastOutcomeDay === input.today) return "done";
  // Not chased before the date the borrower gave (A19).
  if (input.pendingDueDate && input.pendingDueDate > input.today) return "waiting";
  return "todo";
}

const STATE_ORDER: Record<TodayItemState, number> = { todo: 0, waiting: 1, done: 2, paused: 3 };

export async function getTodayList(ctx: AppContext, user: AuthUser): Promise<TodayList> {
  const now = ctx.clock();
  const today = istDayOf(now);
  const { dailyCapacity } = await ctx.prisma.user.findUniqueOrThrow({
    where: { id: user.id },
    select: { dailyCapacity: true },
  });

  const loans = await ctx.prisma.loan.findMany({
    where: loanWhere(scopeOf(user)),
    include: {
      borrower: true,
      snapshots: { orderBy: { asOfDate: "desc" }, take: 1 },
      scores: { orderBy: { asOfDate: "desc" }, take: 1 },
      promises: {
        where: { status: { not: "SUPERSEDED" } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      outcomes: { orderBy: { correctedAt: "desc" }, take: 1 },
    },
  });

  const items = loans.flatMap((loan): TodayItem[] => {
    const snapshot = loan.snapshots[0];
    if (!snapshot) return [];
    const outcome = loan.outcomes[0];
    const promise = loan.promises[0];
    const score = loan.scores[0];
    return [
      {
        loanId: loan.id,
        loanNo: loan.loanNo,
        borrowerName: loan.borrower.name,
        businessType: loan.borrower.businessType,
        phone: loan.borrower.phone,
        phoneMasked: maskPhone(loan.borrower.phone),
        address: loan.borrower.address,
        lat: loan.borrower.lat,
        lng: loan.borrower.lng,
        dpd: snapshot.dpd,
        outstanding: snapshot.outstanding,
        emiAmount: loan.emiAmount,
        priority: score ? toPriority(score) : null,
        state: stateOf({
          contactPaused: loan.contactPaused,
          today,
          lastOutcomeDay: outcome ? istDayOf(outcome.correctedAt) : null,
          pendingDueDate: promise?.status === "PENDING" ? fromDbDate(promise.dueDate) : null,
        }),
        promise: promise ? visiblePromise(promise, today) : null,
        lastOutcome: outcome ? { type: outcome.type, at: outcome.correctedAt.toISOString() } : null,
      },
    ];
  });

  items.sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      compareByPriority(
        { dpd: a.dpd, expectedLoss: a.priority?.expectedLoss ?? 0 },
        { dpd: b.dpd, expectedLoss: b.priority?.expectedLoss ?? 0 },
      ),
  );

  // The cap is on what's left to do today; everything else stays visible (A3).
  let todoShown = 0;
  let beyondCapacity = 0;
  const visible = items.filter((item) => {
    if (item.state !== "todo") return true;
    if (todoShown < dailyCapacity) {
      todoShown++;
      return true;
    }
    beyondCapacity++;
    return false;
  });

  const newest = loans.flatMap((l) => l.snapshots).map((s) => fromDbDate(s.asOfDate));
  return {
    asOfDate: newest.length > 0 ? (newest.sort().at(-1) ?? null) : null,
    serverTime: now.toISOString(),
    contact: contactState(now),
    capacity: dailyCapacity,
    beyondCapacity,
    items: visible,
  };
}
