"use client";

import {
  ImportCommitted,
  ImportHistory,
  ImportPreview,
  type ImportPreviewBody,
} from "@kisht/contracts";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { request } from "@/lib/api";

const importKeys = {
  all: ["imports"] as const,
  history: () => [...importKeys.all, "history"] as const,
};

export function useImportHistory() {
  return useQuery({
    queryKey: importKeys.history(),
    queryFn: () => request("/api/imports", { schema: ImportHistory }),
  });
}

export function usePreviewImport() {
  return useMutation({
    mutationFn: (body: ImportPreviewBody) =>
      request("/api/imports", { method: "POST", body, schema: ImportPreview }),
  });
}

export function useCommitImport() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, confirmCured }: { id: string; confirmCured: boolean }) =>
      request(`/api/imports/${encodeURIComponent(id)}/commit`, {
        method: "POST",
        schema: ImportCommitted,
        body: { confirmCured },
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: importKeys.all }),
  });
}
