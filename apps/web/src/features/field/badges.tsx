"use client";

import type { ListChanges, TodayItem } from "@kisht/contracts";
import { istDayOf } from "@kisht/domain";
import { Badge } from "@/components/ui";
import { rupees, shortDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

// Kept apart from the loan card, so manager screens can show them without loading the
// officer's call buttons and offline storage.

export function dpdTone(dpd: number): "risk" | "warn" | "neutral" {
  if (dpd >= 25) return "risk";
  if (dpd >= 11) return "warn";
  return "neutral";
}

export function DpdBadge({ dpd }: { dpd: number }) {
  const { t } = useI18n();
  return (
    <Badge tone={dpdTone(dpd)} dot>
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
      <Badge tone="warn" dot>
        {t("promise.overdue", { date })}
      </Badge>
    ) : (
      <Badge tone="accent" dot>
        {t("promise.due", { date })}
      </Badge>
    );
  }
  return (
    <Badge tone="risk" dot>
      {t("promise.broken", { date })}
    </Badge>
  );
}

/** What changed since the previous list (A32): worth knowing before the first call. */
export function ChangeBadges({ changes }: { changes: ListChanges | undefined }) {
  const { t } = useI18n();
  if (!changes) return null;
  return (
    <>
      {changes.newOverdue && <Badge tone="accent">{t("changes.new")}</Badge>}
      {changes.newToYou && (
        <Badge tone="accent">
          {t(changes.newToYou === "MANUAL" ? "changes.movedToYou" : "changes.newToYou")}
        </Badge>
      )}
      {changes.paid && (
        <Badge tone="ok">
          {changes.paid.amount
            ? t("changes.paid", { amount: rupees(changes.paid.amount) })
            : t("changes.paidNoAmount")}
        </Badge>
      )}
    </>
  );
}
