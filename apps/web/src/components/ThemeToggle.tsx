"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/features/theme/ThemeProvider";
import { useI18n } from "@/lib/i18n";

/** One tap always changes what's on screen. Until the first tap, it follows the device. */
export function ThemeToggle() {
  const { t } = useI18n();
  const { isDark, toggle } = useTheme();
  const Icon = isDark ? Moon : Sun;
  const label = `${t("theme.label")}: ${t(isDark ? "theme.dark" : "theme.light")}`;
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="inline-flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
