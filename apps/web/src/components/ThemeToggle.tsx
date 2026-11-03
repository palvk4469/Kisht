"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme } from "@/features/theme/ThemeProvider";
import type { ThemePreference } from "@/features/theme/theme";
import { type MessageKey, useI18n } from "@/lib/i18n";

const NEXT: Record<ThemePreference, ThemePreference> = {
  light: "dark",
  dark: "system",
  system: "light",
};
const ICON = { light: Sun, dark: Moon, system: Monitor } as const;
const LABEL: Record<ThemePreference, MessageKey> = {
  light: "theme.light",
  dark: "theme.dark",
  system: "theme.system",
};

/** One button that cycles light → dark → follow device; the label says what's active. */
export function ThemeToggle() {
  const { t } = useI18n();
  const { preference, setPreference } = useTheme();
  const Icon = ICON[preference];
  return (
    <button
      type="button"
      onClick={() => setPreference(NEXT[preference])}
      aria-label={`${t("theme.label")}: ${t(LABEL[preference])}`}
      title={`${t("theme.label")}: ${t(LABEL[preference])}`}
      className="inline-flex size-10 items-center justify-center rounded-xl text-muted hover:bg-surface hover:text-ink"
    >
      <Icon className="size-4" aria-hidden />
    </button>
  );
}
