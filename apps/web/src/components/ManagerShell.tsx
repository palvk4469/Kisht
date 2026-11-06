"use client";

import type { Me } from "@kisht/contracts";
import {
  Activity,
  CalendarClock,
  LayoutDashboard,
  ListOrdered,
  type LucideIcon,
  Upload,
} from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DemoClockBar } from "@/features/demo/DemoClockBar";
import { type MessageKey, useI18n } from "@/lib/i18n";
import { AppHeader } from "./AppHeader";
import { BottomTabs } from "./BottomTabs";
import { useSignOut } from "./useSignOut";

// Only screens that exist are linked: no dead buttons.
const NAV: { href: string; label: MessageKey; short: MessageKey; icon: LucideIcon }[] = [
  {
    href: "/manager/dashboard",
    label: "nav.dashboard",
    short: "tabs.dashboard",
    icon: LayoutDashboard,
  },
  { href: "/manager/lists", label: "nav.lists", short: "tabs.lists", icon: ListOrdered },
  { href: "/manager/promises", label: "nav.promises", short: "tabs.promises", icon: CalendarClock },
  { href: "/manager/activity", label: "nav.activity", short: "tabs.activity", icon: Activity },
  { href: "/manager/import", label: "nav.import", short: "tabs.import", icon: Upload },
];

export function ManagerShell({ me, children }: { me: Me; children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const signOut = useSignOut(me.id);
  return (
    <div className="min-h-dvh bg-surface">
      <AppHeader
        me={me}
        onSignOut={() => void signOut()}
        nav={NAV.map((item) => ({
          href: item.href,
          label: t(item.label),
          current: pathname.startsWith(item.href),
        }))}
      />
      <DemoClockBar />
      {/* Room for the tab bar, so the end of every page can be reached. */}
      <main className="mx-auto max-w-6xl px-4 pt-6 pb-24 sm:pt-8 lg:pb-8">{children}</main>
      <BottomTabs
        tabs={NAV.map((item) => ({
          href: item.href,
          label: t(item.short),
          fullLabel: t(item.label),
          icon: item.icon,
          current: pathname.startsWith(item.href),
        }))}
      />
    </div>
  );
}
