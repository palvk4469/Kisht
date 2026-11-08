import { type PrismaClient, SAMPLE_LOAN_NOS } from "@kisht/db";
import { addDays, daysBetween, fromDbDate, type IsoDay, OVERDUE_COLUMNS } from "@kisht/domain";
import { batchesAffecting, loanWhere, type ManagerScope } from "../auth/scope.js";

// Demo mode only (D13): today's overdue export, as the loan system would send it.
// The latest list is moved forward to today, so a loan still overdue is a day
// further behind for every day since. Then it is edited so a reviewer's upload
// exercises every part of the preview: three loans paid off (cured), two
// part-payments, one brand-new loan and one bad row.

const quote = (v: string | number | null) => {
  const s = v === null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function buildDemoSample(
  prisma: PrismaClient,
  scope: ManagerScope,
  today: IsoDay,
): Promise<{ fileName: string; csv: string }> {
  const latest = await prisma.importBatch.findFirst({
    where: { AND: [batchesAffecting(scope)], status: "COMMITTED" },
    orderBy: { asOfDate: "desc" },
    select: { asOfDate: true },
  });
  if (!latest) return { fileName: "overdue-sample.csv", csv: `${OVERDUE_COLUMNS.join(",")}\n` };

  const asOf = fromDbDate(latest.asOfDate);
  const day = today > asOf ? today : asOf;
  const behind = daysBetween(asOf, day);
  const snapshots = await prisma.loanSnapshot.findMany({
    where: {
      asOfDate: latest.asOfDate,
      loan: loanWhere(scope),
    },
    include: { loan: { include: { borrower: true, branch: { select: { code: true } } } } },
    orderBy: { loan: { loanNo: "asc" } },
  });

  // The brief's sample loans are never paid off here, so the demo story holds.
  const editable = snapshots.filter((s) => !SAMPLE_LOAN_NOS.includes(s.loan.loanNo));
  const cured = new Set(
    editable
      .filter((_, i) => i % 23 === 5)
      .slice(0, 3)
      .map((s) => s.loanId),
  );
  const partPaid = new Set(
    editable
      .filter((_, i) => i % 29 === 7)
      .slice(0, 2)
      .map((s) => s.loanId),
  );
  const badPhone = editable.find((s) => !cured.has(s.loanId) && !partPaid.has(s.loanId))?.loanId;

  const lines = [OVERDUE_COLUMNS.join(",")];
  for (const s of snapshots) {
    if (cured.has(s.loanId)) continue;
    const b = s.loan.borrower;
    const paid = partPaid.has(s.loanId);
    lines.push(
      [
        s.loan.loanNo,
        b.name,
        b.businessType,
        s.loanId === badPhone ? "12345" : b.phone,
        b.address,
        b.pincode,
        paid ? s.outstanding - s.loan.emiAmount : s.outstanding,
        s.dpd + behind,
        s.loan.emiAmount,
        paid ? addDays(day, -1) : s.lastPaymentDate ? fromDbDate(s.lastPaymentDate) : "",
        paid ? s.loan.emiAmount : (s.lastPaymentAmount ?? ""),
        s.loan.branch.code,
      ]
        .map(quote)
        .join(","),
    );
  }
  const branchCode = snapshots[0]?.loan.branch.code ?? "IND";
  const pincode = snapshots[0]?.loan.borrower.pincode ?? "452001";
  lines.push(
    [
      "LN-19999",
      "Company ZZ (namkeen manufacturer)",
      "namkeen manufacturer",
      "9000099999",
      `Plot 9, New Industrial Area, ${pincode}`,
      pincode,
      185000,
      3,
      8200,
      "",
      "",
      branchCode,
    ]
      .map(quote)
      .join(","),
  );

  return { fileName: `overdue-${day}.csv`, csv: `${lines.join("\n")}\n` };
}
