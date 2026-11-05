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
          className="flex items-center gap-2.5 border-b border-warn/30 bg-warn-soft px-4 py-2.5 text-xs font-semibold text-warn shadow-xs"
        >
          <CloudOff className="size-4 shrink-0" aria-hidden />
          <span>
            {t("sync.offline")}
            {n > 0 && ` ${t("sync.waiting", { n })}`}
          </span>
        </div>
      )}
      {online && n > 0 && !signedOut && (
        <div
          role="status"
          className="flex items-center gap-2.5 border-b border-accent/20 bg-accent-soft px-4 py-2 text-xs font-semibold text-accent shadow-xs"
        >
          <RefreshCw className="size-3.5 shrink-0 animate-spin" aria-hidden />
          {t("sync.sending", { n })}
        </div>
      )}
      {signedOut && (
        <div
          role="alert"
          className="flex items-center gap-2 border-b border-warn/30 bg-warn-soft px-4 py-2.5 text-xs font-medium text-warn shadow-xs"
        >
          <span>{t("sync.signedOut", { n })}</span>
          <Link href="/login" className="font-semibold underline underline-offset-2">
            {t("login.submit")}
          </Link>
        </div>
      )}
      {failed.map((row) => (
        <div
          key={row.clientId}
          role="alert"
          className="flex items-start gap-2.5 border-b border-risk/30 bg-risk-soft px-4 py-2.5 text-xs font-medium text-risk shadow-xs"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="font-semibold">{row.borrowerName}: </span>
            {row.reason ? t(`syncError.${row.reason}`) : t("sync.invalid")}
          </span>
          <button
            type="button"
            aria-label={t("sync.dismiss")}
            onClick={() => row.seq !== undefined && void dismissFailed(row.seq)}
            className="-m-1 inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-risk hover:bg-risk/10"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </>
  );
}
