"use client";

import { istDayOf } from "@kisht/domain";
import { CalendarClock, ChevronRight } from "lucide-react";
import Link from "next/link";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { rupees, shortDay } from "@/lib/format";
import { type MessageKey, useI18n } from "@/lib/i18n";
import type { FieldItem } from "../offline/overlay";
import { useToday } from "./api";
import { DpdBadge, loanHref } from "./LoanCard";

// Read from the day's payload, so it works with no signal (D22).

const GROUPS: { key: "due" | "upcoming" | "broken"; title: MessageKey }[] = [
  { key: "due", title: "promises.due" },
  { key: "upcoming", title: "promises.upcoming" },
  { key: "broken", title: "promises.broken" },
];

function promiseGroup(item: FieldItem, today: string): "due" | "upcoming" | "broken" | null {
  const p = item.promise;
  if (!p) return null;
  if (p.status === "BROKEN" || p.status === "PARTIAL") return "broken";
  if (p.status !== "PENDING") return null;
  return p.dueDate > today ? "upcoming" : "due";
}

export function PromisesScreen() {
  const { t, locale } = useI18n();
  const query = useToday();

  if (query.isPending) {
    return (
      <div className="space-y-3 p-4" aria-busy>
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }
  if (query.error) {
    return (
      <div className="p-4">
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const today = istDayOf(new Date(Date.now() + query.data.clockOffsetMs));
  const grouped = GROUPS.map((g) => ({
    ...g,
    items: query.items
      .filter((i) => promiseGroup(i, today) === g.key)
      .sort((a, b) => (a.promise?.dueDate ?? "").localeCompare(b.promise?.dueDate ?? "")),
  }));

  return (
    <div className="px-4 pt-4 pb-8">
      <h1 className="text-xl font-semibold sm:text-2xl">{t("promises.title")}</h1>
      {grouped.every((g) => g.items.length === 0) ? (
        <EmptyState
          icon={<CalendarClock className="size-8" />}
          title={t("promises.emptyTitle")}
          body={t("promises.emptyBody")}
        />
      ) : (
        grouped.map(
          ({ key, title, items }) =>
            items.length > 0 && (
              <section key={key} className="mt-5">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-semibold text-muted uppercase tracking-wider">
                    {t(title)}
                  </h2>
                  <span className="num rounded-full border border-line/60 bg-surface px-2 py-0.5 text-[11px] text-muted">
                    {items.length}
                  </span>
                </div>
                <Card className="mt-2.5 overflow-hidden shadow-xs">
                  <ul className="divide-y divide-line">
                    {items.map((item) => (
                      <li key={item.loanId}>
                        <Link
                          href={loanHref(item.loanId)}
                          className="flex min-h-16 items-center gap-3 px-4 py-3 transition-colors hover:bg-surface/80"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-semibold text-ink tracking-tight">
                              {item.borrowerName}
                            </span>
                            <span className="num mt-0.5 block text-xs text-muted">
                              <span className="font-medium text-ink">
                                {rupees(item.promise?.amount ?? 0)}
                              </span>{" "}
                              · {shortDay(item.promise?.dueDate ?? today, locale)}
                              {item.unsent && ` · ${t("sync.notSent")}`}
                            </span>
                          </span>
                          <DpdBadge dpd={item.dpd} />
                          <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
                        </Link>
                      </li>
                    ))}
                  </ul>
                </Card>
              </section>
            ),
        )
      )}
    </div>
  );
}
