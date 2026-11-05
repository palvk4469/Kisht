"use client";

import type { Me } from "@kisht/contracts";
import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useEffect, useRef } from "react";
import { DemoClockBar } from "@/features/demo/DemoClockBar";
import { type MessageKey, useI18n } from "@/lib/i18n";
import { LanguageToggle } from "./LanguageToggle";
import { ThemeToggle } from "./ThemeToggle";
import { cx } from "./ui";
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
  const { t, locale } = useI18n();
  const pathname = usePathname();
  const signOut = useSignOut(me.id);
  const nav = useRef<HTMLElement>(null);
  // On a phone the tabs scroll sideways; the current one must never be off-screen.
  // biome-ignore lint/correctness/useExhaustiveDependencies: runs when the page or tab widths change.
  useEffect(() => {
    nav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({
      block: "nearest",
      inline: "nearest",
    });
  }, [pathname, locale]);
  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 px-4 py-2 sm:h-14 sm:flex-nowrap sm:py-0">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-sm text-on-accent">
              क
            </span>
            <span className="hidden sm:inline">{t("app.name")}</span>
          </Link>
          <nav
            ref={nav}
            className="order-last -mx-1 flex w-full items-center gap-1 overflow-x-auto pt-1 sm:order-none sm:mx-0 sm:w-auto sm:pt-0"
          >
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={pathname.startsWith(n.href) ? "page" : undefined}
                className={cx(
                  "whitespace-nowrap rounded-lg px-3 py-1.5 text-sm",
                  pathname.startsWith(n.href)
                    ? "bg-accent-soft font-medium text-accent"
                    : "text-muted hover:text-ink",
                )}
              >
                {t(n.label)}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            <div className="hidden text-right text-xs leading-tight md:block">
              <div className="font-medium text-ink">{me.name}</div>
              <div className="text-muted">{t(`role.${me.role}`)}</div>
            </div>
            <LanguageToggle />
            <ThemeToggle />
            <button
              type="button"
              onClick={() => void signOut()}
              aria-label={t("common.signOut")}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-surface hover:text-ink"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t("common.signOut")}</span>
            </button>
          </div>
        </div>
      </header>
      <DemoClockBar />
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
