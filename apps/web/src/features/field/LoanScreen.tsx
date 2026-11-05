"use client";

import type { OutcomeType } from "@kisht/contracts";
import { ArrowLeft, Ban, CalendarClock, HandCoins, PhoneOff } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, Card, cx, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { dateTime, rupees, time } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { DemoTimeButton } from "../demo/DemoClockBar";
import { useToday } from "./api";
import { ContactActions } from "./ContactActions";
import { DpdBadge, dpdTone, PromiseBadge } from "./LoanCard";
import { OutcomeSheet } from "./OutcomeSheet";
import { useContactWindow } from "./useContactWindow";
import { useReasonText } from "./useReasonText";

const OUTCOMES: { type: OutcomeType; icon: typeof HandCoins; className: string }[] = [
  { type: "PAID", icon: HandCoins, className: "text-ok" },
  { type: "PROMISE", icon: CalendarClock, className: "text-accent" },
  { type: "NOT_REACHABLE", icon: PhoneOff, className: "text-muted" },
  { type: "DISPUTE", icon: Ban, className: "text-risk" },
];

const OUTCOME_TONE = {
  PAID: "ok",
  PROMISE: "accent",
  NOT_REACHABLE: "neutral",
  DISPUTE: "risk",
} as const;

const percent = (p: number) => `${Math.round(p * 100)}%`;

export function LoanScreen({ loanId }: { loanId: string }) {
  const { t, locale } = useI18n();
  const query = useToday();
  const clock = useContactWindow(query.data?.clockOffsetMs);
  const reasonText = useReasonText();
  const [sheet, setSheet] = useState<OutcomeType | null>(null);

  const back = (
    <Link
      href="/today"
      className="inline-flex min-h-12 items-center gap-1.5 px-4 text-sm text-muted"
    >
      <ArrowLeft className="size-4" aria-hidden />
      {t("loan.back")}
    </Link>
  );

  if (query.isPending) {
    return (
      <div className="space-y-3 p-4" aria-busy>
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (query.error) {
    return (
      <div>
        {back}
        <div className="px-4">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      </div>
    );
  }

  // The whole day is one payload, so this works with no signal (D22).
  const loan = query.items.find((i) => i.loanId === loanId);
  if (!loan) {
    return (
      <div>
        {back}
        <EmptyState title={t("loan.notFound")} />
      </div>
    );
  }
  const { outstanding, dpd } = loan;
  const score = loan.priority;
  // A call inside the window can be logged after it closes (D9).
  const canLog = !loan.contactPaused && (clock.allowed || loan.openAttemptClientId !== null);

  return (
    <div className="pb-8">
      {back}
      <section className="px-4">
        <h1 className="text-xl font-semibold">{loan.borrowerName}</h1>
        <p className="mt-0.5 text-sm text-muted">
          {loan.loanNo} · {loan.address}
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <DpdBadge dpd={dpd} />
          <PromiseBadge promise={loan.promise} />
        </div>
        {loan.managerNote && (
          <p className="mt-2 text-sm text-accent">
            {t("loan.managerNote", { note: loan.managerNote })}
          </p>
        )}
        <dl className="mt-4 grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-surface px-3 py-2.5">
            <dt className="text-xs text-muted">{t("loan.outstanding")}</dt>
            <dd className="num mt-0.5 font-semibold">{rupees(outstanding)}</dd>
          </div>
          <div className="rounded-xl bg-surface px-3 py-2.5">
            <dt className="text-xs text-muted">{t("loan.overdue")}</dt>
            <dd
              className={cx(
                "num mt-0.5 font-semibold",
                dpdTone(dpd) === "risk" && "text-risk",
                dpdTone(dpd) === "warn" && "text-warn",
              )}
            >
              {dpd}
            </dd>
          </div>
          <div className="rounded-xl bg-surface px-3 py-2.5">
            <dt className="text-xs text-muted">{t("loan.emi")}</dt>
            <dd className="num mt-0.5 font-semibold">{rupees(loan.emiAmount)}</dd>
          </div>
        </dl>
      </section>

      <section className="mt-4 px-4">
        <ContactActions
          loanId={loan.loanId}
          borrowerName={loan.borrowerName}
          phone={loan.phone}
          address={loan.address}
          lat={loan.lat}
          lng={loan.lng}
          contactPaused={loan.contactPaused}
          attemptsToday={loan.attemptsToday}
          now={clock.now}
          nextAllowedAt={clock.nextAllowedAt}
          withReminder
        />
      </section>

      <section className="mt-6 px-4">
        <h2 className="font-medium">{t("loan.whatHappened")}</h2>
        {loan.contactPaused ? (
          <p role="status" className="mt-2 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
            {t("loan.pausedLog")}
          </p>
        ) : canLog ? (
          <div className="mt-2 grid grid-cols-2 gap-2">
            {OUTCOMES.map(({ type, icon: Icon, className }) => (
              <button
                key={type}
                type="button"
                onClick={() => setSheet(type)}
                className="flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border border-line px-2 font-medium hover:bg-surface"
              >
                <Icon className={cx("size-6", className)} aria-hidden />
                {t(`outcome.${type}`)}
              </button>
            ))}
          </div>
        ) : (
          <div role="status" className="mt-2 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
            <p>{t("loan.closedLog", { time: time(clock.nextAllowedAt, locale) })}</p>
            <DemoTimeButton />
          </div>
        )}
      </section>

      <section className="mt-6 px-4">
        <Card className="p-4">
          <h2 className="font-medium">{t("loan.why")}</h2>
          {score ? (
            <>
              <ul className="mt-2 space-y-1.5 text-sm">
                {score.reasons.map((r) => (
                  <li key={r.code} className="flex gap-2">
                    <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-accent" />
                    {reasonText(r)}
                  </li>
                ))}
              </ul>
              {score.limitedHistory && (
                <p className="mt-2 text-sm text-muted">{t("today.limitedHistory")}</p>
              )}
              <p className="num mt-3 border-t border-line pt-3 text-xs text-muted">
                {t(dpd > 30 ? "loan.mathsPast" : "loan.maths", {
                  chance: percent(dpd > 30 ? 1 - score.probability : score.probability),
                  amount: rupees(outstanding),
                  stake: rupees(score.expectedLoss),
                })}
              </p>
              <p className="mt-1 text-xs text-faint">{t("loan.advisory")}</p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted">{t("loan.noScore")}</p>
          )}
        </Card>
      </section>

      <section className="mt-6 px-4">
        <h2 className="font-medium">{t("loan.history")}</h2>
        {loan.history.length === 0 ? (
          <p className="mt-2 text-sm text-muted">{t("loan.historyEmpty")}</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {loan.history.map((h) => (
              <li key={h.id} className="text-sm">
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={OUTCOME_TONE[h.type]}>{t(`outcome.${h.type}`)}</Badge>
                  <span className="text-xs text-muted">
                    {h.unsent ? t("sync.notSent") : dateTime(h.at, locale)}
                  </span>
                </div>
                {(h.amount !== null || h.note) && (
                  <p className="mt-1 text-muted">
                    {h.amount !== null && <span className="num">{rupees(h.amount)}</span>}
                    {h.amount !== null && h.note && " · "}
                    {h.note}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {sheet && (
        <OutcomeSheet
          type={sheet}
          loanId={loan.loanId}
          borrowerName={loan.borrowerName}
          emiAmount={loan.emiAmount}
          openAttemptClientId={loan.openAttemptClientId}
          now={clock.now}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}
