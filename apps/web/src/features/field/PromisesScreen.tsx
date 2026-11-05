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
                <h2 className="text-sm font-medium text-muted">
                  {t(title)} <span className="num">({items.length})</span>
                </h2>
                <Card className="mt-2">
                  <ul className="divide-y divide-line">
                    {items.map((item) => (
                      <li key={item.loanId}>
                        <Link
                          href={loanHref(item.loanId)}
                          className="flex min-h-16 items-center gap-3 px-4 py-2.5 hover:bg-surface"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block font-medium">{item.borrowerName}</span>
                            <span className="num mt-0.5 block text-sm text-muted">
                              {rupees(item.promise?.amount ?? 0)} ·{" "}
                              {shortDay(item.promise?.dueDate ?? today, locale)}
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
