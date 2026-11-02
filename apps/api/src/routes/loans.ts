import type { PrismaClient } from "@kisht/db";
import { fromDbDate, maskPhone } from "@kisht/shared";
import type { FastifyInstance, preHandlerAsyncHookHandler } from "fastify";
import { z } from "zod";
import { loanScope } from "../auth/scope.js";
import { currentUser, HttpError } from "../auth/session.js";

const LoanParams = z.object({ id: z.string().min(1).max(64) });

export function registerLoanRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  authenticate: preHandlerAsyncHookHandler,
) {
  app.get("/api/loans/:id", { preHandler: authenticate }, async (request) => {
    const user = currentUser(request);
    const { id } = LoanParams.parse(request.params);

    const loan = await prisma.loan.findFirst({
      where: { AND: [{ id }, loanScope(user)] },
      include: {
        borrower: true,
        branch: { select: { code: true, name: true } },
        snapshots: { orderBy: { asOfDate: "desc" }, take: 1 },
        assignments: {
          where: { endedAt: null },
          include: { officer: { select: { id: true, name: true } } },
        },
      },
    });
    if (!loan) throw new HttpError(404, "Loan not found");

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
    };
  });

  // DPDP: the full number is only handed out on an explicit, logged request.
  app.post("/api/loans/:id/reveal-contact", { preHandler: authenticate }, async (request) => {
    const user = currentUser(request);
    const { id } = LoanParams.parse(request.params);

    const loan = await prisma.loan.findFirst({
      where: { AND: [{ id }, loanScope(user)] },
      select: { id: true, borrower: { select: { phone: true } } },
    });
    if (!loan) throw new HttpError(404, "Loan not found");

    await prisma.auditLog.create({
      data: { actorId: user.id, action: "contact.reveal", entity: "loan", entityId: loan.id },
    });
    return { phone: loan.borrower.phone };
  });
}
