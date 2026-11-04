"use client";

import { MAX_IMPORT_CSV_BYTES } from "@kisht/contracts";
import { istDayOf, OVERDUE_COLUMNS, OVERDUE_TEMPLATE_ROWS } from "@kisht/domain";
import { CheckCircle2, Download, FileSpreadsheet, Info, Upload } from "lucide-react";
import { type DragEvent, useId, useRef, useState } from "react";
import { Button, Card, cx, ErrorState } from "@/components/ui";
import { day, number } from "@/lib/format";
import { type MessageKey, useI18n } from "@/lib/i18n";
import { useCommitImport, usePreviewImport } from "./api";
import { ImportErrors } from "./ImportErrors";
import { ImportSummaryPanel } from "./ImportSummaryPanel";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";

const TEMPLATE = [OVERDUE_COLUMNS.join(","), ...OVERDUE_TEMPLATE_ROWS].join("\n");

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

/** Choose a day and a file → preview what it changes → commit. */
export function ImportWorkflow() {
  const { t, locale } = useI18n();
  const fileInput = useRef<HTMLInputElement>(null);
  const dateId = useId();
  const [asOfDate, setAsOfDate] = useState(() => istDayOf(new Date()));
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<MessageKey | null>(null);
  const [dragging, setDragging] = useState(false);

  const preview = usePreviewImport();
  const commit = useCommitImport();

  function choose(f: File | undefined) {
    preview.reset();
    commit.reset();
    if (!f) return;
    if (!/\.csv$/i.test(f.name) && f.type !== "text/csv") {
      setFile(null);
      setFileError("import.notCsv");
      return;
    }
    if (f.size > MAX_IMPORT_CSV_BYTES) {
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

  async function check() {
    if (!file) return;
    preview.mutate({ asOfDate, fileName: file.name, csv: await file.text() });
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
    <>
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
              <ImportSummaryPanel summary={committed.summary} />
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
                aria-label={t("import.file")}
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
                onClick={() => void check()}
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

              <ImportSummaryPanel summary={result.summary} />

              {result.errors.length > 0 && (
                <ImportErrors errors={result.errors} total={result.summary.errors} />
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
    </>
  );
}
