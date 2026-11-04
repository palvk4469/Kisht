"use client";

import {
  type ClearPinBody,
  ManagerBoard,
  type MoveLoanBody,
  Ok,
  type PromiseFilter,
  PromiseTracker,
  type ReassignBody,
} from "@kisht/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api";

const managerKeys = {
  all: ["manager"] as const,
  board: () => [...managerKeys.all, "board"] as const,
  promises: (status: PromiseFilter, officerId: string) =>
    [...managerKeys.all, "promises", status, officerId] as const,
};

export function useBoard() {
  return useQuery({
    queryKey: managerKeys.board(),
    queryFn: () => request("/api/manager/board", { schema: ManagerBoard }),
  });
}

export function usePromiseTracker(status: PromiseFilter, officerId: string) {
  return useQuery({
    queryKey: managerKeys.promises(status, officerId),
    placeholderData: (previous) => previous,
    queryFn: () => {
      const q = new URLSearchParams({ status });
      if (officerId) q.set("officerId", officerId);
      return request(`/api/manager/promises?${q}`, { schema: PromiseTracker });
    },
  });
}

function useManagerAction<V>(call: (vars: V) => Promise<unknown>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: call,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: managerKeys.all }),
  });
}

const post = (url: string, body: unknown) => request(url, { method: "POST", body, schema: Ok });
const officerPath = (id: string) => `/api/manager/lists/${encodeURIComponent(id)}`;

export const useMoveLoan = () =>
  useManagerAction((v: MoveLoanBody & { officerId: string }) =>
    post(`${officerPath(v.officerId)}/move`, {
      loanId: v.loanId,
      position: v.position,
      reason: v.reason,
    }),
  );

export const useUnpin = () =>
  useManagerAction((v: ClearPinBody & { officerId: string }) =>
    post(`${officerPath(v.officerId)}/unpin`, { loanId: v.loanId }),
  );

export const useReassign = () =>
  useManagerAction((v: ReassignBody) => post("/api/manager/assignments", v));

export const useClearDispute = () =>
  useManagerAction((v: { loanId: string; note: string }) =>
    post(`/api/manager/disputes/${encodeURIComponent(v.loanId)}/clear`, { note: v.note }),
  );
