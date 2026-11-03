"use client";

import { LogOut } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { type MessageKey, useI18n } from "@/lib/i18n";
import type { Me } from "@/lib/session";
import { LanguageToggle } from "./LanguageToggle";
import { cx } from "./ui";
import { useSignOut } from "./useSignOut";

// Only screens that exist are linked: no dead buttons.
const NAV: { href: string; label: MessageKey }[] = [
  { href: "/manager/import", label: "nav.import" },
];

export function ManagerShell({ me, children }: { me: Me; children: ReactNode }) {
  const { t } = useI18n();
  const pathname = usePathname();
  const signOut = useSignOut();
  return (
    <div className="min-h-dvh bg-surface">
      <header className="sticky top-0 z-10 border-b border-line bg-canvas/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="flex size-7 items-center justify-center rounded-lg bg-accent text-sm text-white">
              क
            </span>
            <span className="hidden sm:inline">{t("app.name")}</span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={pathname.startsWith(n.href) ? "page" : undefined}
                className={cx(
                  "rounded-lg px-3 py-1.5 text-sm",
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
            <button
              type="button"
              onClick={() => void signOut()}
              className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-surface hover:text-ink"
            >
              <LogOut className="size-4" aria-hidden />
              <span className="hidden sm:inline">{t("common.signOut")}</span>
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:py-8">{children}</main>
    </div>
  );
}
