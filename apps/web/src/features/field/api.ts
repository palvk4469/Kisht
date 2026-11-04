"use client";

import {
  type AttemptEvent,
  type ContactChannel,
  LoanDetail,
  type OutcomeEvent,
  type SyncItemResult,
  SyncResponse,
  TodayList,
} from "@kisht/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api";
import { currentFix } from "./gps";
import { newClientId } from "./ids";

export const fieldKeys = {
  all: ["field"] as const,
  today: () => [...fieldKeys.all, "today"] as const,
  loan: (id: string) => [...fieldKeys.all, "loan", id] as const,
};

const REFRESH_MS = 60_000;

export function useTodayList() {
  return useQuery({
    queryKey: fieldKeys.today(),
    queryFn: () => request("/api/officer/today", { schema: TodayList }),
    refetchInterval: REFRESH_MS,
  });
}

export function useLoan(id: string) {
  return useQuery({
    queryKey: fieldKeys.loan(id),
    queryFn: () => request(`/api/loans/${encodeURIComponent(id)}`, { schema: LoanDetail }),
  });
}

function send(attempts: AttemptEvent[], outcomes: OutcomeEvent[]) {
  return request("/api/sync", {
    method: "POST",
    body: { sentAt: new Date().toISOString(), attempts, outcomes },
    schema: SyncResponse,
  });
}

function attemptEvent(
  loanId: string,
  channel: ContactChannel,
  fix: Awaited<ReturnType<typeof currentFix>>,
) {
  return {
    clientId: newClientId(),
    loanId,
    channel,
    at: new Date().toISOString(),
    ...fix,
  } satisfies AttemptEvent;
}

/** Records a Call or Visit tap, including ones the rules block. */
export function useRecordAttempt() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      loanId: string;
      channel: ContactChannel;
    }): Promise<SyncItemResult | undefined> => {
      // Timestamped at the tap; GPS must not delay the dialler.
      const res = await send(
        [attemptEvent(input.loanId, input.channel, await currentFix(1500))],
        [],
      );
      return res.attempts[0];
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: fieldKeys.all }),
  });
}

export type OutcomeInput = {
  loanId: string;
  /** An allowed attempt already on record today; otherwise this logs a visit too. */
  openAttemptClientId: string | null;
  type: OutcomeEvent["type"];
  amount: number | null;
  promiseDueDate: string | null;
  note: string | null;
};

export function useLogOutcome() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: OutcomeInput): Promise<SyncItemResult | undefined> => {
      const fix = await currentFix();
      const attempt = input.openAttemptClientId ? null : attemptEvent(input.loanId, "VISIT", fix);
      const res = await send(attempt ? [attempt] : [], [
        {
          clientId: newClientId(),
          attemptClientId: input.openAttemptClientId ?? (attempt as AttemptEvent).clientId,
          loanId: input.loanId,
          type: input.type,
          at: new Date().toISOString(),
          amount: input.amount,
          promiseDueDate: input.promiseDueDate,
          note: input.note,
          ...fix,
        },
      ]);
      return res.outcomes[0];
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: fieldKeys.all }),
  });
}
