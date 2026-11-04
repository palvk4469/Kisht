"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useLiveQuery } from "dexie-react-hooks";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { db, type OutboxRow } from "./db";
import { type FlushResult, flush } from "./outbox";

// When to send: the moment something is logged, when signal returns, when the
// app comes back to the foreground, and on a timer. Failed sends back off so a
// dead connection doesn't drain the battery.

const TICK_MS = 60_000;
const BACKOFF_MS = [5_000, 15_000, 60_000];

type Sync = {
  pending: OutboxRow[];
  failed: OutboxRow[];
  /** navigator.onLine lies on weak signal, so a failed send counts as offline too. */
  online: boolean;
  signedOut: boolean;
  syncNow: () => void;
};

const SyncContext = createContext<Sync | null>(null);

export function SyncProvider({ userId, children }: { userId: string; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [lastResult, setLastResult] = useState<FlushResult>("done");
  const [browserOnline, setBrowserOnline] = useState(true);
  const failures = useRef(0);
  const retry = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rows = useLiveQuery(() => db.outbox.where("userId").equals(userId).sortBy("seq"), [userId]);
  const pending = useMemo(() => (rows ?? []).filter((r) => r.status === "pending"), [rows]);
  const failed = useMemo(() => (rows ?? []).filter((r) => r.status === "failed"), [rows]);

  const syncNow = useCallback(() => {
    if (retry.current) clearTimeout(retry.current);
    void flush(userId).then((result) => {
      setLastResult(result);
      if (result === "done") {
        if (failures.current > 0 || lastHadWork.current) {
          void queryClient.invalidateQueries({ queryKey: ["field"] });
        }
        failures.current = 0;
        lastHadWork.current = false;
        return;
      }
      if (result === "signed-out") return;
      lastHadWork.current = true;
      const delay = BACKOFF_MS[Math.min(failures.current, BACKOFF_MS.length - 1)];
      failures.current += 1;
      retry.current = setTimeout(syncNow, delay);
    });
  }, [userId, queryClient]);

  const lastHadWork = useRef(false);

  // Anything newly queued goes out straight away.
  const pendingCount = pending.length;
  useEffect(() => {
    if (pendingCount > 0) {
      lastHadWork.current = true;
      syncNow();
    }
  }, [pendingCount, syncNow]);

  useEffect(() => {
    setBrowserOnline(navigator.onLine);
    const wake = () => {
      setBrowserOnline(navigator.onLine);
      if (navigator.onLine) {
        syncNow();
        void queryClient.invalidateQueries({ queryKey: ["field"] });
      }
    };
    const onVisible = () => document.visibilityState === "visible" && syncNow();
    const timer = setInterval(syncNow, TICK_MS);
    window.addEventListener("online", wake);
    window.addEventListener("offline", wake);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      window.removeEventListener("online", wake);
      window.removeEventListener("offline", wake);
      document.removeEventListener("visibilitychange", onVisible);
      if (retry.current) clearTimeout(retry.current);
    };
  }, [syncNow, queryClient]);

  const value = useMemo<Sync>(
    () => ({
      pending,
      failed,
      online: browserOnline && lastResult !== "offline",
      signedOut: lastResult === "signed-out",
      syncNow,
    }),
    [pending, failed, browserOnline, lastResult, syncNow],
  );
  return <SyncContext.Provider value={value}>{children}</SyncContext.Provider>;
}

export function useSync(): Sync {
  const ctx = useContext(SyncContext);
  if (!ctx) throw new Error("useSync must be used inside SyncProvider");
  return ctx;
}
