"use client";

import { History } from "lucide-react";
import { useState } from "react";
import { Badge, Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { dateTime, day, number } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useImportHistory } from "./api";

const STATUS_TONE = {
  PREVIEW: "neutral",
  COMMITTED: "ok",
  SUPERSEDED: "warn",
  FAILED: "risk",
} as const;

const HISTORY_PREVIEW = 7;

export function ImportHistory() {
  const { t, locale } = useI18n();
  const query = useImportHistory();
  const [showAll, setShowAll] = useState(false);
  const items = query.data ?? [];
  const visible = showAll ? items : items.slice(0, HISTORY_PREVIEW);
  return (
    <Card className="shadow-xs">
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <History className="size-4 text-accent" aria-hidden />
        <h2 className="font-semibold text-ink tracking-tight">{t("import.history")}</h2>
      </div>
      {query.isPending ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : query.error ? (
        <div className="p-5">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={t("import.historyEmpty")} />
      ) : (
        <>
          {/* Phones: a stacked list, no sideways scrolling. */}
          <ul className="divide-y divide-line sm:hidden">
            {visible.map((b) => (
              <li key={b.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{day(b.asOfDate, locale)}</span>
                  <Badge tone={STATUS_TONE[b.status]}>{t(`import.status.${b.status}`)}</Badge>
                </div>
                <div className="mt-1 flex justify-between gap-3 text-sm text-muted">
                  <span className="truncate">{b.uploadedBy}</span>
                  <span className="num shrink-0">
                    {number(b.rowCount)}
                    {b.errorCount > 0 && (
                      <span className="ml-1 text-risk">({number(b.errorCount)})</span>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-left text-sm sm:table">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-5 py-2 font-medium">{t("import.col.date")}</th>
                <th className="px-5 py-2 font-medium">{t("import.col.file")}</th>
                <th className="px-5 py-2 font-medium">{t("import.col.status")}</th>
                <th className="px-5 py-2 text-right font-medium">{t("import.col.rows")}</th>
                <th className="px-5 py-2 font-medium">{t("import.col.by")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap px-5 py-2.5">{day(b.asOfDate, locale)}</td>
                  <td className="max-w-56 truncate px-5 py-2.5 text-muted">{b.fileName}</td>
                  <td className="px-5 py-2.5">
                    <Badge tone={STATUS_TONE[b.status]}>{t(`import.status.${b.status}`)}</Badge>
                  </td>
                  <td className="num px-5 py-2.5 text-right">
                    {number(b.rowCount)}
                    {b.errorCount > 0 && (
                      <span className="ml-1 text-risk">({number(b.errorCount)})</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-muted">
                    {b.uploadedBy} · {dateTime(b.createdAt, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length > HISTORY_PREVIEW && (
            <div className="border-t border-line px-5 py-3">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-sm font-medium text-accent hover:underline"
              >
                {showAll ? t("import.showLess") : t("import.showAll", { n: items.length })}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
