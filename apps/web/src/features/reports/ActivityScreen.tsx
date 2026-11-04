"use client";

import type { ActivityEntry, ActivityFilter } from "@kisht/contracts";
import { MapPin, Phone, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";
import { Badge, Card, cx, EmptyState, ErrorState, Skeleton, Stat } from "@/components/ui";
import { LoanLink } from "@/features/manager/LoanView";
import { dateTime, number } from "@/lib/format";
import { type MessageKey, useI18n } from "@/lib/i18n";
import { useActivity } from "./api";

const FILTERS: { value: ActivityFilter; label: MessageKey }[] = [
  { value: "all", label: "activity.all" },
  { value: "check", label: "activity.check" },
  { value: "blocked", label: "activity.blocked" },
];

const BLOCK_LABEL: Record<string, MessageKey> = {
  OUTSIDE_CONTACT_WINDOW: "activity.blockWindow",
  CONTACT_PAUSED: "activity.blockPaused",
  DAILY_ATTEMPT_CAP: "activity.blockCap",
};

const OUTCOME_TONE = {
  PAID: "ok",
  PROMISE: "accent",
  NOT_REACHABLE: "neutral",
  DISPUTE: "risk",
} as const;

function Entry({ e }: { e: ActivityEntry }) {
  const { t, locale } = useI18n();
  const Icon = e.channel === "VISIT" ? MapPin : Phone;
  const hasFix = e.lat !== null && e.lng !== null;
  return (
    <li className="flex flex-wrap items-start gap-x-3 gap-y-1 px-5 py-3 text-sm">
      <Icon
        className="mt-0.5 size-4 shrink-0 text-faint"
        aria-label={t(e.channel === "VISIT" ? "activity.visit" : "activity.call")}
      />
      <div className="min-w-48 flex-1">
        <LoanLink loanId={e.loanId} name={e.borrowerName} className="font-medium" />
        <p className="text-xs text-muted">
          {e.officerName} · {dateTime(e.at, locale)} · {e.loanNo}
        </p>
        {e.note && <p className="mt-0.5 text-muted">“{e.note}”</p>}
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5">
        {!e.allowed && (
          <Badge tone="risk">{t(BLOCK_LABEL[e.blockReason ?? ""] ?? "activity.blocked")}</Badge>
        )}
        {e.outcome && <Badge tone={OUTCOME_TONE[e.outcome]}>{t(`outcome.${e.outcome}`)}</Badge>}
        {e.needsCheck && e.lat === null && <Badge tone="warn">{t("activity.noGps")}</Badge>}
        {e.distanceM !== null &&
          (hasFix ? (
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lng}`}
              target="_blank"
              rel="noreferrer"
              className={cx(
                "num underline underline-offset-2",
                e.needsCheck ? "font-medium text-warn" : "text-muted",
              )}
            >
              {t("activity.fromAddress", { m: number(e.distanceM) })}
            </a>
          ) : null)}
        {e.syncedLate && <Badge>{t("activity.syncedLate")}</Badge>}
        {e.clockSkewed && <Badge tone="warn">{t("activity.wrongClock")}</Badge>}
      </div>
    </li>
  );
}

export function ActivityScreen() {
  const { t } = useI18n();
  const officerSelect = useId();
  const [filter, setFilter] = useState<ActivityFilter>("all");
  const [officerId, setOfficerId] = useState("");
  const query = useActivity(officerId, filter);

  const header = (
    <div>
      <h1 className="text-2xl font-semibold">{t("activity.title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">{t("activity.subtitle")}</p>
    </div>
  );

  if (query.isPending) {
    return (
      <div className="space-y-6" aria-busy>
        {header}
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (query.error) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const { compliance: c, entries, officers } = query.data;
  const blocked = c.blockedWindow30 + c.blockedPaused30 + c.blockedCap30;
  return (
    <div className="space-y-6">
      {header}

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <ShieldCheck
            className={cx(
              "mt-0.5 size-6 shrink-0",
              c.outsideWindowAllowed30 === 0 ? "text-ok" : "text-risk",
            )}
            aria-hidden
          />
          <div>
            <h2 className="font-medium">
              {c.outsideWindowAllowed30 === 0
                ? t("activity.complianceGood")
                : t("activity.complianceBad", { n: number(c.outsideWindowAllowed30) })}
            </h2>
            <p className="text-sm text-muted">{t("activity.complianceHint")}</p>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t("activity.attempts30")} value={number(c.attempts30)} />
          <Stat
            label={t("activity.blocked30")}
            value={number(blocked)}
            hint={t("activity.blockedBreakdown", {
              window: number(c.blockedWindow30),
              paused: number(c.blockedPaused30),
              cap: number(c.blockedCap30),
            })}
          />
          <Stat
            label={t("activity.outside30")}
            value={number(c.outsideWindowAllowed30)}
            tone={c.outsideWindowAllowed30 === 0 ? "ok" : "risk"}
          />
          <Stat
            label={t("activity.skew30")}
            value={number(c.clockSkewed30)}
            hint={t("activity.skewHint")}
          />
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="sr-only">{t("activity.filter")}</legend>
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                aria-pressed={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={cx(
                  "min-h-10 rounded-lg px-3 text-sm",
                  filter === f.value
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
              {officers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>
        {entries.length === 0 ? (
          <EmptyState title={t("activity.empty")} />
        ) : (
          <ul className="divide-y divide-line" data-testid="activity-list">
            {entries.map((e) => (
              <Entry key={e.id} e={e} />
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
