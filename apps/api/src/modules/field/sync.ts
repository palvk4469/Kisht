import type {
  AttemptEvent,
  OutcomeEvent,
  SyncItemResult,
  SyncRequest,
  SyncResponse,
} from "@kisht/contracts";
import {
  addDays,
  checkContact,
  correctedTime,
  type IsoDay,
  isIsoDay,
  isTooOld,
  istDayOf,
  istDayStart,
  toDbDate,
} from "@kisht/domain";
import type { AppContext } from "../../context.js";
import type { AuthUser } from "../../http/guards.js";
import { audit } from "../audit/audit.js";
import { scheduleReminders } from "../reminders/service.js";

// Field events arriving from the phone, possibly hours late (D7, D9).
// Everything is judged by when it happened, corrected for the phone's clock,
// and by the server: the phone's own idea of the window is only a courtesy.
// Each event is keyed by the phone's UUID, so retries change nothing. The early
// lookups only save work: retries arriving together can all pass them, so the
// inserts skip conflicts and the database decides which one recorded the event.

const PROMISE_MAX_DAYS_AHEAD = 30;

export async function syncEvents(
  ctx: AppContext,
  user: AuthUser,
  batch: SyncRequest,
): Promise<SyncResponse> {
  const now = ctx.clock();
  const sentAt = new Date(batch.sentAt);
  const when = (at: string) => correctedTime(new Date(at), sentAt, now);
  const byTime = <T extends { at: string }>(events: readonly T[]) =>
    [...events].sort((a, b) => a.at.localeCompare(b.at));

  // Attempts first: outcomes in the same batch refer to them.
  const attempts: SyncItemResult[] = [];
  for (const event of byTime(batch.attempts)) {
    attempts.push(await recordAttempt(ctx, user, event, when(event.at), now));
  }
  const outcomes: SyncItemResult[] = [];
  for (const event of byTime(batch.outcomes)) {
    outcomes.push(await recordOutcome(ctx, user, event, when(event.at), now));
  }
  return { serverTime: now.toISOString(), attempts, outcomes };
}

const rejected = (clientId: string, reason: SyncItemResult["reason"]): SyncItemResult => ({
  clientId,
  status: "rejected",
  reason,
});

async function recordAttempt(
  ctx: AppContext,
  user: AuthUser,
  e: AttemptEvent,
  at: Date,
  now: Date,
): Promise<SyncItemResult> {
  const { prisma } = ctx;
  const seen = await prisma.contactAttempt.findUnique({ where: { clientId: e.clientId } });
  if (seen) return { clientId: e.clientId, status: "duplicate", reason: null };
  if (isTooOld(at, now)) return rejected(e.clientId, "TOO_OLD");

  // Assigned at any time: the loan may have moved while the phone was offline,
  // and what happened in the field still happened.
  const assigned = await prisma.assignment.findFirst({
    where: { loanId: e.loanId, officerId: user.id },
    select: { loan: { select: { contactPaused: true } } },
  });
  if (!assigned) return rejected(e.clientId, "NOT_ASSIGNED");

  const dayStart = istDayStart(istDayOf(at));
  const allowedAttemptsToday = await prisma.contactAttempt.count({
    where: {
      loanId: e.loanId,
      allowed: true,
      correctedAt: { gte: dayStart, lt: istDayStart(addDays(istDayOf(at), 1)) },
    },
  });
  const block = checkContact({
    at,
    contactPaused: assigned.loan.contactPaused,
    allowedAttemptsToday,
  });

  const { count } = await prisma.contactAttempt.createMany({
    skipDuplicates: true,
    data: {
      clientId: e.clientId,
      loanId: e.loanId,
      officerId: user.id,
      channel: e.channel,
      deviceAt: new Date(e.at),
      correctedAt: at,
      receivedAt: now,
      lat: e.lat,
      lng: e.lng,
      accuracyM: e.accuracyM,
      allowed: block === null,
      blockReason: block,
    },
  });
  if (count === 0) return { clientId: e.clientId, status: "duplicate", reason: null };
  return block
    ? { clientId: e.clientId, status: "blocked", reason: block }
    : { clientId: e.clientId, status: "recorded", reason: null };
}

function validPromiseDate(due: IsoDay, day: IsoDay): boolean {
  return isIsoDay(due) && due >= day && due <= addDays(day, PROMISE_MAX_DAYS_AHEAD);
}

async function recordOutcome(
  ctx: AppContext,
  user: AuthUser,
  e: OutcomeEvent,
  at: Date,
  now: Date,
): Promise<SyncItemResult> {
  const { prisma } = ctx;
  const seen = await prisma.outcome.findUnique({ where: { clientId: e.clientId } });
  if (seen) return { clientId: e.clientId, status: "duplicate", reason: null };
  if (isTooOld(at, now)) return rejected(e.clientId, "TOO_OLD");

  // An outcome stands only on an in-window attempt: a call at 18:50 can be
  // logged at 21:00, but nothing can be logged for a contact that was blocked.
  const attempt = await prisma.contactAttempt.findUnique({
    where: { clientId: e.attemptClientId },
  });
  if (!attempt || attempt.officerId !== user.id || attempt.loanId !== e.loanId) {
    return rejected(e.clientId, "ATTEMPT_NOT_FOUND");
  }
  if (!attempt.allowed) return rejected(e.clientId, "ATTEMPT_BLOCKED");
  if (e.type === "PROMISE" && !validPromiseDate(e.promiseDueDate ?? "", istDayOf(at))) {
    return rejected(e.clientId, "BAD_PROMISE_DATE");
  }

  const recorded = await prisma.$transaction(async (tx) => {
    const loan = await tx.loan.findUniqueOrThrow({
      where: { id: e.loanId },
      select: { emiAmount: true },
    });
    const amount = e.type === "PROMISE" ? (e.amount ?? loan.emiAmount) : e.amount;
    const [outcome] = await tx.outcome.createManyAndReturn({
      skipDuplicates: true,
      data: {
        clientId: e.clientId,
        loanId: e.loanId,
        officerId: user.id,
        attemptId: attempt.id,
        type: e.type,
        amount,
        note: e.note,
        deviceAt: new Date(e.at),
        correctedAt: at,
        receivedAt: now,
        lat: e.lat,
        lng: e.lng,
        accuracyM: e.accuracyM,
      },
    });
    if (!outcome) return false;
    if (e.type === "PROMISE") {
      // A new promise replaces any open one (one pending per loan).
      await tx.promiseToPay.updateMany({
        where: { loanId: e.loanId, status: "PENDING" },
        data: { status: "SUPERSEDED", resolvedAt: now },
      });
      const promise = await tx.promiseToPay.create({
        data: {
          loanId: e.loanId,
          outcomeId: outcome.id,
          dueDate: toDbDate(e.promiseDueDate as IsoDay),
          amount: amount as number,
          createdAt: at,
        },
      });
      await scheduleReminders(tx, promise.id, at);
    }
    if (e.type === "DISPUTE") {
      // Contact stops until a manager reviews it (A12).
      await tx.loan.update({ where: { id: e.loanId }, data: { contactPaused: true } });
      await audit(tx, {
        actorId: user.id,
        action: "loan.dispute",
        entity: "loan",
        entityId: e.loanId,
        meta: { outcomeId: outcome.id, note: e.note },
      });
    }
    return true;
  });
  return { clientId: e.clientId, status: recorded ? "recorded" : "duplicate", reason: null };
}
