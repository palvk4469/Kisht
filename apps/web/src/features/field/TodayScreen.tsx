"use client";

import type { TodayItemState } from "@kisht/contracts";
import { Clock, ListChecks, PartyPopper } from "lucide-react";
import { Card, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { dateTime, day, number, rupeesShort, time } from "@/lib/format";
import { type MessageKey, useI18n } from "@/lib/i18n";
import { DemoTimeButton } from "../demo/DemoClockBar";
import type { FieldItem } from "../offline/overlay";
import { useToday } from "./api";
import { LoanCard, LoanRow } from "./LoanCard";
import { useContactWindow } from "./useContactWindow";

const SECTIONS: { state: TodayItemState; title: MessageKey }[] = [
  { state: "waiting", title: "today.section.waiting" },
  { state: "done", title: "today.section.done" },
  { state: "paused", title: "today.section.paused" },
];

function Loading() {
  return (
    <div className="space-y-3 p-4" aria-busy>
      <Skeleton className="h-20 w-full" />
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-44 w-full" />
      ))}
    </div>
  );
}

export function TodayScreen() {
  const { t, locale } = useI18n();
  const list = useToday();
  const clock = useContactWindow(list.data?.clockOffsetMs);

  if (list.isPending) return <Loading />;
  if (list.error) {
    return (
      <div className="p-4">
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      </div>
    );
  }

  const { items } = list;
  const { beyondCapacity, asOfDate } = list.data.list;
  if (items.length === 0) {
    return (
      <EmptyState
        icon={<ListChecks className="size-8" />}
        title={t("today.emptyTitle")}
        body={t("today.emptyBody")}
      />
    );
  }

  const of = (state: TodayItemState): FieldItem[] => items.filter((i) => i.state === state);
  const todo = of("todo");
  const done = of("done").length;
  const workable = todo.length + done;
  const atStake = todo.reduce((sum, i) => sum + (i.priority?.expectedLoss ?? 0), 0);

  return (
    <div className="pb-8">
      <section className="px-4 pt-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold">{t("today.title")}</h1>
          {asOfDate && <span className="text-xs text-muted">{day(asOfDate, locale)}</span>}
        </div>
        {workable > 0 && (
          <>
            <div className="mt-3 flex items-baseline justify-between text-sm">
              <span className="num text-muted">
                {t("today.progress", { done, total: workable })}
              </span>
              {atStake > 0 && (
                <span className="num text-muted">
                  {t("today.atStake", { amount: rupeesShort(atStake) })}
                </span>
              )}
            </div>
            <div
              className="mt-1.5 h-1.5 rounded-full bg-surface"
              role="progressbar"
              aria-label={t("today.progress", { done, total: workable })}
              aria-valuemin={0}
              aria-valuemax={workable}
              aria-valuenow={done}
            >
              <div
                className="h-1.5 rounded-full bg-accent transition-all"
                style={{ width: `${(done / workable) * 100}%` }}
              />
            </div>
          </>
        )}
      </section>

      {list.data.fromCache && !list.isPlaceholderData && (
        <p className="mx-4 mt-3 text-xs text-muted">
          {t("sync.listFrom", { time: dateTime(new Date(list.data.savedAt), locale) })}
        </p>
      )}

      {!clock.allowed && (
        <div
          className="mx-4 mt-4 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn"
          role="status"
        >
          <p className="flex items-start gap-2 font-medium">
            <Clock className="mt-0.5 size-4 shrink-0" aria-hidden />
            {t("today.closed", { time: time(clock.nextAllowedAt, locale) })}
          </p>
          <p className="mt-1 pl-6">{t("today.closedBody")}</p>
          <DemoTimeButton />
        </div>
      )}

      {todo.length > 0 ? (
        <ol className="mt-4 space-y-3 px-4">
          {todo.map((item, i) => (
            <LoanCard key={item.loanId} item={item} rank={i + 1} clock={clock} />
          ))}
        </ol>
      ) : (
        <EmptyState
          icon={<PartyPopper className="size-8" />}
          title={t("today.allDoneTitle")}
          body={t("today.allDoneBody")}
        />
      )}

      {beyondCapacity > 0 && (
        <p className="num mt-3 px-4 text-center text-sm text-muted">
          {t("today.beyondCapacity", { n: number(beyondCapacity) })}
        </p>
      )}

      {SECTIONS.map(({ state, title }) => {
        const rows = of(state);
        if (rows.length === 0) return null;
        return (
          <div key={state} className="mt-6 px-4">
            <h2 className="text-sm font-medium text-muted">
              {t(title)} <span className="num">({rows.length})</span>
            </h2>
            <Card className="mt-2">
              <ul className="divide-y divide-line">
                {rows.map((item) => (
                  <LoanRow key={item.loanId} item={item} />
                ))}
              </ul>
            </Card>
          </div>
        );
      })}
    </div>
  );
}
