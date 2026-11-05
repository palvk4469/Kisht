"use client";

import type { ImportSummary } from "@kisht/contracts";
import { cx, Stat } from "@/components/ui";
import { number } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

/** What an import will change (preview) or did change (after commit). */
export function ImportSummaryPanel({ summary }: { summary: ImportSummary }) {
  const { t } = useI18n();
  const a = summary.assignment;
  const max = Math.max(1, ...a.byOfficer.map((o) => o.loans));
  return (
    <div className="mt-5 space-y-5">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label={t("import.rows")} value={number(summary.rows)} tone="accent" />
        <Stat
          label={t("import.errors")}
          value={number(summary.errors)}
          tone={summary.errors > 0 ? "risk" : "neutral"}
        />
        <Stat label={t("import.newLoans")} value={number(summary.newLoans)} />
        <Stat
          label={t("import.cured")}
          value={number(summary.cured)}
          tone={summary.curedNeedsConfirmation ? "warn" : summary.cured > 0 ? "ok" : "neutral"}
        />
        <Stat label={t("import.payments")} value={number(summary.payments)} />
      </div>
      {summary.skippedOtherBranches > 0 && (
        <p className="text-sm text-muted">
          {t("import.skipped", { n: number(summary.skippedOtherBranches) })}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="text-sm font-medium">{t("import.assignment")}</h3>
          <dl className="mt-2 divide-y divide-line rounded-xl border border-line text-sm">
            <Row label={t("import.kept")} value={a.kept} />
            <Row label={t("import.newAssigned")} value={a.new} />
            <Row label={t("import.moved")} value={a.moved} />
            <Row
              label={t("import.unassigned")}
              value={a.unassigned}
              tone={a.unassigned > 0 ? "warn" : undefined}
            />
          </dl>
          {a.unassigned > 0 && (
            <p className="mt-2 text-xs text-muted">{t("import.unassignedHint")}</p>
          )}
        </div>
        <div>
          <h3 className="text-sm font-medium">{t("import.byOfficer")}</h3>
          <ul className="mt-2 space-y-2">
            {a.byOfficer.map((o) => (
              <li
                key={o.officerId}
                className="grid grid-cols-[8rem_1fr_2.5rem] items-center gap-3 text-sm"
              >
                <span className="truncate font-medium">{o.name}</span>
                <span className="h-2 overflow-hidden rounded-full bg-surface">
                  <span
                    className="block h-full rounded-full bg-accent transition-all duration-300"
                    style={{ width: `${(o.loans / max) * 100}%` }}
                  />
                </span>
                <span className="num text-right font-medium text-muted">{o.loans}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: number; tone?: "warn" }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <dt className="text-muted">{label}</dt>
      <dd className={cx("num font-medium", tone === "warn" && "text-warn")}>{number(value)}</dd>
    </div>
  );
}
