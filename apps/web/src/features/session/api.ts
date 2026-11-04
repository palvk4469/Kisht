"use client";

import { Me, type Role } from "@kisht/contracts";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { ApiError, isSignedOut, request } from "@/lib/api";

export const sessionKeys = {
  me: () => ["session", "me"] as const,
};

const ME_KEY = "kisht.me";
const FIELD_TIMEOUT_MS = 8000;

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
    const me = await request("/api/me", { schema: Me, timeoutMs: FIELD_TIMEOUT_MS });
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
  // Read after mount, so the first render matches the prerendered page.
  const [remembered, setRemembered] = useState<Me | null>(null);
  useEffect(() => setRemembered(rememberedMe()), []);

  return useQuery({
    // Opens straight away for someone already signed in, then checks.
    placeholderData: remembered ?? undefined,
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
  return role === "OFFICER" ? "/today" : "/manager/dashboard";
}
