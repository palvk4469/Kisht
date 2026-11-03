"use client";

import { ImportHistory } from "@/features/imports/ImportHistory";
import { ImportWorkflow } from "@/features/imports/ImportWorkflow";
import { useI18n } from "@/lib/i18n";

export default function ImportPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("import.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("import.subtitle")}</p>
      </div>
      <ImportWorkflow />
      <ImportHistory />
    </div>
  );
}
