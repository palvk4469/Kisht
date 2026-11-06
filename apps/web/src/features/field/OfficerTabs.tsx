"use client";

import { istDayOf } from "@kisht/domain";
import { CalendarClock, ListChecks } from "lucide-react";
import { usePathname } from "next/navigation";
import type { NavItem } from "@/components/AppHeader";
import { BottomTabs } from "@/components/BottomTabs";
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

/** The header's tabs, on a laptop or larger. */
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

/** Within a thumb's reach: the day's list, and the promises to follow up. */
export function OfficerTabs() {
  const { t } = useI18n();
  const onPromises = usePathname().startsWith("/today/promises");
  const due = usePromisesDue();
  return (
    <BottomTabs
      tabs={[
        { href: "/today", label: t("tabs.list"), icon: ListChecks, current: !onPromises },
        {
          href: "/today/promises",
          label: t("tabs.promises"),
          icon: CalendarClock,
          current: onPromises,
          badge: <DueBadge count={due} className="absolute top-1.5 left-1/2 ml-2" />,
        },
      ]}
    />
  );
}
