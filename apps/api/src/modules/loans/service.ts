import type { LoanDetail } from "@kisht/contracts";
import { fromDbDate, istDayOf, maskPhone } from "@kisht/domain";
import type { AppContext } from "../../context.js";
import { notFound } from "../../http/errors.js";
import type { AuthUser } from "../../http/guards.js";
import { audit } from "../audit/audit.js";
import { loanWhere, scopeOf } from "../auth/scope.js";
import { toHistory, toPriority, visiblePromise } from "../field/present.js";

export async function getLoanDetail(
  ctx: AppContext,
  user: AuthUser,
  id: string,
): Promise<LoanDetail> {
  const loan = await ctx.prisma.loan.findFirst({
    where: { AND: [{ id }, loanWhere(scopeOf(user))] },
    include: {
      borrower: true,
      branch: { select: { code: true, name: true } },
      snapshots: { orderBy: { asOfDate: "desc" }, take: 1 },
      assignments: {
        where: { endedAt: null },
        include: { officer: { select: { id: true, name: true } } },
      },
      scores: { orderBy: { asOfDate: "desc" }, take: 1 },
      promises: {
        where: { status: { not: "SUPERSEDED" } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      outcomes: {
        orderBy: { correctedAt: "desc" },
        take: 8,
        include: { officer: { select: { name: true } } },
      },
    },
  });
  if (!loan) throw notFound("Loan");

  const today = istDayOf(ctx.clock());
  const score = loan.scores[0];
  const promise = loan.promises[0];

  const snapshot = loan.snapshots[0];
  return {
    id: loan.id,
    loanNo: loan.loanNo,
    emiAmount: loan.emiAmount,
    contactPaused: loan.contactPaused,
    branch: loan.branch,
    borrower: {
      name: loan.borrower.name,
      businessType: loan.borrower.businessType,
      phoneMasked: maskPhone(loan.borrower.phone),
      address: loan.borrower.address,
      pincode: loan.borrower.pincode,
      lat: loan.borrower.lat,
      lng: loan.borrower.lng,
    },
    latest: snapshot
      ? {
          asOfDate: fromDbDate(snapshot.asOfDate),
          outstanding: snapshot.outstanding,
          dpd: snapshot.dpd,
        }
      : null,
    officer: loan.assignments[0]?.officer ?? null,
    priority: score ? toPriority(score) : null,
    promise: promise ? visiblePromise(promise, today) : null,
    history: loan.outcomes.map(toHistory),
  };
}

/** DPDP: the full number is only handed out on an explicit, logged request. */
export async function revealContact(ctx: AppContext, user: AuthUser, id: string) {
  const loan = await ctx.prisma.loan.findFirst({
    where: { AND: [{ id }, loanWhere(scopeOf(user))] },
    select: { id: true, borrower: { select: { phone: true } } },
  });
  if (!loan) throw notFound("Loan");
  await audit(ctx.prisma, {
    actorId: user.id,
    action: "contact.reveal",
    entity: "loan",
    entityId: loan.id,
  });
  return { phone: loan.borrower.phone };
}
