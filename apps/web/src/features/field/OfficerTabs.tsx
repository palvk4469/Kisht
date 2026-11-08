"use client";

import { istDayOf } from "@kisht/domain";
import { CalendarClock, ClipboardCheck, ListChecks } from "lucide-react";
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
type OfficerTab = "list" | "promises" | "day";

function useCurrentTab(): OfficerTab {
  const path = usePathname();
  if (path.startsWith("/today/promises")) return "promises";
  if (path.startsWith("/today/day")) return "day";
  return "list";
}

export function useOfficerNav(): NavItem[] {
  const { t } = useI18n();
  const tab = useCurrentTab();
  const due = usePromisesDue();
  return [
    { href: "/today", label: t("tabs.list"), current: tab === "list" },
    {
      href: "/today/promises",
      label: t("tabs.promises"),
      current: tab === "promises",
      badge: <DueBadge count={due} />,
    },
    { href: "/today/day", label: t("tabs.day"), current: tab === "day" },
  ];
}

/** Within a thumb's reach: the day's list, the promises to follow up, and the day's summary. */
export function OfficerTabs() {
  const { t } = useI18n();
  const tab = useCurrentTab();
  const due = usePromisesDue();
  return (
    <BottomTabs
      tabs={[
        { href: "/today", label: t("tabs.list"), icon: ListChecks, current: tab === "list" },
        {
          href: "/today/promises",
          label: t("tabs.promises"),
          icon: CalendarClock,
          current: tab === "promises",
          badge: <DueBadge count={due} className="absolute top-1.5 left-1/2 ml-2" />,
        },
        { href: "/today/day", label: t("tabs.day"), icon: ClipboardCheck, current: tab === "day" },
      ]}
    />
  );
}
