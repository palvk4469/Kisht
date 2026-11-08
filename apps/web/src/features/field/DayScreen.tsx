"use client";

import { addDays, istDayOf } from "@kisht/domain";
import { useLiveQuery } from "dexie-react-hooks";
import { Check, CloudOff, Copy, MessageCircle, TriangleAlert } from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, cx, ErrorState, Skeleton, Stat } from "@/components/ui";
import { day, number, rupees } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { db } from "../offline/db";
import { useMe } from "../session/api";
import { useToday } from "./api";
import { shareText, summarizeDay } from "./daySummary";

const buttonLink =
  "inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-accent px-5 text-base font-medium text-on-accent shadow-xs transition-all hover:bg-accent-strong active:scale-[0.98]";

/**
 * The officer's day in one place, and the evening message to the branch: the
 * brief's "start and end the day on WhatsApp", without retyping anything.
 */
export function DayScreen() {
  const { t, locale } = useI18n();
  const me = useMe().data;
  const list = useToday();
  const [copied, setCopied] = useState(false);
  const userId = list.userId;
  const unsent = useLiveQuery(
    () => db.outbox.where({ userId, status: "pending" }).count(),
    [userId],
  );
  const failed = useLiveQuery(
    () => db.outbox.where({ userId, status: "failed" }).count(),
    [userId],
  );

  const offset = list.data?.clockOffsetMs ?? 0;
  const today = istDayOf(new Date(Date.now() + offset));
  const officerName = me?.name ?? "";
  const summary = useMemo(
    () =>
      summarizeDay({
        items: list.items,
        beyondCapacity: list.data?.list.beyondCapacity ?? 0,
        officerName,
        today,
        tomorrow: addDays(today, 1),
        unsent: unsent ?? 0,
        failed: failed ?? 0,
      }),
    [list.items, list.data, officerName, today, unsent, failed],
  );

  if (list.isPending) {
    return (
      <div className="space-y-3 p-4" aria-busy>
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  if (list.error) {
    return (
      <div className="p-4">
        <ErrorState error={list.error} onRetry={() => void list.refetch()} />
      </div>
    );
  }

  const s = summary;
  const message = shareText(s, t, { rupees, officerName, date: day(today, locale) });

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // No clipboard permission: the WhatsApp button still works.
    }
  }

  return (
    <div className="space-y-4 p-4 pb-8">
      <div className="flex items-baseline justify-between">
        <h1 className="text-xl font-semibold sm:text-2xl">{t("day.title")}</h1>
        <span className="text-xs text-muted">{day(today, locale)}</span>
      </div>

      {(s.unsent > 0 || s.failed > 0) && (
        <p
          role="status"
          className={cx(
            "flex items-start gap-2 rounded-xl border px-3 py-2.5 text-sm",
            s.failed > 0
              ? "border-risk/20 bg-risk-soft text-risk"
              : "border-warn/25 bg-warn-soft text-warn",
          )}
        >
          {s.failed > 0 ? (
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          ) : (
            <CloudOff className="mt-0.5 size-4 shrink-0" aria-hidden />
          )}
          {s.failed > 0
            ? t("day.failed", { n: number(s.failed) })
            : t("day.unsent", { n: number(s.unsent) })}
        </p>
      )}

      <Card className="p-4">
        <div className="grid grid-cols-2 gap-3">
          <Stat
            label={t("day.worked")}
            value={t("day.workedValue", {
              worked: number(s.worked),
              total: number(s.worked + s.leftToDo),
            })}
            tone="accent"
          />
          <Stat label={t("day.contacts")} value={number(s.contacts)} />
          <Stat
            label={t("outcome.PAID")}
            value={number(s.outcomes.PAID)}
            hint={
              s.paidRupees > 0 ? t("day.reported", { amount: rupees(s.paidRupees) }) : undefined
            }
            tone={s.outcomes.PAID > 0 ? "ok" : "neutral"}
          />
          <Stat
            label={t("outcome.PROMISE")}
            value={number(s.outcomes.PROMISE)}
            hint={s.promisedRupees > 0 ? rupees(s.promisedRupees) : undefined}
          />
          <Stat label={t("outcome.NOT_REACHABLE")} value={number(s.outcomes.NOT_REACHABLE)} />
          <Stat
            label={t("outcome.DISPUTE")}
            value={number(s.outcomes.DISPUTE)}
            tone={s.outcomes.DISPUTE > 0 ? "risk" : "neutral"}
          />
        </div>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">{t("day.tomorrow")}</h2>
        <ul className="mt-2 space-y-1 text-sm text-muted">
          <li>{t("day.leftToDo", { n: number(s.leftToDo) })}</li>
          <li>
            {s.dueTomorrow.count > 0
              ? t("day.dueTomorrow", {
                  n: number(s.dueTomorrow.count),
                  amount: rupees(s.dueTomorrow.rupees),
                })
              : t("day.noneDueTomorrow")}
          </li>
        </ul>
      </Card>

      <Card className="p-4">
        <h2 className="text-sm font-semibold">{t("day.shareTitleCard")}</h2>
        <pre className="mt-2 rounded-xl bg-surface p-3 font-sans text-sm whitespace-pre-wrap text-ink">
          {message}
        </pre>
        <p className="mt-2 text-xs text-muted">{t("day.privacy")}</p>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(message)}`}
            target="_blank"
            rel="noreferrer"
            className={cx(buttonLink, "sm:flex-1")}
          >
            <MessageCircle className="size-5" aria-hidden />
            {t("day.whatsapp")}
          </a>
          <Button size="lg" variant="secondary" className="sm:flex-1" onClick={() => void copy()}>
            {copied ? (
              <Check className="size-5" aria-hidden />
            ) : (
              <Copy className="size-5" aria-hidden />
            )}
            {copied ? t("day.copied") : t("day.copy")}
          </Button>
        </div>
      </Card>
    </div>
  );
}
