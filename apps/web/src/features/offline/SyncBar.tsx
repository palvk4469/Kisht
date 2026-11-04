"use client";

import { AlertTriangle, CloudOff, RefreshCw, X } from "lucide-react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { countActions, dismissFailed } from "./outbox";
import { useSync } from "./SyncProvider";

/**
 * Always says where the officer's work stands. Silent when all is well: every
 * message here means something the officer should know.
 */
export function SyncBar() {
  const { t } = useI18n();
  const { pending, failed, online, signedOut } = useSync();
  const n = countActions(pending);
  return (
    <>
      {!online && (
        <div
          role="status"
          className="flex items-start gap-2 bg-surface px-4 py-2.5 text-sm text-muted"
        >
          <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span>
            {t("sync.offline")}
            {n > 0 && ` ${t("sync.waiting", { n })}`}
          </span>
        </div>
      )}
      {online && n > 0 && !signedOut && (
        <div
          role="status"
          className="flex items-center gap-2 bg-surface px-4 py-2.5 text-sm text-muted"
        >
          <RefreshCw className="size-4 shrink-0 animate-spin" aria-hidden />
          {t("sync.sending", { n })}
        </div>
      )}
      {signedOut && (
        <div role="alert" className="bg-warn-soft px-4 py-2.5 text-sm text-warn">
          {t("sync.signedOut", { n })}{" "}
          <Link href="/login" className="font-medium underline underline-offset-2">
            {t("login.submit")}
          </Link>
        </div>
      )}
      {failed.map((row) => (
        <div
          key={row.clientId}
          role="alert"
          className="flex items-start gap-2 bg-risk-soft px-4 py-2.5 text-sm text-risk"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="font-medium">{row.borrowerName}: </span>
            {row.reason ? t(`syncError.${row.reason}`) : t("common.error")}
          </span>
          <button
            type="button"
            aria-label={t("sync.dismiss")}
            onClick={() => row.seq !== undefined && void dismissFailed(row.seq)}
            className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </>
  );
}
