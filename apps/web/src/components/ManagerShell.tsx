"use client";

import type { Me } from "@kisht/contracts";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { DemoClockBar } from "@/features/demo/DemoClockBar";
import { type MessageKey, useI18n } from "@/lib/i18n";
import { AppHeader } from "./AppHeader";
import { useSignOut } from "./useSignOut";

// Only screens that exist are linked: no dead buttons.
const NAV: { href: string; label: MessageKey }[] = [
  { href: "/manager/dashboard", label: "nav.dashboard" },
  { href: "/manager/lists", label: "nav.lists" },
  { href: "/manager/promises", label: "nav.promises" },
  { href: "/manager/activity", label: "nav.activity" },
  { href: "/manager/import", label: "nav.import" },
];

export function ManagerShell({ me, children }: { me: Me; children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const signOut = useSignOut(me.id);
  return (
    <div className="min-h-dvh bg-surface">
      <AppHeader
        me={me}
        navOnPhone
        onSignOut={() => void signOut()}
        nav={NAV.map((item) => ({
          href: item.href,
          label: t(item.label),
          current: pathname.startsWith(item.href),
        }))}
      />
      <DemoClockBar />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
