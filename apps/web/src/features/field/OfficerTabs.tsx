"use client";

import { istDayOf } from "@kisht/domain";
import { CalendarClock, ListChecks } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useToday } from "./api";

/** Within a thumb's reach: the day's list, and the promises to follow up. */
export function OfficerTabs() {
  const { t } = useI18n();
  const pathname = usePathname();
  const { items, data } = useToday();
  const today = istDayOf(new Date(Date.now() + (data?.clockOffsetMs ?? 0)));
  const dueNow = items.filter(
    (i) => i.promise?.status === "PENDING" && i.promise.dueDate <= today && i.state !== "done",
  ).length;
  const onPromises = pathname.startsWith("/today/promises");
  const tab = "relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs";
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 mx-auto flex max-w-md border-t border-line bg-canvas">
      <Link
        href="/today"
        aria-current={!onPromises ? "page" : undefined}
        className={cx(tab, !onPromises ? "font-medium text-accent" : "text-muted")}
      >
        <ListChecks className="size-5" aria-hidden />
        {t("tabs.list")}
      </Link>
      <Link
        href="/today/promises"
        aria-current={onPromises ? "page" : undefined}
        className={cx(tab, onPromises ? "font-medium text-accent" : "text-muted")}
      >
        <CalendarClock className="size-5" aria-hidden />
        {t("tabs.promises")}
        {dueNow > 0 && (
          <span className="num absolute top-1.5 left-1/2 ml-2 min-w-5 rounded-full bg-risk px-1 text-center text-[11px] leading-5 text-on-accent">
            {dueNow}
          </span>
        )}
      </Link>
    </nav>
  );
}
