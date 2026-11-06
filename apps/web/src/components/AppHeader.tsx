"use client";

import type { Me } from "@kisht/contracts";
import { LogOut } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeToggle } from "./ThemeToggle";
import { cx } from "./ui";

export type NavItem = { href: string; label: string; current: boolean; badge?: ReactNode };

type Props = {
  me: Me;
  nav: NavItem[];
  onSignOut: () => void;
};

/** The one header, for every role: the same brand, tabs and controls in the same places. */
export function AppHeader({ me, nav, onSignOut }: Props) {
  const { t } = useI18n();
  const who = (
    <div className="flex flex-col text-left xl:text-right">
      <span className="font-semibold text-ink leading-snug">{me.name}</span>
      <span className="text-[11px] font-medium text-muted">{t(`role.${me.role}`)}</span>
    </div>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur-md transition-colors">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-x-2 px-4 sm:gap-x-3 lg:gap-x-4">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-base font-bold text-on-accent shadow-xs">
            क
          </span>
          <span className="hidden whitespace-nowrap text-sm font-semibold tracking-tight lg:inline">
            {t("app.name")}
          </span>
        </Link>
        <div className="min-w-0 truncate text-xs lg:hidden">{who}</div>
        <nav className="hidden items-center gap-1 lg:flex">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              aria-current={item.current ? "page" : undefined}
              className={cx(
                "flex items-center gap-1.5 whitespace-nowrap rounded-xl px-3 py-1.5 text-sm transition-all",
                item.current
                  ? "border border-accent/20 bg-accent-soft font-semibold text-accent shadow-xs"
                  : "text-muted hover:bg-surface hover:text-ink",
              )}
            >
              {item.label}
              {item.badge}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex shrink-0 items-center sm:gap-1.5">
          <div className="hidden shrink-0 rounded-xl border border-line/60 bg-surface/50 px-2.5 py-1 text-xs xl:block">
            {who}
          </div>
          <LanguageToggle />
          <ThemeToggle />
          <button
            type="button"
            onClick={onSignOut}
            aria-label={t("common.signOut")}
            className="inline-flex h-12 items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 text-sm text-muted transition-colors hover:bg-surface hover:text-ink sm:h-10"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden xl:inline">{t("common.signOut")}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
