"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./ui";

export type BottomTab = {
  href: string;
  /** Short enough that five fit across the narrowest phone. */
  label: string;
  /** The full name for screen readers, when the short label needs one. */
  fullLabel?: string;
  icon: LucideIcon;
  current: boolean;
  badge?: ReactNode;
};

/** Every tab in view and within a thumb's reach, for phones and tablets of every role. */
export function BottomTabs({ tabs }: { tabs: BottomTab[] }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-10 flex border-t border-line bg-canvas pb-[env(safe-area-inset-bottom)] lg:hidden">
      {tabs.map(({ href, label, fullLabel, icon: Icon, current, badge }) => (
        <Link
          key={href}
          href={href}
          aria-label={fullLabel}
          aria-current={current ? "page" : undefined}
          className={cx(
            "relative flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-xs",
            current ? "font-semibold text-accent" : "text-muted hover:text-ink",
          )}
        >
          <Icon className="size-5" aria-hidden />
          <span className="max-w-full truncate px-0.5">{label}</span>
          {badge}
        </Link>
      ))}
    </nav>
  );
}
