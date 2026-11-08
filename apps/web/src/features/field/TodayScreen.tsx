"use client";

import type { TodayItemState } from "@kisht/contracts";
import { istDayOf } from "@kisht/domain";
import { ChevronRight, ClipboardCheck, Clock, Info, ListChecks, PartyPopper } from "lucide-react";
import Link from "next/link";
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
  // Today's import may be late: the officer keeps working, but knows the figures are older (A29).
  const today = istDayOf(new Date(Date.now() + (list.data.clockOffsetMs ?? 0)));
  const oldList = asOfDate !== null && asOfDate < today;
  // After 7 pm (contact next opens on a later IST day), or once the list is done,
  // the next step is the evening round-up.
  const evening = !clock.allowed && istDayOf(clock.nextAllowedAt) > istDayOf(clock.now);
  const dayOver = todo.length === 0 || evening;

  return (
    <div className="pb-8">
      <section className="px-4 pt-4">
        <div className="flex items-baseline justify-between">
          <h1 className="text-xl font-semibold sm:text-2xl">{t("today.title")}</h1>
          {asOfDate && <span className="text-xs text-muted">{day(asOfDate, locale)}</span>}
        </div>
        {workable > 0 && (
          <div className="mt-3">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-medium text-muted">
                {t("today.progress", { done, total: workable })}
              </span>
              {atStake > 0 && (
                <span className="num font-semibold text-ink">
                  {t("today.atStake", { amount: rupeesShort(atStake) })}
                </span>
              )}
            </div>
            <div
              className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-line"
              role="progressbar"
              aria-label={t("today.progress", { done, total: workable })}
              aria-valuemin={0}
              aria-valuemax={workable}
              aria-valuenow={done}
            >
              <div
                className="h-full rounded-full bg-accent transition-all duration-300"
                style={{ width: `${(done / workable) * 100}%` }}
              />
            </div>
          </div>
        )}
      </section>

      {oldList && (
        <p
          role="status"
          className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-line bg-canvas px-3 py-2.5 text-sm text-muted"
        >
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
          {t("today.oldList", { date: day(asOfDate, locale) })}
        </p>
      )}

      {dayOver && (
        <Link
          href="/today/day"
          className="mx-4 mt-3 flex items-center gap-3 rounded-2xl border border-accent/20 bg-accent-soft px-4 py-3 text-sm text-accent shadow-xs"
        >
          <ClipboardCheck className="size-5 shrink-0" aria-hidden />
          <span className="flex-1">
            <span className="block font-semibold">{t("day.promptTitle")}</span>
            <span className="block text-xs text-accent/90">{t("day.promptBody")}</span>
          </span>
          <ChevronRight className="size-4 shrink-0" aria-hidden />
        </Link>
      )}

      {list.data.fromCache && !list.isPlaceholderData && (
        <p className="mx-4 mt-3 text-xs text-muted">
          {t("sync.listFrom", { time: dateTime(new Date(list.data.savedAt), locale) })}
        </p>
      )}

      {!clock.allowed && (
        <div
          className="mx-4 mt-4 rounded-2xl border border-warn/30 bg-warn-soft p-4 text-sm text-warn shadow-xs"
          role="status"
        >
          <div className="flex items-start gap-2.5">
            <Clock className="mt-0.5 size-4.5 shrink-0" aria-hidden />
            <div>
              <p className="font-semibold text-warn">
                {t("today.closed", { time: time(clock.nextAllowedAt, locale) })}
              </p>
              <p className="mt-1 text-xs leading-relaxed text-warn/90">{t("today.closedBody")}</p>
              <DemoTimeButton />
            </div>
          </div>
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
