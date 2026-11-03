"use client";

import { Me, type Role } from "@kisht/contracts";
import { useQuery } from "@tanstack/react-query";
import { isSignedOut, request } from "@/lib/api";

export const sessionKeys = {
  me: () => ["session", "me"] as const,
};

export const fetchMe = () => request("/api/me", { schema: Me });

export function useMe() {
  return useQuery({
    queryKey: sessionKeys.me(),
    queryFn: fetchMe,
    // A 401 is an answer ("signed out"), not a failure worth retrying.
    retry: (count, err) => !isSignedOut(err) && count < 2,
    staleTime: 5 * 60_000,
  });
}

/** Each role's landing screen. */
export function homeFor(role: Role): string {
  return role === "OFFICER" ? "/today" : "/manager/import";
}
