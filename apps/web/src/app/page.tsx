"use client";

import { ErrorState, Skeleton } from "@/components/ui";
import { useSessionRoute } from "@/features/session/useSessionRoute";

// Sends everyone to the right home for their role (or to sign-in).
export default function Home() {
  const session = useSessionRoute();
  return (
    <main className="mx-auto max-w-md space-y-3 p-6" aria-busy={session.state === "loading"}>
      {session.state === "error" ? (
        <ErrorState error={session.error} onRetry={session.retry} />
      ) : (
        <>
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full" />
        </>
      )}
    </main>
  );
}
