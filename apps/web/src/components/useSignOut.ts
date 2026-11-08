"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { forgetMe } from "@/features/session/api";
import { signOutOfServer } from "@/lib/auth";

export function useSignOut(userId: string) {
  const router = useRouter();
  const queryClient = useQueryClient();
  return async () => {
    try {
      await signOutOfServer();
    } catch {
      // Offline: the server session ends when it expires. The phone forgets now.
    }
    // DPDP: borrower data doesn't stay on a shared phone. Loaded here, not up front, so
    // manager pages skip the storage library; an officer's page already has it.
    await import("@/features/offline/signOutCleanup")
      .then(({ clearCachedData }) => clearCachedData(userId))
      .catch(() => {});
    forgetMe();
    queryClient.clear();
    router.replace("/login");
  };
}
