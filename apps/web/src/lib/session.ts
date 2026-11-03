"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError, api } from "./api";

export type Role = "OFFICER" | "BRANCH_MANAGER" | "HEAD";

export type Me = {
  id: string;
  name: string;
  email: string;
  role: Role;
  branchId: string | null;
  locale: "hi" | "en";
};

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => api<Me>("/api/me"),
    // A 401 is an answer ("signed out"), not a failure worth retrying.
    retry: (count, err) => !(err instanceof ApiError && err.status === 401) && count < 2,
    staleTime: 5 * 60_000,
  });
}

export function homeFor(role: Role): string {
  return role === "OFFICER" ? "/today" : "/manager/import";
}
