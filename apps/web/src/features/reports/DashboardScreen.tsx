"use client";

import type { BacktestWeek, Dashboard, OfficerRow } from "@kisht/contracts";
import { istDayOf, toCsv } from "@kisht/domain";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  Download,
  Percent,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { Badge, Button, Card, EmptyState, ErrorState, Skeleton, Stat } from "@/components/ui";
import { DpdBadge } from "@/features/field/badges";
import { LoanLink } from "@/features/manager/LoanView";
import { day, number, rupees, rupeesShort, shortDay } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useDashboard } from "./api";
import { ColumnChart, CompareBars, Legend, LineChart, type LineSeries } from "./charts";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const SERIES_COLORS = ["var(--color-series-1)", "var(--color-series-2)"];

const pct = (v: number | null, digits = 1) => (v === null ? "–" : `${(v * 100).toFixed(digits)}%`);

function TableView({ summary, children }: { summary: string; children: React.ReactNode }) {
  return (
    <details className="mt-3 text-sm">
      <summary className="min-h-8 cursor-pointer text-muted">{summary}</summary>
      <div className="mt-2 overflow-x-auto">{children}</div>
    </details>
  );
}

const th = "px-3 py-1.5 text-left text-xs font-medium text-muted";
const td = "num px-3 py-1.5";

function RollRateCard({ data }: { data: Dashboard }) {
  const { t, locale } = useI18n();
  const series = data.rollRate.series;
  const labels = series[0]?.points.map((p) => shortDay(p.day, locale)) ?? [];
  const lines: LineSeries[] = series.map((s, i) => ({
    id: s.id,
    name: s.name,
    color: SERIES_COLORS[i] ?? "var(--color-faint)",
    values: s.points.map((p) => p.rate),
  }));
  const highest = Math.max(0.4, ...lines.flatMap((l) => l.values.map((v) => v ?? 0)));
  const yMax = Math.ceil(highest * 10) / 10;

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-medium">{t("dash.rollTitle")}</h2>
          <p className="text-sm text-muted">{t("dash.rollHint")}</p>
        </div>
        {lines.length > 1 && <Legend items={lines} />}
      </div>
      {labels.length === 0 ? (
        <EmptyState title={t("dash.rollEmpty")} />
      ) : (
        <div className="mt-4">
          <LineChart
            label={t("dash.rollTitle")}
            labels={labels}
            series={lines}
            yMax={yMax}
            format={(v) => pct(v, 0)}
            reference={{
              value: data.targets.rollRate,
              label: t("dash.target", { n: pct(data.targets.rollRate, 0) }),
            }}
          />
          <TableView summary={t("dash.asTable")}>
            <table className="w-full">
              <thead>
                <tr>
                  <th className={th}>{t("dash.cohort")}</th>
                  {series.map((s) => (
                    <th key={s.id} className={`${th} text-right`}>
                      {s.name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {(series[0]?.points ?? []).map((p, i) => (
                  <tr key={p.day}>
                    <td className={td}>{shortDay(p.day, locale)}</td>
                    {series.map((s) => {
                      const point = s.points[i];
                      return (
                        <td key={s.id} className={`${td} text-right`}>
                          {pct(point?.rate ?? null)}{" "}
                          <span className="text-faint">
                            ({point?.rolled}/{point?.cohort})
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </TableView>
        </div>
      )}
    </Card>
  );
}

function AtRiskCard({ data }: { data: Dashboard }) {
  const { t } = useI18n();
  const { loans, count, outstanding } = data.atRisk;
  return (
    <Card>
      <div className="border-b border-line px-5 py-4">
        <h2 className="font-medium">{t("dash.riskTitle")}</h2>
        <p className="num text-sm text-muted">
          {t("dash.riskHint", { n: number(count), amount: rupeesShort(outstanding) })}
        </p>
      </div>
      {loans.length === 0 ? (
        <EmptyState title={t("dash.riskEmpty")} />
      ) : (
        <ul className="divide-y divide-line">
          {loans.map((l) => (
            <li
              key={l.loanId}
              className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-2.5 text-sm"
            >
              <span className="min-w-40 flex-1">
                <LoanLink loanId={l.loanId} name={l.borrowerName} className="block font-medium" />
                <span className="block text-xs text-muted">
                  {l.officerName ?? t("board.noOfficer")}
                </span>
              </span>
              <span className="num">{rupees(l.outstanding)}</span>
              <DpdBadge dpd={l.dpd} />
              <Badge tone={l.contactedToday ? "ok" : "neutral"}>
                {l.contactedToday ? t("dash.contacted") : t("dash.notContacted")}
              </Badge>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function PromisesCard({ data }: { data: Dashboard }) {
  const { t, locale } = useI18n();
  const { weekly } = data.promises;
  const labels = weekly.map((w) => shortDay(w.weekStart, locale));
  return (
    <Card className="p-5">
      <h2 className="font-medium">{t("dash.brokenTitle")}</h2>
      <p className="text-sm text-muted">{t("dash.brokenHint")}</p>
      <div className="mt-4">
        <ColumnChart
          label={t("dash.brokenTitle")}
          labels={labels}
          values={weekly.map((w) => w.broken)}
          tooltip={(i) =>
            t("dash.brokenTip", {
              week: labels[i] ?? "",
              broken: weekly[i]?.broken ?? 0,
              kept: weekly[i]?.kept ?? 0,
            })
          }
        />
        <TableView summary={t("dash.asTable")}>
          <table className="w-full">
            <thead>
              <tr>
                <th className={th}>{t("dash.weekFrom")}</th>
                <th className={`${th} text-right`}>{t("tracker.brokenFilter")}</th>
                <th className={`${th} text-right`}>{t("tracker.keptFilter")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {weekly.map((w, i) => (
                <tr key={w.weekStart}>
                  <td className={td}>{labels[i]}</td>
                  <td className={`${td} text-right`}>{w.broken}</td>
                  <td className={`${td} text-right`}>{w.kept}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </TableView>
      </div>
    </Card>
  );
}

function pooledBacktest(weeks: BacktestWeek[]) {
  const rows = weeks.reduce((n, w) => n + w.rows, 0) || 1;
  const avg = (pick: (w: BacktestWeek) => number) =>
    weeks.reduce((sum, w) => sum + pick(w) * w.rows, 0) / rows;
  return {
    model: avg((w) => w.coverage.model),
    within30: avg((w) => w.coverage.oldestWithin30),
    oldest: avg((w) => w.coverage.oldestFirst),
    auc: avg((w) => w.aucWithin30),
    aucDpd: avg((w) => w.aucWithin30DpdOnly),
  };
}

function BacktestCard({ weeks }: { weeks: BacktestWeek[] }) {
  const { t, locale } = useI18n();
  const latest = weeks.at(-1);
  if (!latest) {
    return (
      <Card>
        <EmptyState title={t("dash.backtestEmpty")} />
      </Card>
    );
  }
  const p = pooledBacktest(weeks);
  return (
    <Card className="p-5">
      <h2 className="font-medium">{t("dash.backtestTitle")}</h2>
      <p className="text-sm text-muted">{t("dash.backtestHint", { k: latest.coverage.topK })}</p>
      <div className="mt-4">
        <CompareBars
          rows={[
            { label: t("dash.btModel"), value: p.model, display: pct(p.model, 0), emphasis: true },
            { label: t("dash.btWithin30"), value: p.within30, display: pct(p.within30, 0) },
            { label: t("dash.btOldest"), value: p.oldest, display: pct(p.oldest, 0) },
          ]}
        />
      </div>
      <p className="num mt-4 text-sm text-muted">
        {t("dash.btAuc", { model: p.auc.toFixed(2), dpd: p.aucDpd.toFixed(2) })}
      </p>
      <p className="mt-1 text-xs text-faint">{t("dash.btCaveat")}</p>
      <TableView summary={t("dash.btWeeks")}>
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>{t("dash.weekFrom")}</th>
              <th className={`${th} text-right`}>{t("dash.btModelShort")}</th>
              <th className={`${th} text-right`}>{t("dash.btWithin30Short")}</th>
              <th className={`${th} text-right`}>{t("dash.btOldestShort")}</th>
              <th className={`${th} text-right`}>AUC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {weeks.map((w) => (
              <tr key={w.weekStart}>
                <td className={td}>{shortDay(w.weekStart, locale)}</td>
                <td className={`${td} text-right font-medium`}>{pct(w.coverage.model, 0)}</td>
                <td className={`${td} text-right`}>{pct(w.coverage.oldestWithin30, 0)}</td>
                <td className={`${td} text-right`}>{pct(w.coverage.oldestFirst, 0)}</td>
                <td className={`${td} text-right`}>{w.aucWithin30.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
      <TableView summary={t("dash.calibration")}>
        <table className="w-full">
          <thead>
            <tr>
              <th className={`${th} text-right`}>{t("dash.predicted")}</th>
              <th className={`${th} text-right`}>{t("dash.actual")}</th>
              <th className={`${th} text-right`}>{t("dash.loans")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {latest.calibration.map((c) => (
              <tr key={c.predicted}>
                <td className={`${td} text-right`}>{pct(c.predicted, 0)}</td>
                <td className={`${td} text-right`}>{pct(c.actual, 0)}</td>
                <td className={`${td} text-right text-muted`}>{c.n}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TableView>
    </Card>
  );
}

function downloadOfficersCsv(rows: OfficerRow[], asOf: string | null) {
  const csv = toCsv(
    [
      "officer",
      "branch",
      "overdue_loans",
      "contact_attempts_30d",
      "promises_broken_30d",
      "promises_kept_30d",
      "same_day_logging",
      "visits_to_check_30d",
    ],
    rows.map((o) => [
      o.name,
      o.branchName,
      o.overdueLoans,
      o.attempts30,
      o.brokenPromises30,
      o.keptPromises30,
      o.sameDayRate === null ? "" : o.sameDayRate.toFixed(3),
      o.visitsToCheck30,
    ]),
  );
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `officers-${asOf ?? "latest"}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Compared as displayed, so a "95%" is never flagged against a 95% target. */
const belowTarget = (rate: number | null, target: number) =>
  rate !== null && Math.round(rate * 100) < Math.round(target * 100);

function OfficersCard({ data }: { data: Dashboard }) {
  const { t } = useI18n();
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-3">
        <div>
          <h2 className="font-medium">{t("dash.officersTitle")}</h2>
          <p className="text-sm text-muted">{t("dash.officersHint")}</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => downloadOfficersCsv(data.officers, data.asOfDate)}
        >
          <Download className="size-4" aria-hidden />
          {t("dash.downloadCsv")}
        </Button>
      </div>
      <ul className="divide-y divide-line sm:hidden">
        {data.officers.map((o) => (
          <li key={o.id} className="px-5 py-3 text-sm">
            <p className="font-medium">{o.name}</p>
            <dl className="num mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-muted">
              {(
                [
                  ["dash.colLoans", o.overdueLoans],
                  ["dash.colAttempts", o.attempts30],
                  ["dash.colBroken", o.brokenPromises30],
                  ["dash.colSameDay", pct(o.sameDayRate, 0)],
                  ["dash.colCheck", o.visitsToCheck30],
                ] as const
              ).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-2">
                  <dt>{t(label)}</dt>
                  <dd className="text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </li>
        ))}
      </ul>
      <div className="hidden sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{t("board.officer")}</th>
              <th className={`${th} text-right`}>{t("dash.colLoans")}</th>
              <th className={`${th} text-right`}>{t("dash.colAttempts")}</th>
              <th className={`${th} text-right`}>{t("dash.colBroken")}</th>
              <th className={`${th} text-right`}>{t("dash.colSameDay")}</th>
              <th className={`${th} text-right`}>{t("dash.colCheck")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {data.officers.map((o) => (
              <tr key={o.id}>
                <td className="px-3 py-2">
                  <span className="font-medium">{o.name}</span>
                  <span className="block text-xs text-muted">{o.branchName}</span>
                </td>
                <td className={`${td} text-right`}>{o.overdueLoans}</td>
                <td className={`${td} text-right`}>{o.attempts30}</td>
                <td className={`${td} text-right`}>{o.brokenPromises30}</td>
                <td
                  className={`${td} text-right ${belowTarget(o.sameDayRate, data.targets.sameDay) ? "text-warn" : ""}`}
                >
                  {pct(o.sameDayRate, 0)}
                </td>
                <td className={`${td} text-right`}>{o.visitsToCheck30}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

export function DashboardScreen() {
  const { t, locale } = useI18n();
  const branchSelect = useId();
  const [branchId, setBranchId] = useState("");
  const query = useDashboard(branchId);

  const header = (
    <div>
      <h1 className="text-2xl font-semibold">{t("dash.title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">
        {t("dash.subtitle")} {DEMO_MODE && t("dash.sampleData")}
      </p>
    </div>
  );

  if (query.isPending) {
    return (
      <div className="space-y-6" aria-busy>
        {header}
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }
  if (query.error) {
    return (
      <div className="space-y-6">
        {header}
        <ErrorState error={query.error} onRetry={() => void query.refetch()} />
      </div>
    );
  }

  const data = query.data;
  if (!data.asOfDate) {
    return (
      <div className="space-y-6">
        {header}
        <Card>
          <EmptyState
            icon={<BarChart3 className="size-8" />}
            title={t("dash.emptyTitle")}
            body={t("dash.emptyBody")}
          />
        </Card>
      </div>
    );
  }

  const { current, previous, cohort } = data.rollRate;
  const delta = current !== null && previous !== null ? (current - previous) * 100 : null;
  const resolved = data.promises.kept30 + data.promises.broken30;

  return (
    <div className={`space-y-6 ${query.isFetching ? "opacity-80" : ""}`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        {header}
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm text-muted">
            {t("board.asOf", { date: day(data.asOfDate, locale) })}
          </span>
          {data.asOfDate < istDayOf(new Date()) && (
            <Link
              href="/manager/import"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-warn-soft px-3 text-sm font-medium text-warn hover:underline"
            >
              <Upload className="size-4" aria-hidden />
              {t("dash.uploadToday")}
            </Link>
          )}
          {data.branches.length > 1 && (
            <div>
              <label htmlFor={branchSelect} className="sr-only">
                {t("dash.branch")}
              </label>
              <select
                id={branchSelect}
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="h-10 rounded-lg border border-line bg-canvas px-2 text-sm"
              >
                <option value="">{t("dash.allBranches")}</option>
                {data.branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      <Card className="grid grid-cols-2 gap-3.5 p-3.5 sm:p-4 lg:grid-cols-4 shadow-xs">
        <Stat
          icon={<Percent className="size-4" />}
          label={t("dash.kpiRoll")}
          value={pct(current)}
          tone={current !== null && current > data.targets.rollRate ? "warn" : "ok"}
          hint={
            delta === null
              ? t("dash.kpiRollHint", { target: pct(data.targets.rollRate, 0), n: number(cohort) })
              : t("dash.kpiRollDelta", {
                  delta: `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`,
                  target: pct(data.targets.rollRate, 0),
                })
          }
        />
        <Stat
          icon={<AlertTriangle className="size-4" />}
          label={t("dash.kpiRisk")}
          value={number(data.atRisk.count)}
          tone={data.atRisk.count > 0 ? "risk" : "neutral"}
          hint={t("dash.kpiRiskHint", { amount: rupeesShort(data.atRisk.outstanding) })}
        />
        <Stat
          icon={<CalendarClock className="size-4" />}
          label={t("dash.kpiBroken")}
          value={number(data.promises.broken30)}
          hint={t("dash.kpiBrokenHint", {
            n: resolved > 0 ? Math.round((data.promises.kept30 / resolved) * 100) : 0,
          })}
        />
        <Stat
          icon={<CheckCircle2 className="size-4" />}
          label={t("dash.kpiSameDay")}
          value={pct(data.sameDay.rate, 0)}
          tone={belowTarget(data.sameDay.rate, data.targets.sameDay) ? "warn" : "ok"}
          hint={t("dash.kpiSameDayHint", { target: pct(data.targets.sameDay, 0) })}
        />
      </Card>

      <RollRateCard data={data} />

      <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <AtRiskCard data={data} />
        <PromisesCard data={data} />
      </div>

      <BacktestCard weeks={data.backtest} />
      <OfficersCard data={data} />
    </div>
  );
}
