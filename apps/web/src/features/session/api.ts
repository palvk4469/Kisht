"use client";

import { Me, type Role } from "@kisht/contracts";
import { useQuery } from "@tanstack/react-query";
import { ApiError, isSignedOut, request } from "@/lib/api";

export const sessionKeys = {
  me: () => ["session", "me"] as const,
};

const ME_KEY = "kisht.me";

function rememberedMe(): Me | null {
  const raw = window.localStorage.getItem(ME_KEY);
  if (!raw) return null;
  const parsed = Me.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export function forgetMe() {
  window.localStorage.removeItem(ME_KEY);
}

/** Who's signed in. With no signal, the last answer stands: sessions last 30 days. */
export async function fetchMe(): Promise<Me> {
  try {
    const me = await request("/api/me", { schema: Me });
    window.localStorage.setItem(ME_KEY, JSON.stringify(me));
    return me;
  } catch (err) {
    if (isSignedOut(err)) forgetMe();
    const remembered = err instanceof ApiError && err.status === 0 ? rememberedMe() : null;
    if (remembered) return remembered;
    throw err;
  }
}

export function useMe() {
  return useQuery({
    queryKey: sessionKeys.me(),
    queryFn: fetchMe,
    // A 401 is an answer ("signed out"), not a failure worth retrying.
    retry: (count, err) => !isSignedOut(err) && count < 2,
    staleTime: 5 * 60_000,
    networkMode: "always",
  });
}

/** Each role's landing screen. */
export function homeFor(role: Role): string {
  return role === "OFFICER" ? "/today" : "/manager/import";
}
