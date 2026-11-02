import { Prisma, type PrismaClient } from "@kisht/db";
import {
  type AssignmentResult,
  assignLoans,
  fromDbDate,
  type ImportPlan,
  type IsoDay,
  istDayOf,
  type OverdueRow,
  type PreviousState,
  parseOverdueCsv,
  planImport,
  type RowError,
  resolvePromise,
  toDbDate,
} from "@kisht/shared";
import { type AuthUser, HttpError } from "../auth/session.js";

// Daily overdue import: preview (validate, plan, no loan data written) and
// commit (apply the plan in one transaction). See A1, A2, A3, A7, A8.

type Db = PrismaClient | Prisma.TransactionClient;

export type ImportScope = { branchIds: string[] | null };

export function importScopeFor(user: AuthUser): ImportScope {
  if (user.role === "HEAD") return { branchIds: null };
  if (user.role === "BRANCH_MANAGER" && user.branchId) return { branchIds: [user.branchId] };
  throw new HttpError(403, "Only branch managers and the head of collections can import");
}

const inScope = (scope: ImportScope, branchId: string) =>
  scope.branchIds === null || scope.branchIds.includes(branchId);

function branchWhere(scope: ImportScope): Prisma.LoanWhereInput {
  return scope.branchIds === null ? {} : { branchId: { in: scope.branchIds } };
}

/** Committed batches that overlap this scope (a head import covers every branch). */
function overlappingBatches(scope: ImportScope): Prisma.ImportBatchWhereInput {
  if (scope.branchIds === null) return {};
  return { OR: [{ branchId: null }, { branchId: { in: scope.branchIds } }] };
}

export type ImportSummary = {
  asOfDate: IsoDay;
  rows: number;
  errors: number;
  skippedOtherBranches: number;
  newLoans: number;
  cured: number;
  payments: number;
  replacesExisting: boolean;
  assignment: {
    kept: number;
    new: number;
    moved: number;
    unassigned: number;
    byOfficer: { officerId: string; name: string; loans: number }[];
  };
  promises?: { kept: number; partial: number; broken: number };
};

type Prepared = {
  rows: OverdueRow[];
  plan: ImportPlan;
  assignment: AssignmentResult;
  officerNames: Map<string, string>;
  branchIdByCode: Map<string, string>;
  replacesExisting: boolean;
  loanIdByNo: Map<string, string>;
};

async function assertNotOutOfOrder(db: Db, scope: ImportScope, asOfDate: IsoDay) {
  const latest = await db.importBatch.findFirst({
    where: { status: "COMMITTED", ...overlappingBatches(scope) },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  if (latest && fromDbDate(latest.asOfDate) > asOfDate) {
    throw new HttpError(
      409,
      `An import for ${fromDbDate(latest.asOfDate)} already exists. Imports must be uploaded in date order.`,
    );
  }
}

/** Builds the plan from the database as it is now. Used by preview and, again, inside commit. */
async function prepare(
  db: Db,
  scope: ImportScope,
  asOfDate: IsoDay,
  rows: OverdueRow[],
): Promise<Prepared> {
  const branches = await db.branch.findMany({ select: { id: true, code: true } });
  const branchIdByCode = new Map(branches.map((b) => [b.code, b.id]));

  const loanNos = rows.map((r) => r.loanNo);
  const known = await db.loan.findMany({
    where: { loanNo: { in: loanNos } },
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
      status: "COMMITTED",
      asOfDate: { lt: toDbDate(asOfDate) },
      ...overlappingBatches(scope),
    },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  const previousListRows = prevBatch
    ? await db.loanSnapshot.findMany({
        where: { asOfDate: prevBatch.asOfDate, loan: branchWhere(scope) },
        select: { loan: { select: { loanNo: true } } },
      })
    : [];
  const previousList = new Set(previousListRows.map((r) => r.loan.loanNo));

  const plan = planImport({
    asOfDate,
    rows,
    previous,
    previousList,
    knownLoans: new Set(loanIdByNo.keys()),
  });

  // Assignment, as it would run on commit.
  const officers = await db.user.findMany({
    where: {
      role: "OFFICER",
      ...(scope.branchIds === null ? {} : { branchId: { in: scope.branchIds } }),
    },
    select: { id: true, name: true, pincodes: { select: { pincode: true } } },
  });
  const current = await db.assignment.findMany({
    where: { loanId: { in: known.map((l) => l.id) }, endedAt: null },
    select: { loanId: true, officerId: true },
  });
  const currentByLoanNo = new Map(
    current.map((a) => [loanNoById.get(a.loanId) ?? "", a.officerId]),
  );
  const assignment = assignLoans(
    rows.map((r) => ({
      loanId: r.loanNo,
      pincode: r.pincode,
      currentOfficerId: currentByLoanNo.get(r.loanNo) ?? null,
    })),
    officers.map((o) => ({ officerId: o.id, pincodes: o.pincodes.map((p) => p.pincode) })),
  );

  const replacesExisting =
    (await db.importBatch.count({
      where: { status: "COMMITTED", asOfDate: toDbDate(asOfDate), ...overlappingBatches(scope) },
    })) > 0;

  return {
    rows,
    plan,
    assignment,
    officerNames: new Map(officers.map((o) => [o.id, o.name])),
    branchIdByCode,
    replacesExisting,
    loanIdByNo,
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
  prisma: PrismaClient,
  user: AuthUser,
  input: { asOfDate: IsoDay; fileName: string; csv: string },
  now: Date,
) {
  const scope = importScopeFor(user);
  if (input.asOfDate > istDayOf(now))
    throw new HttpError(400, "The as-of date cannot be in the future");
  await assertNotOutOfOrder(prisma, scope, input.asOfDate);

  const parsed = parseOverdueCsv(input.csv, input.asOfDate);
  if (parsed.fileErrors.length > 0) {
    throw new HttpError(422, parsed.fileErrors.join(" "));
  }

  const branches = await prisma.branch.findMany({ select: { id: true, code: true } });
  const branchIdByCode = new Map(branches.map((b) => [b.code, b.id]));
  const errors: RowError[] = [...parsed.errors];
  const rows: OverdueRow[] = [];
  let skipped = 0;
  parsed.rows.forEach((row) => {
    const branchId = branchIdByCode.get(row.branchCode);
    if (!branchId) {
      errors.push({
        row: row.row,
        field: "branch_code",
        message: `unknown branch "${row.branchCode}"`,
      });
      return;
    }
    if (!inScope(scope, branchId)) {
      skipped++;
      return;
    }
    rows.push(row);
  });

  const prepared = await prepare(prisma, scope, input.asOfDate, rows);
  const summary = summarise(input.asOfDate, prepared, errors.length, skipped);

  const batch = await prisma.importBatch.create({
    data: {
      asOfDate: toDbDate(input.asOfDate),
      fileName: input.fileName,
      uploadedById: user.id,
      branchId: scope.branchIds?.[0] ?? null,
      rowCount: parsed.totalRows,
      errorCount: errors.length,
      skippedCount: skipped,
      errors: errors as unknown as Prisma.InputJsonValue,
      payload: rows as unknown as Prisma.InputJsonValue,
      summary: summary as unknown as Prisma.InputJsonValue,
      status: "PREVIEW",
    },
  });

  return { id: batch.id, status: batch.status, summary, errors: errors.slice(0, 200) };
}

export async function commitImport(
  prisma: PrismaClient,
  user: AuthUser,
  batchId: string,
  now: Date,
) {
  const scope = importScopeFor(user);
  const batch = await prisma.importBatch.findFirst({
    where: { id: batchId, uploadedById: user.id },
  });
  if (!batch) throw new HttpError(404, "Import not found");
  if (batch.status !== "PREVIEW")
    throw new HttpError(409, `This import is already ${batch.status.toLowerCase()}`);

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

      await assertNotOutOfOrderExcluding(tx, scope, asOfDate, batch.id);
      const p = await prepare(tx, scope, asOfDate, rows);

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
        const branchId = p.branchIdByCode.get(row.branchCode);
        if (!branchId) continue;
        const borrowerData = {
          name: row.borrowerName,
          businessType: row.businessType,
          phone: row.phone,
          address: row.address,
          pincode: row.pincode,
        };
        const existingId = p.loanIdByNo.get(row.loanNo);
        if (existingId) {
          const loan = knownLoans.get(existingId);
          if (!loan) continue;
          const b = loan.borrower;
          if (
            b.name !== row.borrowerName ||
            b.businessType !== row.businessType ||
            b.phone !== row.phone ||
            b.address !== row.address ||
            b.pincode !== row.pincode
          ) {
            await tx.borrower.update({ where: { id: b.id }, data: borrowerData });
          }
          if (loan.emiAmount !== row.emiAmount || loan.branchId !== branchId) {
            await tx.loan.update({
              where: { id: loan.id },
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
          where: { asOfDate: toDbDate(asOfDate), loan: branchWhere(scope) },
        });
        await tx.importBatch.updateMany({
          where: {
            id: { not: batch.id },
            status: "COMMITTED",
            asOfDate: toDbDate(asOfDate),
            ...(scope.branchIds === null ? {} : { branchId: { in: scope.branchIds } }),
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
        where: { status: "PENDING", loan: branchWhere(scope) },
        include: { loan: { select: { payments: { select: { date: true, amount: true } } } } },
      });
      const cured = new Set(curedIds);
      for (const promise of pending) {
        const madeOn = istDayOf(promise.createdAt);
        const resolution = cured.has(promise.loanId)
          ? { status: "KEPT" as const, paidAmount: promise.amount, resolvedOn: asOfDate }
          : resolvePromise(
              { madeOn, dueDate: fromDbDate(promise.dueDate), amount: promise.amount },
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

      const summary: ImportSummary = {
        ...summarise(asOfDate, p, batch.errorCount, batch.skippedCount),
        promises: promiseCounts,
      };
      await tx.importBatch.update({
        where: { id: batch.id },
        data: { payload: Prisma.DbNull, summary: summary as unknown as Prisma.InputJsonValue },
      });
      await tx.auditLog.create({
        data: {
          actorId: user.id,
          action: "import.commit",
          entity: "import_batch",
          entityId: batch.id,
          meta: { asOfDate, rows: rows.length } as Prisma.InputJsonValue,
        },
      });

      return { id: batch.id, status: "COMMITTED" as const, summary };
    },
    { timeout: 60_000, maxWait: 10_000 },
  );
}

async function assertNotOutOfOrderExcluding(
  db: Db,
  scope: ImportScope,
  asOfDate: IsoDay,
  batchId: string,
) {
  const later = await db.importBatch.findFirst({
    where: {
      id: { not: batchId },
      status: "COMMITTED",
      asOfDate: { gt: toDbDate(asOfDate) },
      ...overlappingBatches(scope),
    },
    select: { asOfDate: true },
  });
  if (later) {
    throw new HttpError(
      409,
      `An import for ${fromDbDate(later.asOfDate)} was committed after this preview.`,
    );
  }
}
