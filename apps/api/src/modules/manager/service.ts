import type {
  BoardDispute,
  BoardLoan,
  ManagerBoard,
  MoveLoanBody,
  PromiseFilter,
  PromiseTracker,
  Reason,
  ReassignBody,
} from "@kisht/contracts";
import type { Prisma } from "@kisht/db";
import { addDays, fromDbDate, istDayOf, istDayStart, toDbDate } from "@kisht/domain";
import type { AppContext } from "../../context.js";
import { HttpError, notFound } from "../../http/errors.js";
import type { AuthUser } from "../../http/guards.js";
import { audit } from "../audit/audit.js";
import { loanWhere, type ManagerScope, managerScope, officerWhere } from "../auth/scope.js";
import { visiblePromise } from "../field/present.js";
import { orderList, stateOf } from "../field/today.js";

async function latestListDay(ctx: AppContext, scope: ManagerScope) {
  const row = await ctx.prisma.loanSnapshot.aggregate({
    where: { loan: loanWhere(scope) },
    _max: { asOfDate: true },
  });
  return row._max.asOfDate;
}

export async function getBoard(ctx: AppContext, user: AuthUser): Promise<ManagerBoard> {
  const scope = managerScope(user);
  const today = istDayOf(ctx.clock());
  const latest = await latestListDay(ctx, scope);
  const officers = await ctx.prisma.user.findMany({
    where: officerWhere(scope),
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      dailyCapacity: true,
      pincodes: { select: { pincode: true }, orderBy: { pincode: "asc" } },
    },
  });
  if (!latest) {
    return {
      asOfDate: null,
      officers: officers.map((o) => ({
        id: o.id,
        name: o.name,
        pincodes: o.pincodes.map((p) => p.pincode),
        capacity: o.dailyCapacity,
        loans: [],
      })),
      unassigned: [],
      disputes: [],
    };
  }

  const loans = await ctx.prisma.loan.findMany({
    where: { AND: [loanWhere(scope), { snapshots: { some: { asOfDate: latest } } }] },
    include: {
      borrower: { select: { name: true, pincode: true } },
      snapshots: { where: { asOfDate: latest }, take: 1 },
      scores: { where: { asOfDate: latest }, take: 1 },
      promises: {
        where: { status: { not: "SUPERSEDED" } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      outcomes: { orderBy: { correctedAt: "desc" }, take: 1 },
      assignments: {
        where: { endedAt: null },
        select: { officerId: true, officer: { select: { name: true } } },
      },
      overrides: {
        where: { date: toDbDate(today) },
        select: { officerId: true, position: true, reason: true },
      },
    },
  });

  type Row = BoardLoan & { officerId: string | null; officerName: string | null };
  const rows: Row[] = loans.map((loan) => {
    const snapshot = loan.snapshots[0];
    const promise = loan.promises[0];
    const outcome = loan.outcomes[0];
    const score = loan.scores[0];
    const assignment = loan.assignments[0];
    const pin = loan.overrides.find((o) => o.officerId === assignment?.officerId);
    return {
      loanId: loan.id,
      loanNo: loan.loanNo,
      borrowerName: loan.borrower.name,
      pincode: loan.borrower.pincode,
      dpd: snapshot?.dpd ?? 0,
      outstanding: snapshot?.outstanding ?? 0,
      expectedLoss: score?.expectedLoss ?? null,
      topReason: ((score?.reasons as Reason[] | undefined)?.[0] ?? null) as Reason | null,
      state: stateOf({
        contactPaused: loan.contactPaused,
        today,
        lastOutcomeDay: outcome ? istDayOf(outcome.correctedAt) : null,
        pendingDueDate: promise?.status === "PENDING" ? fromDbDate(promise.dueDate) : null,
      }),
      promise: promise ? visiblePromise(promise, today) : null,
      pin: pin ? { position: pin.position, reason: pin.reason } : null,
      officerId: assignment?.officerId ?? null,
      officerName: assignment?.officer.name ?? null,
    };
  });

  const strip = ({ officerId: _id, officerName: _name, ...loan }: Row): BoardLoan => ({
    ...loan,
    topReason: loan.topReason ? { code: loan.topReason.code, value: loan.topReason.value } : null,
  });
  const order = (list: Row[]) =>
    orderList(
      list,
      (r) => r.pin?.position ?? null,
      (r) => r.expectedLoss ?? 0,
    ).map(strip);

  const pausedLoans = new Map(loans.map((l) => [l.id, l]));
  const disputes: BoardDispute[] = rows
    .filter((r) => r.state === "paused")
    .map((r) => {
      const outcome = pausedLoans.get(r.loanId)?.outcomes[0];
      return {
        ...strip(r),
        officerName: r.officerName,
        note: outcome?.note ?? null,
        raisedAt: outcome?.correctedAt.toISOString() ?? null,
      };
    });

  return {
    asOfDate: fromDbDate(latest),
    officers: officers.map((o) => ({
      id: o.id,
      name: o.name,
      pincodes: o.pincodes.map((p) => p.pincode),
      capacity: o.dailyCapacity,
      loans: order(rows.filter((r) => r.officerId === o.id)),
    })),
    unassigned: order(rows.filter((r) => r.officerId === null)),
    disputes,
  };
}

/** The current officer's hold on a loan inside this manager's scope; 404 otherwise. */
async function requireHeldLoan(
  ctx: AppContext,
  scope: ManagerScope,
  loanId: string,
  officerId: string,
) {
  const loan = await ctx.prisma.loan.findFirst({
    where: {
      AND: [
        { id: loanId },
        loanWhere(scope),
        { assignments: { some: { officerId, endedAt: null } } },
      ],
    },
    select: { id: true },
  });
  if (!loan) throw notFound("Loan");
}

export async function moveLoan(
  ctx: AppContext,
  user: AuthUser,
  officerId: string,
  body: MoveLoanBody,
) {
  const scope = managerScope(user);
  await requireHeldLoan(ctx, scope, body.loanId, officerId);
  const date = toDbDate(istDayOf(ctx.clock()));
  await ctx.prisma.$transaction(async (tx) => {
    await tx.listOverride.upsert({
      where: { officerId_date_loanId: { officerId, date, loanId: body.loanId } },
      create: {
        managerId: user.id,
        officerId,
        loanId: body.loanId,
        date,
        position: body.position,
        reason: body.reason,
      },
      update: { managerId: user.id, position: body.position, reason: body.reason },
    });
    await audit(tx, {
      actorId: user.id,
      action: "list.move",
      entity: "loan",
      entityId: body.loanId,
      meta: { officerId, position: body.position, reason: body.reason },
    });
  });
  return { ok: true as const };
}

export async function clearPin(ctx: AppContext, user: AuthUser, officerId: string, loanId: string) {
  const scope = managerScope(user);
  await requireHeldLoan(ctx, scope, loanId, officerId);
  const date = toDbDate(istDayOf(ctx.clock()));
  await ctx.prisma.$transaction(async (tx) => {
    await tx.listOverride.deleteMany({ where: { officerId, date, loanId } });
    await audit(tx, {
      actorId: user.id,
      action: "list.unpin",
      entity: "loan",
      entityId: loanId,
      meta: { officerId },
    });
  });
  return { ok: true as const };
}

export async function reassignLoan(ctx: AppContext, user: AuthUser, body: ReassignBody) {
  const scope = managerScope(user);
  const now = ctx.clock();
  const loan = await ctx.prisma.loan.findFirst({
    where: { AND: [{ id: body.loanId }, loanWhere(scope)] },
    select: { id: true, branchId: true },
  });
  if (!loan) throw notFound("Loan");
  const officer = await ctx.prisma.user.findFirst({
    where: { AND: [{ id: body.officerId }, officerWhere(scope)] },
    select: { id: true, branchId: true },
  });
  if (!officer) throw notFound("Officer");
  if (officer.branchId !== loan.branchId) {
    throw new HttpError(400, "That officer works in a different branch");
  }

  await ctx.prisma.$transaction(async (tx) => {
    const previous = await tx.assignment.findFirst({
      where: { loanId: loan.id, endedAt: null },
      select: { officerId: true },
    });
    if (previous?.officerId === officer.id)
      throw new HttpError(409, "The loan is already with that officer");
    await tx.assignment.updateMany({
      where: { loanId: loan.id, endedAt: null },
      data: { endedAt: now, reason: body.reason },
    });
    await tx.assignment.create({
      data: {
        loanId: loan.id,
        officerId: officer.id,
        source: "MANUAL",
        assignedById: user.id,
        reason: body.reason,
        startedAt: now,
      },
    });
    await audit(tx, {
      actorId: user.id,
      action: "loan.reassign",
      entity: "loan",
      entityId: loan.id,
      meta: { from: previous?.officerId ?? null, to: officer.id, reason: body.reason },
    });
  });
  return { ok: true as const };
}

export async function clearDispute(ctx: AppContext, user: AuthUser, loanId: string, note: string) {
  const scope = managerScope(user);
  const loan = await ctx.prisma.loan.findFirst({
    where: { AND: [{ id: loanId }, loanWhere(scope), { contactPaused: true }] },
    select: { id: true },
  });
  if (!loan) throw notFound("Dispute");
  await ctx.prisma.$transaction(async (tx) => {
    await tx.loan.update({ where: { id: loan.id }, data: { contactPaused: false } });
    await audit(tx, {
      actorId: user.id,
      action: "loan.dispute.clear",
      entity: "loan",
      entityId: loan.id,
      meta: { note },
    });
  });
  return { ok: true as const };
}

const STATUS_FILTER: Record<PromiseFilter, Prisma.PromiseToPayWhereInput> = {
  open: { status: "PENDING" },
  kept: { status: "KEPT" },
  broken: { status: { in: ["BROKEN", "PARTIAL"] } },
  all: { status: { not: "SUPERSEDED" } },
};

const TRACKER_LIMIT = 200;
const REMINDER_LOG_LIMIT = 40;

export async function getPromiseTracker(
  ctx: AppContext,
  user: AuthUser,
  query: { status: PromiseFilter; officerId?: string | undefined },
): Promise<PromiseTracker> {
  const scope = managerScope(user);
  const { prisma } = ctx;
  const today = istDayOf(ctx.clock());
  const loan = loanWhere(scope);
  const since = istDayStart(addDays(today, -30));
  const officers = await prisma.user.findMany({
    where: officerWhere(scope),
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  const byOfficer: Prisma.LoanWhereInput = query.officerId
    ? { assignments: { some: { officerId: query.officerId, endedAt: null } } }
    : {};
  const scoped = { AND: [loan, byOfficer] };
  const count = (where: Prisma.PromiseToPayWhereInput) =>
    prisma.promiseToPay.count({ where: { loan: scoped, ...where } });
  const day = toDbDate(today);
  const [dueToday, upcoming, awaitingResult, keptLast30, brokenLast30] = await Promise.all([
    count({ status: "PENDING", dueDate: day }),
    count({ status: "PENDING", dueDate: { gt: day } }),
    count({ status: "PENDING", dueDate: { lt: day } }),
    count({ status: "KEPT", resolvedAt: { gte: since } }),
    count({ status: { in: ["BROKEN", "PARTIAL"] }, resolvedAt: { gte: since } }),
  ]);

  const promises = await prisma.promiseToPay.findMany({
    where: { loan: scoped, ...STATUS_FILTER[query.status] },
    orderBy: query.status === "open" ? { dueDate: "asc" } : { dueDate: "desc" },
    take: TRACKER_LIMIT,
    include: {
      loan: {
        select: {
          loanNo: true,
          borrower: { select: { name: true } },
          assignments: {
            where: { endedAt: null },
            select: { officer: { select: { name: true } } },
          },
        },
      },
    },
  });

  const reminders = await prisma.reminder.findMany({
    where: {
      promise: { loan: scoped },
      status: { not: "CANCELLED" },
      scheduledFor: { lte: new Date(ctx.clock().getTime() + 2 * 86_400_000) },
    },
    orderBy: { scheduledFor: "desc" },
    take: REMINDER_LOG_LIMIT,
    include: { promise: { select: { loan: { select: { loanNo: true } } } } },
  });

  return {
    summary: { dueToday, upcoming, awaitingResult, keptLast30, brokenLast30 },
    officers,
    promises: promises.map((p) => ({
      id: p.id,
      loanId: p.loanId,
      loanNo: p.loan.loanNo,
      borrowerName: p.loan.borrower.name,
      officerName: p.loan.assignments[0]?.officer.name ?? null,
      amount: p.amount,
      paidAmount: p.paidAmount,
      madeOn: istDayOf(p.createdAt),
      dueDate: fromDbDate(p.dueDate),
      status: p.status,
    })),
    reminders: reminders.map((r) => ({
      id: r.id,
      recipient: r.recipient,
      status: r.status,
      scheduledFor: r.scheduledFor.toISOString(),
      sentAt: r.sentAt?.toISOString() ?? null,
      body: r.body,
      loanNo: r.promise.loan.loanNo,
    })),
  };
}
