"use client";

import { istDayOf, OVERDUE_COLUMNS } from "@kisht/shared";
import { type UseQueryResult, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet, History, Info, Upload } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";
import { Badge, Button, Card, cx, EmptyState, ErrorState, Skeleton, Stat } from "@/components/ui";
import { api } from "@/lib/api";
import { dateTime, day, number } from "@/lib/format";
import { type MessageKey, useI18n } from "@/lib/i18n";

type Summary = {
  asOfDate: string;
  rows: number;
  errors: number;
  skippedOtherBranches: number;
  newLoans: number;
  cured: number;
  payments: number;
  replacesExisting: boolean;
  assignment: {
    kept: number;
    new: number;
    moved: number;
    unassigned: number;
    byOfficer: { officerId: string; name: string; loans: number }[];
  };
  promises?: { kept: number; partial: number; broken: number };
};

type RowError = { row: number; field: string; message: string };
type PreviewResult = { id: string; status: string; summary: Summary; errors: RowError[] };
type CommitResult = { id: string; status: "COMMITTED"; summary: Summary };
type HistoryItem = {
  id: string;
  asOfDate: string;
  fileName: string;
  status: "PREVIEW" | "COMMITTED" | "SUPERSEDED" | "FAILED";
  rowCount: number;
  errorCount: number;
  uploadedBy: string;
  createdAt: string;
};

const MAX_BYTES = 8 * 1024 * 1024;
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const TEMPLATE = [
  OVERDUE_COLUMNS.join(","),
  'LN-10293,Company B (packaging unit),packaging unit,9000012345,"Plot 117, Siyaganj, Indore 452001",452001,640000,12,26700,2026-09-21,26700,IND',
  'LN-11930,Company D (printing press),printing press,9000054321,"Plot 8, Sector 1, Pithampur 454775",454775,220000,19,9200,2026-09-14,9200,PTH',
].join("\n");

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([`${TEMPLATE}\n`], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = "overdue-template.csv";
  a.click();
  URL.revokeObjectURL(url);
}

function kb(bytes: number) {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function ImportPage() {
  const { t, locale } = useI18n();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);
  const dateId = useId();
  const [asOfDate, setAsOfDate] = useState(() => istDayOf(new Date()));
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<MessageKey | null>(null);
  const [dragging, setDragging] = useState(false);

  const history = useQuery({
    queryKey: ["imports"],
    queryFn: () => api<HistoryItem[]>("/api/imports"),
  });

  const preview = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("no file");
      const csv = await file.text();
      return api<PreviewResult>("/api/imports", {
        method: "POST",
        body: { asOfDate, fileName: file.name, csv },
      });
    },
  });

  const commit = useMutation({
    mutationFn: (id: string) => api<CommitResult>(`/api/imports/${id}/commit`, { method: "POST" }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["imports"] }),
  });

  function choose(f: File | undefined) {
    preview.reset();
    commit.reset();
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") {
      setFile(null);
      setFileError("import.notCsv");
      return;
    }
    if (f.size > MAX_BYTES) {
      setFile(null);
      setFileError("import.tooBig");
      return;
    }
    setFileError(null);
    setFile(f);
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    choose(e.dataTransfer.files[0]);
  }

  function startOver() {
    setFile(null);
    preview.reset();
    commit.reset();
    if (fileInput.current) fileInput.current.value = "";
  }

  const result = preview.data;
  const committed = commit.data;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("import.title")}</h1>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t("import.subtitle")}</p>
      </div>

      {committed ? (
        <Card className="p-6">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-6 text-ok" aria-hidden />
            <div className="flex-1">
              <h2 className="text-lg font-semibold">{t("import.done")}</h2>
              <p className="mt-1 text-sm text-muted">
                {day(committed.summary.asOfDate, locale)} ·{" "}
                {t("import.doneBody", { rows: number(committed.summary.rows) })}
              </p>
              {committed.summary.promises && (
                <p className="mt-1 text-sm text-muted">
                  {t("import.promises", committed.summary.promises)}
                </p>
              )}
              <SummaryGrid summary={committed.summary} />
              <Button variant="secondary" className="mt-6" onClick={startOver}>
                {t("import.another")}
              </Button>
            </div>
          </div>
        </Card>
      ) : (
        <Card className="p-5 sm:p-6">
          <div className="grid gap-5 md:grid-cols-[200px_1fr]">
            <label htmlFor={dateId} className="block">
              <span className="text-sm font-medium">{t("import.asOf")}</span>
              <input
                id={dateId}
                type="date"
                value={asOfDate}
                max={istDayOf(new Date())}
                onChange={(e) => {
                  setAsOfDate(e.target.value);
                  preview.reset();
                }}
                className="mt-1.5 h-12 w-full rounded-xl border border-line px-3 outline-none focus:border-accent"
              />
            </label>
            <div>
              <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
                <span className="text-sm font-medium">{t("import.file")}</span>
                <span className="flex flex-wrap gap-x-4 gap-y-1">
                  {DEMO_MODE && (
                    <a
                      href="/api/imports/demo-sample"
                      download
                      className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                    >
                      <Download className="size-3.5" aria-hidden />
                      {t("import.sample")}
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="inline-flex items-center gap-1 text-sm text-accent hover:underline"
                  >
                    <Download className="size-3.5" aria-hidden />
                    {t("import.template")}
                  </button>
                </span>
              </div>
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault();
                  setDragging(true);
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={onDrop}
                className={cx(
                  "mt-1.5 flex min-h-24 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed px-4 py-5 text-sm transition-colors",
                  dragging
                    ? "border-accent bg-accent-soft"
                    : "border-line hover:border-accent hover:bg-surface",
                )}
              >
                {file ? (
                  <>
                    <FileSpreadsheet className="size-5 text-accent" aria-hidden />
                    <span className="font-medium">
                      {t("import.chosen", { name: file.name, size: kb(file.size) })}
                    </span>
                  </>
                ) : (
                  <>
                    <Upload className="size-5 text-faint" aria-hidden />
                    <span className="text-muted">
                      {dragging ? t("import.dropActive") : t("import.drop")}
                    </span>
                  </>
                )}
              </button>
              <input
                ref={fileInput}
                type="file"
                accept=".csv,text/csv"
                className="sr-only"
                tabIndex={-1}
                onChange={(e) => choose(e.target.files?.[0])}
              />
              {fileError && <p className="mt-2 text-sm text-risk">{t(fileError)}</p>}
            </div>
          </div>

          {preview.error && (
            <div className="mt-5">
              <ErrorState error={preview.error} />
            </div>
          )}

          {!result && (
            <div className="mt-5 flex justify-end">
              <Button
                size="lg"
                onClick={() => preview.mutate()}
                busy={preview.isPending}
                disabled={!file}
              >
                {preview.isPending ? t("import.previewing") : t("import.preview")}
              </Button>
            </div>
          )}

          {result && (
            <div className="mt-6 border-t border-line pt-6">
              <h2 className="text-lg font-semibold">{t("import.ready")}</h2>
              <p className="text-sm text-muted">{t("import.readyBody")}</p>

              {result.summary.replacesExisting && (
                <p className="mt-4 flex items-start gap-2 rounded-xl bg-warn-soft px-4 py-3 text-sm text-warn">
                  <Info className="mt-0.5 size-4 shrink-0" aria-hidden />
                  {t("import.replaces", { date: day(result.summary.asOfDate, locale) })}
                </p>
              )}

              <SummaryGrid summary={result.summary} />

              {result.errors.length > 0 && (
                <ErrorTable errors={result.errors} total={result.summary.errors} />
              )}

              {commit.error && (
                <div className="mt-5">
                  <ErrorState error={commit.error} />
                </div>
              )}

              <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="secondary"
                  size="lg"
                  onClick={startOver}
                  disabled={commit.isPending}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="lg"
                  onClick={() => commit.mutate(result.id)}
                  busy={commit.isPending}
                  disabled={result.summary.rows === 0}
                >
                  {commit.isPending ? t("import.committing") : t("import.commit")}
                </Button>
              </div>
            </div>
          )}
        </Card>
      )}

      <HistoryTable query={history} />
    </div>
  );
}

function SummaryGrid({ summary }: { summary: Summary }) {
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
          tone={summary.cured > 0 ? "ok" : "neutral"}
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
                <span className="truncate">{o.name}</span>
                <span className="h-2 rounded-full bg-surface">
                  <span
                    className="block h-2 rounded-full bg-accent"
                    style={{ width: `${(o.loans / max) * 100}%` }}
                  />
                </span>
                <span className="num text-right text-muted">{o.loans}</span>
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

function ErrorTable({ errors, total }: { errors: RowError[]; total: number }) {
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

const STATUS_TONE = {
  PREVIEW: "neutral",
  COMMITTED: "ok",
  SUPERSEDED: "warn",
  FAILED: "risk",
} as const;

const HISTORY_PREVIEW = 7;

function HistoryTable({ query }: { query: UseQueryResult<HistoryItem[]> }) {
  const { t, locale } = useI18n();
  const [showAll, setShowAll] = useState(false);
  const items = query.data ?? [];
  const visible = showAll ? items : items.slice(0, HISTORY_PREVIEW);
  return (
    <Card>
      <div className="flex items-center gap-2 border-b border-line px-5 py-4">
        <History className="size-4 text-faint" aria-hidden />
        <h2 className="font-medium">{t("import.history")}</h2>
      </div>
      {query.isPending ? (
        <div className="space-y-2 p-5">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-9 w-full" />
          ))}
        </div>
      ) : query.error ? (
        <div className="p-5">
          <ErrorState error={query.error} onRetry={() => void query.refetch()} />
        </div>
      ) : items.length === 0 ? (
        <EmptyState title={t("import.historyEmpty")} />
      ) : (
        <>
          {/* Phones: a stacked list, no sideways scrolling. */}
          <ul className="divide-y divide-line sm:hidden">
            {visible.map((b) => (
              <li key={b.id} className="px-5 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{day(b.asOfDate, locale)}</span>
                  <Badge tone={STATUS_TONE[b.status]}>{t(`import.status.${b.status}`)}</Badge>
                </div>
                <div className="mt-1 flex justify-between gap-3 text-sm text-muted">
                  <span className="truncate">{b.uploadedBy}</span>
                  <span className="num shrink-0">
                    {number(b.rowCount)}
                    {b.errorCount > 0 && (
                      <span className="ml-1 text-risk">({number(b.errorCount)})</span>
                    )}
                  </span>
                </div>
              </li>
            ))}
          </ul>
          <table className="hidden w-full text-left text-sm sm:table">
            <thead className="text-xs text-muted">
              <tr>
                <th className="px-5 py-2 font-medium">{t("import.col.date")}</th>
                <th className="px-5 py-2 font-medium">{t("import.col.file")}</th>
                <th className="px-5 py-2 font-medium">{t("import.col.status")}</th>
                <th className="px-5 py-2 text-right font-medium">{t("import.col.rows")}</th>
                <th className="px-5 py-2 font-medium">{t("import.col.by")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((b) => (
                <tr key={b.id}>
                  <td className="whitespace-nowrap px-5 py-2.5">{day(b.asOfDate, locale)}</td>
                  <td className="max-w-56 truncate px-5 py-2.5 text-muted">{b.fileName}</td>
                  <td className="px-5 py-2.5">
                    <Badge tone={STATUS_TONE[b.status]}>{t(`import.status.${b.status}`)}</Badge>
                  </td>
                  <td className="num px-5 py-2.5 text-right">
                    {number(b.rowCount)}
                    {b.errorCount > 0 && (
                      <span className="ml-1 text-risk">({number(b.errorCount)})</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-5 py-2.5 text-muted">
                    {b.uploadedBy} · {dateTime(b.createdAt, locale)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {items.length > HISTORY_PREVIEW && (
            <div className="border-t border-line px-5 py-3">
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                className="text-sm font-medium text-accent hover:underline"
              >
                {showAll ? t("import.showLess") : t("import.showAll", { n: items.length })}
              </button>
            </div>
          )}
        </>
      )}
    </Card>
  );
}
