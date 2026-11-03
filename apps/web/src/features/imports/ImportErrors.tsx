"use client";

import type { RowError } from "@kisht/contracts";
import { number } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/** Rows the import will skip, with Excel row numbers so they can be fixed at source. */
export function ImportErrors({ errors, total }: { errors: RowError[]; total: number }) {
  const { t } = useI18n();
  return (
    <div className="mt-6">
      <h3 className="text-sm font-medium">
        {t("import.errorTable")} <span className="num text-muted">({number(total)})</span>
      </h3>
      <div className="mt-2 max-h-72 overflow-auto rounded-xl border border-line">
        <table className="w-full text-left text-sm">
          <thead className="sticky top-0 bg-surface text-xs text-muted">
            <tr>
              <th className="px-4 py-2 font-medium">{t("import.errorRow")}</th>
              <th className="px-4 py-2 font-medium">{t("import.errorField")}</th>
              <th className="px-4 py-2 font-medium">{t("import.errorMessage")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {errors.map((e) => (
              <tr key={`${e.row}-${e.field}`}>
                <td className="num px-4 py-2 text-muted">{e.row}</td>
                <td className="px-4 py-2 font-mono text-xs">{e.field}</td>
                <td className="px-4 py-2">{e.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
