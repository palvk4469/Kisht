"use client";

import type { Me } from "@kisht/contracts";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useRef } from "react";
import { useI18n } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeToggle } from "./ThemeToggle";
import { cx } from "./ui";

export type NavItem = { href: string; label: string; current: boolean; badge?: ReactNode };

type Props = {
  me: Me;
  nav: NavItem[];
  /** Officers reach these by thumb at the bottom of a phone instead. */
  navOnPhone: boolean;
  onSignOut: () => void;
};

/** The one header, for every role: the same brand, tabs and controls in the same places. */
export function AppHeader({ me, nav, navOnPhone, onSignOut }: Props) {
  const { t, locale } = useI18n();
  const tabs = useRef<HTMLElement>(null);
  const currentHref = nav.find((item) => item.current)?.href;
  // On a phone the tabs scroll sideways; the current one must never be off-screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the page or tab widths change.
  useEffect(() => {
    tabs.current?.querySelector('[aria-current="page"]')?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [currentHref, locale]);

  const who = (
    <div className="flex flex-col text-left sm:text-right">
      <span className="font-semibold text-ink leading-snug">{me.name}</span>
      <span className="text-[11px] font-medium text-muted">{t(`role.${me.role}`)}</span>
    </div>
  );

  return (
    <header className="sticky top-0 z-20 border-b border-line bg-canvas/90 backdrop-blur-md transition-colors">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-3 px-4 py-2 sm:h-14 sm:flex-nowrap sm:gap-x-4 sm:py-0">
        <Link href="/" className="flex items-center gap-2.5">
          <span className="flex size-8 items-center justify-center rounded-xl bg-accent text-base font-bold text-on-accent shadow-xs">
            क
          </span>
          <div className="hidden sm:flex sm:flex-col leading-none">
            <span className="text-sm font-semibold tracking-tight">{t("app.name")}</span>
            <span className="mt-0.5 text-[10px] text-faint tracking-wider uppercase">
              Collections
            </span>
          </div>
        </Link>
        <div className="min-w-0 text-xs sm:hidden">{who}</div>
        <nav
          ref={tabs}
          className={cx(
            "order-last -mx-1 w-full items-center gap-1 overflow-x-auto pt-1 sm:order-none sm:mx-0 sm:flex sm:w-auto sm:pt-0",
            navOnPhone ? "flex" : "hidden",
          )}
        >
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
        <div className="ml-auto flex items-center gap-1.5">
          <div className="hidden rounded-xl border border-line/60 bg-surface/50 px-2.5 py-1 text-xs md:block">
            {who}
          </div>
          <LanguageToggle />
          <ThemeToggle />
          <button
            type="button"
            onClick={onSignOut}
            aria-label={t("common.signOut")}
            className="inline-flex h-12 items-center gap-1.5 rounded-xl px-3 text-sm text-muted transition-colors hover:bg-surface hover:text-ink sm:h-10"
          >
            <LogOut className="size-4" aria-hidden />
            <span className="hidden sm:inline">{t("common.signOut")}</span>
          </button>
        </div>
      </div>
    </header>
  );
}
