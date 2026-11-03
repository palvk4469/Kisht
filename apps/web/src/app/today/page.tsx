"use client";

import { ListChecks } from "lucide-react";
import { EmptyState } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

// The officer's prioritised list lands here on day 3.
export default function TodayPage() {
  const { t } = useI18n();
  return (
    <EmptyState
      icon={<ListChecks className="size-8" />}
      title={t("officer.comingSoon")}
      body={t("officer.comingSoonBody")}
    />
  );
}
