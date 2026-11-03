"use client";

import { useRouter } from "next/navigation";
import { type ReactNode, useEffect } from "react";
import { ApiError } from "@/lib/api";
import { useDefaultLocale } from "@/lib/i18n";
import { homeFor, type Me, type Role, useMe } from "@/lib/session";
import { ErrorState, Skeleton } from "./ui";

/** Client-side guard. The API enforces access on every request; this only routes people. */
export function RequireRole({
  roles,
  children,
}: {
  roles: Role[];
  children: (me: Me) => ReactNode;
}) {
  const router = useRouter();
  const me = useMe();
  useDefaultLocale(me.data?.locale);

  const signedOut = me.error instanceof ApiError && me.error.status === 401;
  const wrongRole = me.data && !roles.includes(me.data.role);

  useEffect(() => {
    if (signedOut) router.replace("/login");
    else if (wrongRole && me.data) router.replace(homeFor(me.data.role));
  }, [signedOut, wrongRole, me.data, router]);

  if (me.data && !wrongRole) return <>{children(me.data)}</>;
  if (me.error && !signedOut) {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-5xl space-y-4 p-6" aria-busy>
      <Skeleton className="h-8 w-48" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
