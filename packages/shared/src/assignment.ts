// Auto-assignment of the day's overdue loans to officers (A3).
//
// Ownership rules, in order:
//  1. Continuity: a loan stays with its current officer while that officer
//     still covers the borrower's pincode. Borrowers deal with one person.
//  2. Otherwise it goes to the covering officer with the fewest loans
//     (after step 1), so workload evens out. Ties break on officer id so the
//     result is deterministic.
//  3. No officer covers the pincode: the loan goes to the manager's queue.
//
// Workload caps are applied to the *daily list* (top N by priority), not to
// ownership, so a heavy day never leaves an overdue loan without an owner.

export type OfficerTerritory = {
  officerId: string;
  pincodes: readonly string[];
};

export type LoanToAssign = {
  loanId: string;
  pincode: string;
  currentOfficerId: string | null;
};

export type AssignmentDecision =
  | { loanId: string; officerId: string; kind: "KEPT" }
  | { loanId: string; officerId: string; kind: "NEW" | "MOVED"; previousOfficerId: string | null };

export type UnassignedLoan = { loanId: string; reason: "NO_OFFICER_FOR_PINCODE" };

export type AssignmentResult = {
  assigned: AssignmentDecision[];
  unassigned: UnassignedLoan[];
  loadByOfficer: Map<string, number>;
};

export function assignLoans(
  loans: readonly LoanToAssign[],
  officers: readonly OfficerTerritory[],
): AssignmentResult {
  const coverage = new Map<string, string[]>();
  for (const o of [...officers].sort((a, b) => a.officerId.localeCompare(b.officerId))) {
    for (const pin of o.pincodes) {
      const list = coverage.get(pin) ?? [];
      list.push(o.officerId);
      coverage.set(pin, list);
    }
  }

  const load = new Map<string, number>(officers.map((o) => [o.officerId, 0]));
  const assigned: AssignmentDecision[] = [];
  const unassigned: UnassignedLoan[] = [];
  const pending: LoanToAssign[] = [];

  // Pass 1: continuity.
  for (const loan of loans) {
    const covering = coverage.get(loan.pincode) ?? [];
    if (loan.currentOfficerId && covering.includes(loan.currentOfficerId)) {
      assigned.push({ loanId: loan.loanId, officerId: loan.currentOfficerId, kind: "KEPT" });
      load.set(loan.currentOfficerId, (load.get(loan.currentOfficerId) ?? 0) + 1);
    } else {
      pending.push(loan);
    }
  }

  // Pass 2: least-loaded covering officer. Sorted by loan id for determinism.
  for (const loan of pending.sort((a, b) => a.loanId.localeCompare(b.loanId))) {
    const covering = coverage.get(loan.pincode) ?? [];
    if (covering.length === 0) {
      unassigned.push({ loanId: loan.loanId, reason: "NO_OFFICER_FOR_PINCODE" });
      continue;
    }
    let best = covering[0] as string;
    for (const id of covering) {
      if ((load.get(id) ?? 0) < (load.get(best) ?? 0)) best = id;
    }
    load.set(best, (load.get(best) ?? 0) + 1);
    assigned.push({
      loanId: loan.loanId,
      officerId: best,
      kind: loan.currentOfficerId ? "MOVED" : "NEW",
      previousOfficerId: loan.currentOfficerId,
    });
  }

  return { assigned, unassigned, loadByOfficer: load };
}
