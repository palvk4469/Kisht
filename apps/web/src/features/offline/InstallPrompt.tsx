"use client";

import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";

type InstallEvent = Event & { prompt: () => Promise<void> };

const DISMISSED_KEY = "kisht.installDismissed";

/** Offered once on Android Chrome: an installed app opens fast, with no signal. */
export function InstallPrompt() {
  const { t } = useI18n();
  const [event, setEvent] = useState<InstallEvent | null>(null);

  useEffect(() => {
    if (window.localStorage.getItem(DISMISSED_KEY)) return;
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!event) return null;
  const close = () => {
    window.localStorage.setItem(DISMISSED_KEY, "1");
    setEvent(null);
  };
  return (
    <div className="flex items-center gap-2 bg-accent-soft px-4 py-2 text-sm text-accent">
      <span className="flex-1">{t("install.prompt")}</span>
      <button
        type="button"
        onClick={() => void event.prompt().finally(close)}
        className="inline-flex min-h-9 items-center gap-1 font-medium underline underline-offset-2"
      >
        <Download className="size-4" aria-hidden />
        {t("install.action")}
      </button>
      <button
        type="button"
        aria-label={t("sync.dismiss")}
        onClick={close}
        className="inline-flex size-9 items-center justify-center"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
