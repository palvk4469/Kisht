"use client";

import { Compass } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="flex min-h-dvh items-center justify-center">
      <EmptyState
        icon={<Compass className="size-8" />}
        title={t("notFound.title")}
        body={t("notFound.body")}
        action={
          <a
            href="/"
            className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-medium text-on-accent"
          >
            {t("error.home")}
          </a>
        }
      />
    </main>
  );
}
