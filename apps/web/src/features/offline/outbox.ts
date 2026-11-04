import { SyncResponse } from "@kisht/contracts";
import { ApiError, request } from "@/lib/api";
import { db, type OutboxRow } from "./db";

// Write first, send later. An event is safe the moment it's in IndexedDB;
// sending is a retry loop keyed by client UUID, so the server stores it once
// however many times it arrives (D7).

const BATCH_SIZE = 100;

export type FlushResult = "done" | "offline" | "signed-out" | "error";

export async function enqueue(rows: OutboxRow[]): Promise<number[]> {
  return db.outbox.bulkAdd(rows, { allKeys: true }) as Promise<number[]>;
}

/** Fill in the GPS fix when it arrives, unless the event has already gone. */
export async function attachFix(
  seqs: number[],
  fix: { lat: number | null; lng: number | null; accuracyM: number | null },
) {
  await db.transaction("rw", db.outbox, async () => {
    for (const seq of seqs) {
      await db.outbox
        .where("seq")
        .equals(seq)
        .modify((row) => {
          row.event = { ...row.event, ...fix };
        });
    }
  });
}

const pendingFor = (userId: string) => db.outbox.where({ userId, status: "pending" }).sortBy("seq");

async function sendBatch(rows: OutboxRow[]) {
  const res = await request("/api/sync", {
    method: "POST",
    // The phone's clock now: the server corrects every event by the gap (D20).
    body: {
      sentAt: new Date().toISOString(),
      attempts: rows.flatMap((r) => (r.kind === "attempt" ? [r.event] : [])),
      outcomes: rows.flatMap((r) => (r.kind === "outcome" ? [r.event] : [])),
    },
    schema: SyncResponse,
  });
  const results = new Map([...res.attempts, ...res.outcomes].map((r) => [r.clientId, r]));

  // An attempt with an outcome in this batch speaks through that outcome: one
  // log, one message.
  const answered = new Set(
    rows.flatMap((r) => (r.kind === "outcome" ? [r.event.attemptClientId] : [])),
  );

  await db.transaction("rw", db.outbox, async () => {
    for (const row of rows) {
      const result = results.get(row.clientId);
      if (!result) continue;
      const refused =
        result.status === "rejected" ||
        // A block the phone didn't foresee (its clock was off, or the cap was
        // hit on another device) is news; one it already explained isn't.
        (result.status === "blocked" &&
          row.kind === "attempt" &&
          !row.blockedLocally &&
          !answered.has(row.clientId));
      if (refused) {
        await db.outbox.where("clientId").equals(row.clientId).modify({
          status: "failed",
          reason: result.reason,
        });
      } else {
        await db.outbox.where("clientId").equals(row.clientId).delete();
      }
    }
  });
}

/**
 * How many things the officer did that are still unsent. Logging a visit queues
 * an attempt and an outcome, but that's one action to the person who tapped.
 */
export function countActions(rows: readonly OutboxRow[]): number {
  const answered = new Set(
    rows.flatMap((r) => (r.kind === "outcome" ? [r.event.attemptClientId] : [])),
  );
  return rows.filter((r) => !(r.kind === "attempt" && answered.has(r.clientId))).length;
}

let running: Promise<FlushResult> | null = null;

async function drain(userId: string): Promise<FlushResult> {
  try {
    for (;;) {
      const rows = (await pendingFor(userId)).slice(0, BATCH_SIZE);
      if (rows.length === 0) return "done";
      await sendBatch(rows);
    }
  } catch (err) {
    if (err instanceof ApiError && err.status === 0) return "offline";
    // The queue is kept: it goes out after signing in again.
    if (err instanceof ApiError && err.status === 401) return "signed-out";
    return "error";
  }
}

/** Sends everything pending. One at a time per tab; another tab's run is just waited out. */
export function flush(userId: string): Promise<FlushResult> {
  if (!running) {
    const work =
      "locks" in navigator
        ? (navigator.locks.request("kisht-outbox", () => drain(userId)) as Promise<FlushResult>)
        : drain(userId);
    running = work.finally(() => {
      running = null;
    });
  }
  return running;
}

export function dismissFailed(seq: number) {
  return db.outbox.delete(seq);
}
