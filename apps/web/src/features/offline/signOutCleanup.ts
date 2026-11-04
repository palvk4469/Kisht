import { db } from "./db";
import { countActions } from "./outbox";

/** Unsent work this user would leave behind on the phone by signing out. */
export const countUnsent = async (userId: string) =>
  countActions(await db.outbox.where({ userId, status: "pending" }).toArray());

/**
 * DPDP: borrower data doesn't outlive the session on a shared phone. The outbox
 * stays: it's the only copy of field work, and goes out at the next sign-in.
 */
export const clearCachedData = (userId: string) => db.today.delete(userId);
