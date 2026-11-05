"use client";

import { istDayOf } from "@kisht/domain";
import { CalendarClock, ListChecks } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/components/AppHeader";
import { cx } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useToday } from "./api";

function DueBadge({ count, className }: { count: number; className?: string }) {
  if (count === 0) return null;
  return (
    <span
      className={cx(
        "num min-w-5 rounded-full bg-risk px-1 text-center text-[11px] font-semibold leading-5 text-on-accent",
        className,
      )}
    >
      {count}
    </span>
  );
}

function usePromisesDue() {
  const { items, data } = useToday();
  const today = istDayOf(new Date(Date.now() + (data?.clockOffsetMs ?? 0)));
  return items.filter(
    (i) => i.promise?.status === "PENDING" && i.promise.dueDate <= today && i.state !== "done",
  ).length;
}

/** The header's tabs, on anything larger than a phone. */
export function useOfficerNav(): NavItem[] {
  const { t } = useI18n();
  const onPromises = usePathname().startsWith("/today/promises");
  const due = usePromisesDue();
  return [
    { href: "/today", label: t("tabs.list"), current: !onPromises },
    {
      href: "/today/promises",
      label: t("tabs.promises"),
      current: onPromises,
      badge: <DueBadge count={due} />,
    },
  ];
}

/** Within a thumb's reach on a phone: the day's list, and the promises to follow up. */
export function OfficerTabs() {
  const { t } = useI18n();
  const onPromises = usePathname().startsWith("/today/promises");
  const due = usePromisesDue();
  const tab = "relative flex h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs";
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 flex border-t border-line/80 bg-canvas/95 backdrop-blur-md shadow-lg sm:hidden">
      <Link
        href="/today"
        aria-current={!onPromises ? "page" : undefined}
        className={cx(tab, !onPromises ? "font-bold text-accent" : "text-muted hover:text-ink")}
      >
        <ListChecks className="size-5" aria-hidden />
        {t("tabs.list")}
      </Link>
      <Link
        href="/today/promises"
        aria-current={onPromises ? "page" : undefined}
        className={cx(tab, onPromises ? "font-bold text-accent" : "text-muted hover:text-ink")}
      >
        <CalendarClock className="size-5" aria-hidden />
        {t("tabs.promises")}
        <DueBadge count={due} className="absolute top-1.5 left-1/2 ml-2" />
      </Link>
    </nav>
  );
}
