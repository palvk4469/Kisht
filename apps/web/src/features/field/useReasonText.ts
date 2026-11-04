"use client";

import type { Reason } from "@kisht/contracts";
import { rupeesShort } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/** The sentence for a model reason, in the officer's language. */
export function useReasonText() {
  const { t } = useI18n();
  return (r: Reason): string => {
    const n = r.value;
    // Hindi ignores these; English needs "1 day", not "1 days".
    const vars = {
      n,
      days: n === 1 ? "day" : "days",
      promises: n === 1 ? "promise" : "promises",
      times: n === 1 ? "time" : "times",
    };
    switch (r.code) {
      case "NEAR_ROLL":
        return t("reason.NEAR_ROLL", vars);
      case "PAST_ROLL":
        return t("reason.PAST_ROLL", vars);
      case "LARGE_OUTSTANDING":
        return t("reason.LARGE_OUTSTANDING", { amount: rupeesShort(r.value) });
      case "NO_RECENT_PAYMENT":
        return t("reason.NO_RECENT_PAYMENT", vars);
      case "OFTEN_OVERDUE":
        return t("reason.OFTEN_OVERDUE", vars);
      case "BROKEN_PROMISES":
        return t("reason.BROKEN_PROMISES", vars);
      case "KEEPS_PROMISES":
        return t("reason.KEEPS_PROMISES", vars);
      case "PROMISE_OPEN":
        if (r.value > 0) return t("reason.PROMISE_SOON", vars);
        return r.value === 0 ? t("reason.PROMISE_TODAY") : t("reason.PROMISE_PAST");
      case "NOT_CONTACTED":
        return t("reason.NOT_CONTACTED", vars);
      case "HARD_TO_REACH":
        return t("reason.HARD_TO_REACH", vars);
    }
  };
}
