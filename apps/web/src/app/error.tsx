"use client";

import { AlertCircle } from "lucide-react";
import { useEffect } from "react";
import { Button, EmptyState } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => console.error(error), [error]);
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={<AlertCircle className="size-8" />}
        title={t("error.title")}
        body={t("error.body")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button onClick={reset}>{t("error.retry")}</Button>
            <a
              href="/"
              className="inline-flex h-10 items-center rounded-xl border border-line px-4 text-sm font-medium hover:bg-surface"
            >
              {t("error.home")}
            </a>
          </div>
        }
      />
    </main>
  );
}
