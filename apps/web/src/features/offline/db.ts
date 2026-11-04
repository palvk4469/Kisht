import type { AttemptEvent, OutcomeEvent, SyncReason, TodayList } from "@kisht/contracts";
import Dexie, { type EntityTable } from "dexie";

// What lives on the phone (D7). The outbox is the only copy of unsent work.
// The cached list holds borrower phone numbers, personal data under the DPDP
// Act: it's scoped to one user, cleared on sign-out and expires (CACHE_MAX_AGE).

export type OutboxRow = {
  seq?: number;
  clientId: string;
  userId: string;
  loanId: string;
  /** Shown if the server refuses this later. */
  borrowerName: string;
  /** "pending" waits to send; "failed" was refused, and needs the officer to see why. */
  status: "pending" | "failed";
  reason: SyncReason | null;
} & (
  | { kind: "attempt"; event: AttemptEvent; blockedLocally: boolean }
  | { kind: "outcome"; event: OutcomeEvent }
);

export type CachedToday = {
  userId: string;
  list: TodayList;
  /** Server clock minus this device's clock, measured when the list arrived. */
  clockOffsetMs: number;
  savedAt: number;
};

export const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

class FieldDb extends Dexie {
  outbox!: EntityTable<OutboxRow, "seq">;
  today!: EntityTable<CachedToday, "userId">;

  constructor() {
    super("kisht-field");
    this.version(1).stores({
      outbox: "++seq, &clientId, [userId+status]",
      today: "userId",
    });
  }
}

export const db = new FieldDb();
