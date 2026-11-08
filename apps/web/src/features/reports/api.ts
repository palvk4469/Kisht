"use client";

import { type ActivityFilter, ActivityLog, Dashboard, ManagerDay } from "@kisht/contracts";
import { useQuery } from "@tanstack/react-query";
import { request } from "@/lib/api";

const reportKeys = {
  all: ["manager", "reports"] as const,
  dashboard: (branchId: string) => [...reportKeys.all, "dashboard", branchId] as const,
  activity: (officerId: string, filter: ActivityFilter) =>
    [...reportKeys.all, "activity", officerId, filter] as const,
  day: () => [...reportKeys.all, "day"] as const,
};

export function useDashboard(branchId: string) {
  return useQuery({
    queryKey: reportKeys.dashboard(branchId),
    // Refetching keeps the current view on screen rather than flashing a skeleton.
    placeholderData: (previous) => previous,
    queryFn: () =>
      request(
        `/api/manager/dashboard${branchId ? `?branchId=${encodeURIComponent(branchId)}` : ""}`,
        {
          schema: Dashboard,
        },
      ),
  });
}

export function useActivity(officerId: string, filter: ActivityFilter) {
  return useQuery({
    queryKey: reportKeys.activity(officerId, filter),
    placeholderData: (previous) => previous,
    queryFn: () => {
      const q = new URLSearchParams({ filter });
      if (officerId) q.set("officerId", officerId);
      return request(`/api/manager/activity?${q}`, { schema: ActivityLog });
    },
  });
}

const DAY_REFRESH_MS = 60_000;

/** Each officer's day so far; refreshed so the evening view keeps up with syncs. */
export function useManagerDay() {
  return useQuery({
    queryKey: reportKeys.day(),
    refetchInterval: DAY_REFRESH_MS,
    queryFn: () => request("/api/manager/day", { schema: ManagerDay }),
  });
}
