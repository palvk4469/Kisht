import type { Prisma } from "@kisht/db";
import { HttpError } from "../../http/errors.js";
import type { AuthUser } from "../../http/guards.js";

// The one place that decides what a user may see (D6). Every query that
// touches loans, officers or import batches takes its `where` from here, so
// access rules can't drift between features. Out-of-scope records are
// indistinguishable from missing ones (404), so ids can't be probed.

export type Scope =
  | { kind: "officer"; officerId: string }
  | { kind: "branches"; branchIds: readonly string[] }
  | { kind: "all" };

/** A scope that can manage branches: branch managers and the head of collections. */
export type ManagerScope = Exclude<Scope, { kind: "officer" }>;

export function scopeOf(user: AuthUser): Scope {
  switch (user.role) {
    case "OFFICER":
      return { kind: "officer", officerId: user.id };
    case "BRANCH_MANAGER":
      // A manager without a branch sees nothing rather than everything.
      return { kind: "branches", branchIds: user.branchId ? [user.branchId] : [] };
    case "HEAD":
      return { kind: "all" };
  }
}

export function managerScope(user: AuthUser): ManagerScope {
  const scope = scopeOf(user);
  if (scope.kind === "officer") throw new HttpError(403, "Not allowed for this role");
  return scope;
}

/** Loans visible to the scope: an officer's current assignments, or whole branches. */
export function loanWhere(scope: Scope): Prisma.LoanWhereInput {
  switch (scope.kind) {
    case "officer":
      return { assignments: { some: { officerId: scope.officerId, endedAt: null } } };
    case "branches":
      return { branchId: { in: [...scope.branchIds] } };
    case "all":
      return {};
  }
}

/** Officers who work in the scope's branches. */
export function officerWhere(scope: ManagerScope): Prisma.UserWhereInput {
  return scope.kind === "all"
    ? { role: "OFFICER" }
    : { role: "OFFICER", branchId: { in: [...scope.branchIds] } };
}

/** Import batches that affect the scope: its own, plus company-wide (head) imports. */
export function batchesAffecting(scope: ManagerScope): Prisma.ImportBatchWhereInput {
  return scope.kind === "all"
    ? {}
    : { OR: [{ branchId: null }, { branchId: { in: [...scope.branchIds] } }] };
}

/** Import batches made for exactly this scope (what a re-upload supersedes). */
export function batchesOwnedBy(scope: ManagerScope): Prisma.ImportBatchWhereInput {
  return scope.kind === "all" ? {} : { branchId: { in: [...scope.branchIds] } };
}

/** The branch an import made in this scope is recorded against (null = all branches). */
export function batchBranchOf(scope: ManagerScope): string | null {
  return scope.kind === "all" ? null : (scope.branchIds[0] ?? null);
}

export function coversBranch(scope: ManagerScope, branchId: string): boolean {
  return scope.kind === "all" || scope.branchIds.includes(branchId);
}
