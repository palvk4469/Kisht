import type {
  ImportCommitted,
  ImportHistoryItem,
  ImportPreview,
  ImportPreviewBody,
  ImportSummary,
  RowError,
} from "@kisht/contracts";
import { Prisma, type PrismaClient } from "@kisht/db";
import {
  type AssignmentResult,
  assignLoans,
  curedNeedsConfirmation,
  fromDbDate,
  type ImportPlan,
  type IsoDay,
  istDayOf,
  type OverdueRow,
  type PreviousState,
  parseOverdueCsv,
  planImport,
  resolvePromise,
  toDbDate,
} from "@kisht/domain";
import type { AppContext } from "../../context.js";
import { HttpError, notFound } from "../../http/errors.js";
import type { AuthUser } from "../../http/guards.js";
import { audit } from "../audit/audit.js";
import {
  batchBranchOf,
  batchesAffecting,
  batchesOwnedBy,
  coversBranch,
  loanWhere,
  type ManagerScope,
  managerScope,
  officerWhere,
} from "../auth/scope.js";
import { scoreLoans } from "../scoring/service.js";

// Daily overdue import: preview (validate, plan, no loan data written) and
// commit (apply the plan in one transaction). See A1, A2, A3, A7, A8.

type Db = PrismaClient | Prisma.TransactionClient;
type BranchCodes = ReadonlyMap<string, string>;

const MAX_ERRORS_RETURNED = 200;

type Prepared = {
  previousListSize: number;
  rows: OverdueRow[];
  plan: ImportPlan;
  assignment: AssignmentResult;
  officerNames: Map<string, string>;
  replacesExisting: boolean;
  loanIdByNo: Map<string, string>;
};

async function branchCodes(db: Db): Promise<BranchCodes> {
  const branches = await db.branch.findMany({ select: { id: true, code: true } });
  return new Map(branches.map((b) => [b.code, b.id]));
}

/** Imports must arrive in date order; an older day would rewind assignments and promises. */
async function assertInDateOrder(
  db: Db,
  scope: ManagerScope,
  asOfDate: IsoDay,
  excludeId?: string,
) {
  const later = await db.importBatch.findFirst({
    where: {
      AND: [batchesAffecting(scope)],
      status: "COMMITTED",
      asOfDate: { gt: toDbDate(asOfDate) },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  if (later) {
    throw new HttpError(
      409,
      `An import for ${fromDbDate(later.asOfDate)} already exists. Imports must be uploaded in date order.`,
    );
  }
}

const rejectedLoans = (errors: readonly RowError[]) =>
  new Set(errors.flatMap((e) => e.loanNo ?? []));

/** Builds the plan from the database as it is now. Used by preview and, again, inside commit. */
async function prepare(
  db: Db,
  scope: ManagerScope,
  asOfDate: IsoDay,
  rows: OverdueRow[],
  rejected: ReadonlySet<string>,
): Promise<Prepared> {
  const known = await db.loan.findMany({
    where: { loanNo: { in: rows.map((r) => r.loanNo) } },
    select: { id: true, loanNo: true },
  });
  const loanIdByNo = new Map(known.map((l) => [l.loanNo, l.id]));
  const loanNoById = new Map(known.map((l) => [l.id, l.loanNo]));

  // Latest earlier state of each loan on today's list.
  const latestBefore = await db.loanSnapshot.findMany({
    where: { loanId: { in: known.map((l) => l.id) }, asOfDate: { lt: toDbDate(asOfDate) } },
    orderBy: [{ loanId: "asc" }, { asOfDate: "desc" }],
    distinct: ["loanId"],
    select: { loanId: true, outstanding: true, lastPaymentDate: true },
  });
  const previous = new Map<string, PreviousState>();
  for (const s of latestBefore) {
    const loanNo = loanNoById.get(s.loanId);
    if (loanNo) {
      previous.set(loanNo, {
        outstanding: s.outstanding,
        lastPaymentDate: s.lastPaymentDate ? fromDbDate(s.lastPaymentDate) : null,
      });
    }
  }

  // The previous day's list in this scope, to find cured loans.
  const prevBatch = await db.importBatch.findFirst({
    where: {
      AND: [batchesAffecting(scope)],
      status: "COMMITTED",
      asOfDate: { lt: toDbDate(asOfDate) },
    },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  const previousList = new Set(
    prevBatch
      ? (
          await db.loanSnapshot.findMany({
            where: { asOfDate: prevBatch.asOfDate, loan: loanWhere(scope) },
            select: { loan: { select: { loanNo: true } } },
          })
        ).map((r) => r.loan.loanNo)
      : [],
  );

  const plan = planImport({
    asOfDate,
    rows,
    previous,
    previousList,
    knownLoans: new Set(loanIdByNo.keys()),
    rejected,
  });

  // Assignment, exactly as commit will run it.
  const officers = await db.user.findMany({
    where: officerWhere(scope),
    select: { id: true, name: true, pincodes: { select: { pincode: true } } },
  });
  const current = await db.assignment.findMany({
    where: { loanId: { in: known.map((l) => l.id) }, endedAt: null },
    select: { loanId: true, officerId: true, source: true },
  });
  const currentByLoanNo = new Map(current.map((a) => [loanNoById.get(a.loanId) ?? "", a]));
  const assignment = assignLoans(
    rows.map((r) => ({
      loanId: r.loanNo,
      pincode: r.pincode,
      currentOfficerId: currentByLoanNo.get(r.loanNo)?.officerId ?? null,
      keepCurrent: currentByLoanNo.get(r.loanNo)?.source === "MANUAL",
    })),
    officers.map((o) => ({ officerId: o.id, pincodes: o.pincodes.map((p) => p.pincode) })),
  );

  const replacesExisting =
    (await db.importBatch.count({
      where: { AND: [batchesAffecting(scope)], status: "COMMITTED", asOfDate: toDbDate(asOfDate) },
    })) > 0;

  return {
    rows,
    plan,
    assignment,
    officerNames: new Map(officers.map((o) => [o.id, o.name])),
    replacesExisting,
    loanIdByNo,
    previousListSize: previousList.size,
  };
}

function summarise(asOfDate: IsoDay, p: Prepared, errors: number, skipped: number): ImportSummary {
  const count = (kind: string) => p.assignment.assigned.filter((a) => a.kind === kind).length;
  return {
    asOfDate,
    rows: p.rows.length,
    errors,
    skippedOtherBranches: skipped,
    newLoans: p.plan.newLoans.length,
    cured: p.plan.cured.length,
    previousList: p.previousListSize,
    curedNeedsConfirmation: curedNeedsConfirmation(p.plan.cured.length, p.previousListSize),
    payments: p.plan.payments.length,
    replacesExisting: p.replacesExisting,
    assignment: {
      kept: count("KEPT"),
      new: count("NEW"),
      moved: count("MOVED"),
      unassigned: p.assignment.unassigned.length,
      byOfficer: [...p.assignment.loadByOfficer.entries()]
        .map(([officerId, loans]) => ({
          officerId,
          name: p.officerNames.get(officerId) ?? officerId,
          loans,
        }))
        .sort((a, b) => b.loans - a.loans),
    },
  };
}

export async function previewImport(
  ctx: AppContext,
  user: AuthUser,
  input: ImportPreviewBody,
): Promise<ImportPreview> {
  const { prisma } = ctx;
  const scope = managerScope(user);
  if (input.asOfDate > istDayOf(ctx.clock())) {
    throw new HttpError(400, "The as-of date cannot be in the future");
  }
  await assertInDateOrder(prisma, scope, input.asOfDate);

  const parsed = parseOverdueCsv(input.csv, input.asOfDate);
  if (parsed.fileErrors.length > 0) throw new HttpError(422, parsed.fileErrors.join(" "));

  const codes = await branchCodes(prisma);
  const errors: RowError[] = [...parsed.errors];
  const rows: OverdueRow[] = [];
  let skipped = 0;
  for (const row of parsed.rows) {
    const branchId = codes.get(row.branchCode);
    if (!branchId) {
      errors.push({
        row: row.row,
        field: "branch_code",
        message: `unknown branch "${row.branchCode}"`,
        loanNo: row.loanNo,
      });
    } else if (!coversBranch(scope, branchId)) {
      skipped++;
    } else {
      rows.push(row);
    }
  }

  const summary = summarise(
    input.asOfDate,
    await prepare(prisma, scope, input.asOfDate, rows, rejectedLoans(errors)),
    errors.length,
    skipped,
  );
  const batch = await prisma.importBatch.create({
    data: {
      asOfDate: toDbDate(input.asOfDate),
      fileName: input.fileName,
      uploadedById: user.id,
      branchId: batchBranchOf(scope),
      rowCount: parsed.totalRows,
      errorCount: errors.length,
      skippedCount: skipped,
      errors: errors as unknown as Prisma.InputJsonValue,
      payload: rows as unknown as Prisma.InputJsonValue,
      summary: summary as unknown as Prisma.InputJsonValue,
      status: "PREVIEW",
    },
  });

  return { id: batch.id, status: "PREVIEW", summary, errors: errors.slice(0, MAX_ERRORS_RETURNED) };
}

export async function commitImport(
  ctx: AppContext,
  user: AuthUser,
  batchId: string,
  confirmCured = false,
): Promise<ImportCommitted> {
  const { prisma } = ctx;
  const now = ctx.clock();
  const scope = managerScope(user);
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, uploadedById: user.id },
  });
  if (!batch) throw notFound("Import");
  if (batch.status !== "PREVIEW") {
    throw new HttpError(409, `This import is already ${batch.status.toLowerCase()}`);
  }

  const asOfDate = fromDbDate(batch.asOfDate);
  const rows = (batch.payload ?? []) as unknown as OverdueRow[];

  return prisma.$transaction(
    async (tx) => {
      // Claim the batch first: a second concurrent commit finds nothing to claim.
      const claimed = await tx.importBatch.updateMany({
        where: { id: batch.id, status: "PREVIEW" },
        data: { status: "COMMITTED", committedAt: now },
      });
      if (claimed.count !== 1)
        throw new HttpError(409, "This import was committed by another request");

      // The database may have moved on since the preview: check and plan again.
      await assertInDateOrder(tx, scope, asOfDate, batch.id);
      const codes = await branchCodes(tx);
      const rejected = rejectedLoans((batch.errors ?? []) as unknown as RowError[]);
      const p = await prepare(tx, scope, asOfDate, rows, rejected);
      // Judged on today's plan, not the preview's: throwing also undoes the claim above.
      const needsConfirmation = curedNeedsConfirmation(p.plan.cured.length, p.previousListSize);
      if (needsConfirmation && !confirmCured) {
        throw new HttpError(
          409,
          `${p.plan.cured.length} of ${p.previousListSize} loans are missing from this file. Confirm they are no longer overdue to commit it.`,
        );
      }

      // 1. Loans and borrowers: create new ones, refresh details of known ones.
      const knownLoans = new Map(
        (
          await tx.loan.findMany({
            where: { id: { in: [...p.loanIdByNo.values()] } },
            include: { borrower: true },
          })
        ).map((l) => [l.id, l]),
      );
      for (const row of rows) {
        const branchId = codes.get(row.branchCode);
        if (!branchId) continue;
        const borrowerData = {
          name: row.borrowerName,
          businessType: row.businessType,
          phone: row.phone,
          address: row.address,
          pincode: row.pincode,
        };
        const existing = knownLoans.get(p.loanIdByNo.get(row.loanNo) ?? "");
        if (existing) {
          const b = existing.borrower;
          if (
            b.name !== row.borrowerName ||
            b.businessType !== row.businessType ||
            b.phone !== row.phone ||
            b.address !== row.address ||
            b.pincode !== row.pincode
          ) {
            await tx.borrower.update({ where: { id: b.id }, data: borrowerData });
          }
          if (existing.emiAmount !== row.emiAmount || existing.branchId !== branchId) {
            await tx.loan.update({
              where: { id: existing.id },
              data: { emiAmount: row.emiAmount, branchId },
            });
          }
        } else {
          const created = await tx.loan.create({
            data: {
              loanNo: row.loanNo,
              emiAmount: row.emiAmount,
              branch: { connect: { id: branchId } },
              borrower: { create: borrowerData },
            },
          });
          p.loanIdByNo.set(row.loanNo, created.id);
        }
      }
      const loanId = (loanNo: string) => p.loanIdByNo.get(loanNo) as string;

      // 2. Same-day re-upload replaces that day's snapshots in scope (A2).
      if (p.replacesExisting) {
        await tx.loanSnapshot.deleteMany({
          where: { asOfDate: toDbDate(asOfDate), loan: loanWhere(scope) },
        });
        await tx.importBatch.updateMany({
          where: {
            AND: [batchesOwnedBy(scope)],
            id: { not: batch.id },
            status: "COMMITTED",
            asOfDate: toDbDate(asOfDate),
          },
          data: { status: "SUPERSEDED" },
        });
      }
      await tx.loanSnapshot.createMany({
        data: rows.map((r) => ({
          loanId: loanId(r.loanNo),
          asOfDate: toDbDate(asOfDate),
          outstanding: r.outstanding,
          dpd: r.dpd,
          lastPaymentDate: r.lastPaymentDate ? toDbDate(r.lastPaymentDate) : null,
          lastPaymentAmount: r.lastPaymentAmount,
          importBatchId: batch.id,
        })),
      });

      // 3. Payments (A8).
      await tx.payment.createMany({
        data: p.plan.payments.map((pay) => ({
          loanId: loanId(pay.loanNo),
          date: toDbDate(pay.date),
          amount: pay.amount,
        })),
        skipDuplicates: true,
      });

      // 4. Cured loans leave their officer's list.
      const curedIds = (
        await tx.loan.findMany({ where: { loanNo: { in: p.plan.cured } }, select: { id: true } })
      ).map((l) => l.id);
      await tx.assignment.updateMany({
        where: { loanId: { in: curedIds }, endedAt: null },
        data: { endedAt: now, reason: "cured" },
      });

      // 5. Assignment changes (A3).
      for (const d of p.assignment.assigned) {
        if (d.kind === "KEPT") continue;
        const id = loanId(d.loanId);
        await tx.assignment.updateMany({
          where: { loanId: id, endedAt: null },
          data: { endedAt: now, reason: "reassigned on import" },
        });
        await tx.assignment.create({
          data: { loanId: id, officerId: d.officerId, source: "AUTO", startedAt: now },
        });
      }
      for (const u of p.assignment.unassigned) {
        await tx.assignment.updateMany({
          where: { loanId: loanId(u.loanId), endedAt: null },
          data: { endedAt: now, reason: "no officer covers pincode" },
        });
      }

      // 6. Promise resolution (A7). A cured loan has paid in full.
      const promiseCounts = { kept: 0, partial: 0, broken: 0 };
      const pending = await tx.promiseToPay.findMany({
        where: { status: "PENDING", loan: loanWhere(scope) },
        include: {
          loan: { select: { loanNo: true, payments: { select: { date: true, amount: true } } } },
        },
      });
      const cured = new Set(curedIds);
      for (const promise of pending) {
        // Today's data on this loan was rejected, so it can't settle anything yet.
        if (rejected.has(promise.loan.loanNo)) continue;
        const resolution = cured.has(promise.loanId)
          ? { status: "KEPT" as const, paidAmount: promise.amount }
          : resolvePromise(
              {
                madeOn: istDayOf(promise.createdAt),
                dueDate: fromDbDate(promise.dueDate),
                amount: promise.amount,
              },
              promise.loan.payments.map((x) => ({ date: fromDbDate(x.date), amount: x.amount })),
              asOfDate,
            );
        if (resolution.status === "PENDING") continue;
        await tx.promiseToPay.update({
          where: { id: promise.id },
          data: { status: resolution.status, paidAmount: resolution.paidAmount, resolvedAt: now },
        });
        if (resolution.status === "KEPT") promiseCounts.kept++;
        if (resolution.status === "PARTIAL") promiseCounts.partial++;
        if (resolution.status === "BROKEN") promiseCounts.broken++;
      }

      // 7. Fresh priority scores for today's list, after promises settled above.
      await scoreLoans(
        tx,
        rows.map((r) => loanId(r.loanNo)),
        asOfDate,
      );

      const summary: ImportSummary = {
        ...summarise(asOfDate, p, batch.errorCount, batch.skippedCount),
        promises: promiseCounts,
      };
      await tx.importBatch.update({
        where: { id: batch.id },
        data: { payload: Prisma.DbNull, summary: summary as unknown as Prisma.InputJsonValue },
      });
      await audit(tx, {
        actorId: user.id,
        action: "import.commit",
        entity: "import_batch",
        entityId: batch.id,
        meta: {
          asOfDate,
          rows: rows.length,
          cured: p.plan.cured.length,
          curedConfirmed: needsConfirmation,
        },
      });

      return { id: batch.id, status: "COMMITTED" as const, summary };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

const HISTORY_LIMIT = 30;

export async function listImports(ctx: AppContext, user: AuthUser): Promise<ImportHistoryItem[]> {
  const batches = await ctx.prisma.importBatch.findMany({
    // Unconfirmed previews are scratch work, not history.
    where: { AND: [batchesAffecting(managerScope(user))], status: { not: "PREVIEW" } },
    orderBy: [{ asOfDate: "desc" }, { createdAt: "desc" }],
    take: HISTORY_LIMIT,
    include: { uploadedBy: { select: { name: true } } },
  });
  return batches.map((b) => ({
    id: b.id,
    asOfDate: fromDbDate(b.asOfDate),
    fileName: b.fileName,
    status: b.status,
    rowCount: b.rowCount,
    errorCount: b.errorCount,
    uploadedBy: b.uploadedBy.name,
    createdAt: b.createdAt.toISOString(),
    committedAt: b.committedAt?.toISOString() ?? null,
  }));
}

const PREVIEW_MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * A preview holds borrowers' names and phone numbers until it's committed. One
 * that was abandoned has no business keeping them (DPDP).
 */
export async function purgeStalePreviews(ctx: AppContext): Promise<number> {
  const { count } = await ctx.prisma.importBatch.deleteMany({
    where: {
      status: "PREVIEW",
      createdAt: { lt: new Date(ctx.clock().getTime() - PREVIEW_MAX_AGE_MS) },
    },
  });
  return count;
}
