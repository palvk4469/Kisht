"use client";

import type { Me, Role } from "@kisht/contracts";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { isSignedOut } from "@/lib/api";
import { useDefaultLocale } from "@/lib/i18n";
import { homeFor, useMe } from "./api";

export type SessionRoute =
  | { state: "loading" }
  | { state: "error"; error: unknown; retry: () => void }
  | { state: "ready"; me: Me };

/**
 * Routes people by session: signed out → /login; wrong role for this screen →
 * their own home. With no `roles`, every signed-in user is sent home (the
 * root page). The API enforces access regardless; this only routes (D14).
 */
export function useSessionRoute(roles?: readonly Role[]): SessionRoute {
  const router = useRouter();
  const me = useMe();
  useDefaultLocale(me.data?.locale);

  const signedOut = isSignedOut(me.error);
  const allowed = me.data !== undefined && roles?.includes(me.data.role) === true;

  useEffect(() => {
    if (signedOut) router.replace("/login");
    else if (me.data && !allowed) router.replace(homeFor(me.data.role));
  }, [signedOut, allowed, me.data, router]);

  if (me.data && allowed) return { state: "ready", me: me.data };
  if (me.error && !signedOut)
    return { state: "error", error: me.error, retry: () => void me.refetch() };
  return { state: "loading" };
}
