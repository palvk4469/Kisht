"use client";

import { Languages } from "lucide-react";
import { useI18n } from "@/lib/i18n";

export function LanguageToggle() {
  const { locale, setLocale, t } = useI18n();
  return (
    <button
      type="button"
      onClick={() => setLocale(locale === "hi" ? "en" : "hi")}
      className="inline-flex h-10 items-center gap-1.5 rounded-xl px-3 text-sm text-muted hover:bg-surface hover:text-ink"
    >
      <Languages className="size-4" aria-hidden />
      {t("lang.toggle")}
    </button>
  );
}
