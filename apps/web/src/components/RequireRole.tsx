"use client";

import type { Me, Role } from "@kisht/contracts";
import type { ReactNode } from "react";
import { useSessionRoute } from "@/features/session/useSessionRoute";
import { ErrorState, Skeleton } from "./ui";

/** Renders children only for the given roles; everyone else is routed home. */
export function RequireRole({
  roles,
  children,
}: {
  roles: Role[];
  children: (me: Me) => ReactNode;
}) {
  const session = useSessionRoute(roles);
  if (session.state === "ready") return <>{children(session.me)}</>;
  if (session.state === "error") {
    return (
      <div className="mx-auto max-w-md p-6">
        <ErrorState error={session.error} onRetry={session.retry} />
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
