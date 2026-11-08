import type { TodayItem, TodayItemState, TodayList } from "@kisht/contracts";
import {
  applyPins,
  fromDbDate,
  type IsoDay,
  istDayOf,
  istDayStart,
  listChanges,
  maskPhone,
  NO_CHANGES,
  type SnapshotFacts,
  toDbDate,
} from "@kisht/domain";
import { compareByPriority } from "@kisht/domain/scoring";
import type { AppContext } from "../../context.js";
import type { AuthUser } from "../../http/guards.js";
import { loanWhere, scopeOf } from "../auth/scope.js";
import { toHistory, toPriority, visiblePromise } from "./present.js";

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

const HISTORY_LENGTH = 6;

const STATE_ORDER: Record<TodayItemState, number> = { todo: 0, waiting: 1, done: 2, paused: 3 };

type Listable = { state: TodayItemState; dpd: number };

/**
 * The one definition of an officer's order, used by their list and the
 * manager's board: state first, the model within it, then a manager's pins on
 * what's left to do.
 */
export function orderList<T extends Listable>(
  items: readonly T[],
  pinOf: (item: T) => number | null,
  rupeesOf: (item: T) => number = (i) =>
    (i as T & { priority?: { expectedLoss: number } | null }).priority?.expectedLoss ?? 0,
): T[] {
  const sorted = [...items].sort(
    (a, b) =>
      STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
      compareByPriority(
        { dpd: a.dpd, expectedLoss: rupeesOf(a) },
        { dpd: b.dpd, expectedLoss: rupeesOf(b) },
      ),
  );
  const todo = sorted.filter((i) => i.state === "todo");
  return [...applyPins(todo, pinOf), ...sorted.filter((i) => i.state !== "todo")];
}

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
      // The latest two, to say what changed since the previous list (A32).
      snapshots: { orderBy: { asOfDate: "desc" }, take: 2 },
      assignments: {
        where: { endedAt: null },
        take: 1,
        select: { startedAt: true, source: true },
      },
      scores: { orderBy: { asOfDate: "desc" }, take: 1 },
      promises: {
        where: { status: { not: "SUPERSEDED" } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      outcomes: {
        orderBy: { correctedAt: "desc" },
        take: HISTORY_LENGTH,
        include: { officer: { select: { name: true } } },
      },
      overrides: {
        where: { officerId: user.id, date: toDbDate(today) },
        select: { position: true, reason: true },
      },
      contactAttempts: {
        where: {
          officerId: user.id,
          allowed: true,
          // A sent message isn't a conversation, so it opens nothing to log against.
          channel: { not: "MESSAGE" },
          correctedAt: { gte: istDayStart(today) },
          outcomes: { none: {} },
        },
        orderBy: { correctedAt: "desc" },
        take: 1,
        select: { clientId: true },
      },
      _count: {
        select: {
          contactAttempts: { where: { allowed: true, correctedAt: { gte: istDayStart(today) } } },
        },
      },
    },
  });

  const listDays = [
    ...new Set(loans.flatMap((l) => l.snapshots.map((s) => fromDbDate(s.asOfDate)))),
  ].sort((a, b) => (a < b ? 1 : -1));
  const [latestListDay = null, previousListDay = null] = listDays;
  const facts = (s: {
    asOfDate: Date;
    lastPaymentDate: Date | null;
    lastPaymentAmount: number | null;
  }): SnapshotFacts => ({
    asOfDate: fromDbDate(s.asOfDate),
    lastPaymentDate: s.lastPaymentDate ? fromDbDate(s.lastPaymentDate) : null,
    lastPaymentAmount: s.lastPaymentAmount,
  });

  const items = loans.flatMap((loan): TodayItem[] => {
    const snapshot = loan.snapshots[0];
    if (!snapshot) return [];
    const previous = loan.snapshots[1];
    const assignment = loan.assignments[0];
    const changes =
      fromDbDate(snapshot.asOfDate) === latestListDay
        ? listChanges({
            latest: facts(snapshot),
            previous: previous ? facts(previous) : null,
            previousListDay,
            assignment: assignment
              ? { startedOn: istDayOf(assignment.startedAt), source: assignment.source }
              : null,
          })
        : NO_CHANGES;
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
        contactPaused: loan.contactPaused,
        attemptsToday: loan._count.contactAttempts,
        promise: promise ? visiblePromise(promise, today) : null,
        lastOutcome: outcome ? { type: outcome.type, at: outcome.correctedAt.toISOString() } : null,
        managerNote: loan.overrides[0]?.reason ?? null,
        openAttemptClientId: loan.contactAttempts[0]?.clientId ?? null,
        history: loan.outcomes.map(toHistory),
        changes,
      },
    ];
  });

  const position = new Map(
    loans.flatMap((l) => (l.overrides[0] ? [[l.id, l.overrides[0].position] as const] : [])),
  );
  const ordered = orderList(items, (i) => position.get(i.loanId) ?? null);

  // The cap is on what's left to do today; everything else stays visible (A3).
  let todoShown = 0;
  let beyondCapacity = 0;
  const visible = ordered.filter((item) => {
    if (item.state !== "todo") return true;
    if (todoShown < dailyCapacity) {
      todoShown++;
      return true;
    }
    beyondCapacity++;
    return false;
  });

  return {
    asOfDate: latestListDay,
    serverTime: now.toISOString(),
    beyondCapacity,
    items: visible,
  };
}
