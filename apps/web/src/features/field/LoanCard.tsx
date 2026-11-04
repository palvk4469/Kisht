"use client";

import type { TodayItem } from "@kisht/contracts";
import { istDayOf } from "@kisht/domain";
import { ChevronRight, HandCoins, History } from "lucide-react";
import Link from "next/link";
import { Badge, cx } from "@/components/ui";
import { rupees, shortDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import type { FieldItem } from "../offline/overlay";
import { ContactActions } from "./ContactActions";
import { useReasonText } from "./useReasonText";

/** A query string, not a path segment, so one cached page serves every loan offline. */
export const loanHref = (loanId: string) => `/today/loan?id=${encodeURIComponent(loanId)}`;

/** Red at the edge of the roll or past it: the colour says where to look first. */
export function dpdTone(dpd: number): "risk" | "warn" | "neutral" {
  if (dpd >= 25) return "risk";
  if (dpd >= 11) return "warn";
  return "neutral";
}

export function DpdBadge({ dpd }: { dpd: number }) {
  const { t } = useI18n();
  return (
    <Badge tone={dpdTone(dpd)}>
      {t("today.dpd", { n: dpd, days: dpd === 1 ? "day" : "days" })}
    </Badge>
  );
}

export function PromiseBadge({ promise }: { promise: TodayItem["promise"] }) {
  const { t, locale } = useI18n();
  if (!promise) return null;
  const date = shortDay(promise.dueDate, locale);
  if (promise.status === "PENDING") {
    return promise.dueDate < istDayOf(new Date()) ? (
      <Badge tone="warn">{t("promise.overdue", { date })}</Badge>
    ) : (
      <Badge tone="accent">{t("promise.due", { date })}</Badge>
    );
  }
  return <Badge tone="risk">{t("promise.broken", { date })}</Badge>;
}

type Clock = { now: Date; nextAllowedAt: Date };

export function LoanCard({ item, rank, clock }: { item: FieldItem; rank: number; clock: Clock }) {
  const { t } = useI18n();
  const reasonText = useReasonText();
  const topReason = item.priority?.reasons[0];
  return (
    <li className="rounded-card border border-line bg-canvas">
      <Link href={loanHref(item.loanId)} className="block p-4 pb-3" data-testid="loan-card">
        <div className="flex items-start gap-3">
          <span className="num mt-0.5 w-5 shrink-0 text-sm text-faint">{rank}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="font-semibold">{item.borrowerName}</h3>
              <ChevronRight className="mt-0.5 size-4 shrink-0 text-faint" aria-hidden />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="num font-medium">{rupees(item.outstanding)}</span>
              <DpdBadge dpd={item.dpd} />
              <PromiseBadge promise={item.promise} />
            </div>
            {topReason && <p className="mt-2 text-sm text-muted">{reasonText(topReason)}</p>}
            {item.priority?.limitedHistory && (
              <p className="mt-1 text-xs text-faint">{t("today.limitedHistory")}</p>
            )}
          </div>
        </div>
      </Link>
      <div className="px-4 pb-4">
        <ContactActions
          loanId={item.loanId}
          borrowerName={item.borrowerName}
          phone={item.phone}
          address={item.address}
          lat={item.lat}
          lng={item.lng}
          contactPaused={item.contactPaused}
          attemptsToday={item.attemptsToday}
          now={clock.now}
          nextAllowedAt={clock.nextAllowedAt}
        />
      </div>
    </li>
  );
}

const OUTCOME_ICON = { waiting: HandCoins, done: History, paused: History } as const;

/** A quiet row for loans that need nothing right now. */
export function LoanRow({ item }: { item: FieldItem }) {
  const { t } = useI18n();
  const state = item.state === "todo" ? "done" : item.state;
  const Icon = OUTCOME_ICON[state];
  return (
    <li>
      <Link
        href={loanHref(item.loanId)}
        className="flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-surface"
      >
        <Icon className="size-4 shrink-0 text-faint" aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{item.borrowerName}</span>
          <span className={cx("num block text-xs text-muted")}>
            {rupees(item.outstanding)}
            {item.lastOutcome && state === "done" && ` · ${t(`outcome.${item.lastOutcome.type}`)}`}
            {item.unsent && ` · ${t("sync.notSent")}`}
          </span>
        </span>
        <PromiseBadge promise={item.state === "waiting" ? item.promise : null} />
        <ChevronRight className="size-4 shrink-0 text-faint" aria-hidden />
      </Link>
    </li>
  );
}
