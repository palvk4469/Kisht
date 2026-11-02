import type { Prisma } from "@kisht/db";
import type { AuthUser } from "./session.js";

// The one place that decides which loans a user may see (D6). Every loan query
// is AND-ed with this, so an out-of-scope loan is indistinguishable from a
// missing one (404), and IDs can't be probed.
export function loanScope(user: AuthUser): Prisma.LoanWhereInput {
  switch (user.role) {
    case "OFFICER":
      return { assignments: { some: { officerId: user.id, endedAt: null } } };
    case "BRANCH_MANAGER":
      // A manager without a branch sees nothing rather than everything.
      return { branchId: user.branchId ?? "__none__" };
    case "HEAD":
      return {};
  }
}
