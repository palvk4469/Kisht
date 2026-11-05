"use client";

import {
  type ContactChannel,
  type Locale,
  type OutcomeEvent,
  ReminderDraft,
  ReminderSendResult,
  TodayList,
} from "@kisht/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import { useCallback, useMemo } from "react";
import { ApiError, request } from "@/lib/api";
import { CACHE_MAX_AGE_MS, db, type OutboxRow } from "../offline/db";
import { attachFix, enqueue } from "../offline/outbox";
import { applyUnsent } from "../offline/overlay";
import { useMe } from "../session/api";
import { currentFix } from "./gps";
import { newClientId } from "./ids";

const fieldKeys = {
  all: ["field"] as const,
  today: (userId: string) => [...fieldKeys.all, "today", userId] as const,
};

const REFRESH_MS = 60_000;
const FETCH_TIMEOUT_MS = 8000;
/** How long logging waits for a GPS fix before sending without one. */
const GPS_WAIT_MS = 1500;
/** The server gives the AI 10 seconds before it falls back to the approved wording. */
const DRAFT_TIMEOUT_MS = 15_000;

export type LoadedToday = {
  list: TodayList;
  clockOffsetMs: number;
  /** When this copy reached the phone; older than a moment means we're offline. */
  savedAt: number;
  fromCache: boolean;
};

/** The phone's copy of the day, unless it's too old to keep (DPDP). */
async function readCached(userId: string): Promise<LoadedToday | null> {
  const cached = await db.today.get(userId);
  if (!cached) return null;
  if (Date.now() - cached.savedAt > CACHE_MAX_AGE_MS) {
    await db.today.delete(userId);
    return null;
  }
  return { ...cached, fromCache: true };
}

async function loadToday(userId: string): Promise<LoadedToday> {
  try {
    const list = await request("/api/officer/today", {
      schema: TodayList,
      timeoutMs: FETCH_TIMEOUT_MS,
    });
    const savedAt = Date.now();
    const clockOffsetMs = new Date(list.serverTime).getTime() - savedAt;
    await db.today.put({ userId, list, clockOffsetMs, savedAt });
    return { list, clockOffsetMs, savedAt, fromCache: false };
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 0)) throw err;
    const cached = await readCached(userId);
    if (!cached) throw err;
    return cached;
  }
}

/** The officer's day: server's list + cache when offline + what's unsent on this phone. */
export function useToday() {
  const me = useMe().data;
  const userId = me?.id ?? "";
  // Shown at once while the network catches up, however slow it is.
  const saved = useQuery({
    queryKey: [...fieldKeys.today(userId), "saved"],
    queryFn: () => readCached(userId),
    enabled: Boolean(userId),
    networkMode: "always",
    staleTime: Number.POSITIVE_INFINITY,
  });
  const query = useQuery({
    placeholderData: saved.data ?? undefined,
    queryKey: fieldKeys.today(userId),
    queryFn: () => loadToday(userId),
    enabled: Boolean(userId),
    refetchInterval: REFRESH_MS,
    // Runs with no connection, so the cache can answer.
    networkMode: "always",
  });
  const rows = useLiveQuery(
    () => db.outbox.where({ userId, status: "pending" }).sortBy("seq"),
    [userId],
  );
  const items = useMemo(() => {
    if (!query.data) return [];
    const now = new Date(Date.now() + query.data.clockOffsetMs);
    return applyUnsent(query.data.list.items, rows ?? [], now, me?.name ?? "");
  }, [query.data, rows, me?.name]);
  return { ...query, items, userId };
}

type LoanRef = { loanId: string; borrowerName: string };

function rowBase(userId: string, loan: LoanRef) {
  return {
    userId,
    loanId: loan.loanId,
    borrowerName: loan.borrowerName,
    status: "pending" as const,
    reason: null,
  };
}

const NO_FIX = { lat: null, lng: null, accuracyM: null };

function attemptRow(
  userId: string,
  loan: LoanRef,
  channel: ContactChannel,
  blockedLocally: boolean,
): OutboxRow {
  const clientId = newClientId();
  return {
    ...rowBase(userId, loan),
    clientId,
    kind: "attempt",
    blockedLocally,
    event: { clientId, loanId: loan.loanId, channel, at: new Date().toISOString(), ...NO_FIX },
  };
}

export type OutcomeInput = LoanRef & {
  /** An allowed attempt already made today; otherwise this logs a visit too. */
  openAttemptClientId: string | null;
  type: OutcomeEvent["type"];
  amount: number | null;
  promiseDueDate: string | null;
  note: string | null;
};

/**
 * Logging writes to the phone first, timestamped at the tap, so it never waits
 * for signal or GPS. The fix is added if it comes quickly; a denied or slow GPS
 * must not lose the event (managers see "no GPS" instead).
 */
export function useFieldLog() {
  const userId = useMe().data?.id ?? "";

  const save = useCallback(async (rows: OutboxRow[]) => {
    const seqs = await enqueue(rows);
    void currentFix(GPS_WAIT_MS).then((fix) => attachFix(seqs, fix));
  }, []);

  const recordAttempt = useCallback(
    (loan: LoanRef, channel: ContactChannel, blockedLocally: boolean) =>
      save([attemptRow(userId, loan, channel, blockedLocally)]),
    [userId, save],
  );

  const logOutcome = useCallback(
    (input: OutcomeInput) => {
      const visit = input.openAttemptClientId ? null : attemptRow(userId, input, "VISIT", false);
      const clientId = newClientId();
      const outcome: OutboxRow = {
        ...rowBase(userId, input),
        clientId,
        kind: "outcome",
        event: {
          clientId,
          attemptClientId: input.openAttemptClientId ?? (visit as OutboxRow).clientId,
          loanId: input.loanId,
          type: input.type,
          at: new Date().toISOString(),
          amount: input.amount,
          promiseDueDate: input.promiseDueDate,
          note: input.note,
          ...NO_FIX,
        },
      };
      return save(visit ? [visit, outcome] : [outcome]);
    },
    [userId, save],
  );

  return { recordAttempt, logOutcome };
}

/** Lang null means the borrower's preferred language. Needs signal: the server checks every draft. */
export function useReminderDraft(loanId: string, lang: Locale | null) {
  return useQuery({
    queryKey: [...fieldKeys.all, "reminderDraft", loanId, lang],
    queryFn: () =>
      request(`/api/officer/loans/${loanId}/reminder-draft`, {
        method: "POST",
        schema: ReminderDraft,
        body: { lang },
        timeoutMs: DRAFT_TIMEOUT_MS,
      }),
    networkMode: "always",
    retry: false,
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: 0,
  });
}

export function useSendReminder() {
  const queryClient = useQueryClient();
  return useMutation({
    networkMode: "always",
    mutationFn: (draftId: string) =>
      request(`/api/officer/reminder-drafts/${draftId}/send`, {
        method: "POST",
        schema: ReminderSendResult,
        timeoutMs: FETCH_TIMEOUT_MS,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [...fieldKeys.all, "today"] }),
  });
}
