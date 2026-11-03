"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ErrorState, Skeleton } from "@/components/ui";
import { ApiError } from "@/lib/api";
import { homeFor, useMe } from "@/lib/session";

// Sends people to the right home for their role.
export default function Home() {
  const router = useRouter();
  const me = useMe();
  const signedOut = me.error instanceof ApiError && me.error.status === 401;

  useEffect(() => {
    if (me.data) router.replace(homeFor(me.data.role));
    else if (signedOut) router.replace("/login");
  }, [me.data, signedOut, router]);

  if (me.error && !signedOut) {
    return (
      <main className="mx-auto max-w-md p-6">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </main>
    );
  }
  return (
    <main className="mx-auto max-w-md space-y-3 p-6" aria-busy>
      <Skeleton className="h-6 w-40" />
      <Skeleton className="h-24 w-full" />
    </main>
  );
}
