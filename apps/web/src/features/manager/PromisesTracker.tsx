"use client";

import type { PromiseFilter, TrackedPromise, PromiseTracker as Tracker } from "@kisht/contracts";
import { CalendarClock } from "lucide-react";
import { useId, useState } from "react";
import { Badge, Card, cx, EmptyState, ErrorState, Skeleton, Stat } from "@/components/ui";
import { dateTime, number, rupees, shortDay } from "@/lib/format";
import { type MessageKey, useI18n } from "@/lib/i18n";
import { usePromiseTracker } from "./api";
import { LoanLink } from "./LoanView";

const FILTERS: { value: PromiseFilter; label: MessageKey }[] = [
  { value: "open", label: "tracker.open" },
  { value: "broken", label: "tracker.brokenFilter" },
  { value: "kept", label: "tracker.keptFilter" },
  { value: "all", label: "tracker.all" },
];

const STATUS_TONE = {
  PENDING: "accent",
  KEPT: "ok",
  PARTIAL: "warn",
  BROKEN: "risk",
  SUPERSEDED: "neutral",
} as const;
const REMINDER_TONE = {
  QUEUED: "neutral",
  SENT_MOCK: "ok",
  DEFERRED_WINDOW: "warn",
  CANCELLED: "neutral",
} as const;

function PromiseStatus({ promise }: { promise: TrackedPromise }) {
  const { t } = useI18n();
  return <Badge tone={STATUS_TONE[promise.status]}>{t(`tracker.status.${promise.status}`)}</Badge>;
}

function Rows({ promises }: { promises: TrackedPromise[] }) {
  const { t, locale } = useI18n();
  return (
    <>
      <ul className="divide-y divide-line sm:hidden">
        {promises.map((p) => (
          <li key={p.id} className="px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <LoanLink loanId={p.loanId} name={p.borrowerName} className="font-medium" />
              <PromiseStatus promise={p} />
            </div>
            <p className="num mt-1 text-sm text-muted">
              {rupees(p.amount)} · {shortDay(p.dueDate, locale)} ·{" "}
              {p.officerName ?? t("board.noOfficer")}
            </p>
          </li>
        ))}
      </ul>
      <table className="hidden w-full text-left text-sm sm:table">
        <thead className="text-xs text-muted">
          <tr>
            <th className="px-5 py-2 font-medium">{t("tracker.col.borrower")}</th>
            <th className="px-5 py-2 font-medium">{t("tracker.col.officer")}</th>
            <th className="px-5 py-2 text-right font-medium">{t("tracker.col.amount")}</th>
            <th className="px-5 py-2 text-right font-medium">{t("tracker.col.paid")}</th>
            <th className="px-5 py-2 font-medium">{t("tracker.col.due")}</th>
            <th className="px-5 py-2 font-medium">{t("tracker.col.status")}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {promises.map((p) => (
            <tr key={p.id}>
              <td className="px-5 py-2.5">
                <LoanLink loanId={p.loanId} name={p.borrowerName} className="font-medium" />
                <span className="block text-xs text-muted">{p.loanNo}</span>
              </td>
              <td className="px-5 py-2.5 text-muted">{p.officerName ?? t("board.noOfficer")}</td>
              <td className="num px-5 py-2.5 text-right">{rupees(p.amount)}</td>
              <td className="num px-5 py-2.5 text-right text-muted">
                {p.paidAmount > 0 ? rupees(p.paidAmount) : "–"}
              </td>
              <td className="whitespace-nowrap px-5 py-2.5">{shortDay(p.dueDate, locale)}</td>
              <td className="px-5 py-2.5">
                <PromiseStatus promise={p} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function ReminderLog({ reminders }: { reminders: Tracker["reminders"] }) {
  const { t, locale } = useI18n();
  return (
    <Card>
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-medium">{t("tracker.reminders")}</h2>
        <p className="text-sm text-muted">{t("tracker.remindersHint")}</p>
      </div>
      {reminders.length === 0 ? (
        <EmptyState title={t("tracker.remindersEmpty")} />
      ) : (
        <ul className="divide-y divide-line">
          {reminders.map((r) => (
            <li key={r.id} className="px-5 py-3 text-sm">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="flex flex-wrap items-center gap-2">
                  <Badge tone={REMINDER_TONE[r.status]}>{t(`tracker.reminder.${r.status}`)}</Badge>
                  <span className="text-muted">
                    {t(`tracker.recipient.${r.recipient}`)} · {r.loanNo}
                  </span>
                </span>
                <span className="text-xs text-muted">
                  {dateTime(r.sentAt ?? r.scheduledFor, locale)}
                </span>
              </div>
              <p className="mt-1">{r.body}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function PromisesTracker() {
  const { t } = useI18n();
  const officerSelect = useId();
  const [status, setStatus] = useState<PromiseFilter>("open");
  const [officerId, setOfficerId] = useState("");
  const query = usePromiseTracker(status, officerId);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("tracker.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("tracker.subtitle")}</p>
      </div>

      {query.isPending ? (
        <div className="space-y-4" aria-busy>
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : query.error ? (
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <>
          <Card className="grid grid-cols-2 gap-3 p-3 lg:grid-cols-4">
            <Stat
              label={t("tracker.dueToday")}
              value={number(query.data.summary.dueToday)}
              tone="accent"
            />
            <Stat label={t("tracker.upcoming")} value={number(query.data.summary.upcoming)} />
            <Stat
              label={t("tracker.kept30")}
              value={number(query.data.summary.keptLast30)}
              tone="ok"
              hint={t("tracker.keptRate", {
                n: Math.round(
                  (query.data.summary.keptLast30 /
                    Math.max(1, query.data.summary.keptLast30 + query.data.summary.brokenLast30)) *
                    100,
                ),
              })}
            />
            <Stat
              label={t("tracker.broken30")}
              value={number(query.data.summary.brokenLast30)}
              tone="risk"
            />
          </Card>

          <Card>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
              <fieldset className="flex flex-wrap gap-1.5">
                <legend className="sr-only">{t("tracker.col.status")}</legend>
                {FILTERS.map((f) => (
                  <button
                    key={f.value}
                    type="button"
                    aria-pressed={status === f.value}
                    onClick={() => setStatus(f.value)}
                    className={cx(
                      "min-h-10 rounded-lg px-3 text-sm",
                      status === f.value
                        ? "bg-accent-soft font-medium text-accent"
                        : "text-muted hover:bg-surface",
                    )}
                  >
                    {t(f.label)}
                  </button>
                ))}
              </fieldset>
              <div>
                <label htmlFor={officerSelect} className="sr-only">
                  {t("board.officer")}
                </label>
                <select
                  id={officerSelect}
                  value={officerId}
                  onChange={(e) => setOfficerId(e.target.value)}
                  className="h-10 rounded-lg border border-line bg-canvas px-2 text-sm"
                >
                  <option value="">{t("tracker.allOfficers")}</option>
                  {query.data.officers.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            {query.data.promises.length === 0 ? (
              <EmptyState icon={<CalendarClock className="size-8" />} title={t("tracker.empty")} />
            ) : (
              <Rows promises={query.data.promises} />
            )}
          </Card>

          <ReminderLog reminders={query.data.reminders} />
        </>
      )}
    </div>
  );
}
