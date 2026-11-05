"use client";

import type { BoardLoan, BoardOfficer } from "@kisht/contracts";
import { ArrowDown, ArrowUp, Pin, Users } from "lucide-react";
import { useState } from "react";
import { Badge, Button, Card, cx, EmptyState, ErrorState, Skeleton } from "@/components/ui";
import { DpdBadge, PromiseBadge } from "@/features/field/LoanCard";
import { useReasonText } from "@/features/field/useReasonText";
import { dateTime, day, number, rupees, rupeesShort } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { ClearDisputeSheet, MoveSheet, ReassignSheet } from "./ActionSheets";
import { useBoard, useUnpin } from "./api";
import { LoanLink } from "./LoanView";

type Action =
  | { kind: "move"; loan: BoardLoan; officerId: string; position: number }
  | { kind: "reassign"; loan: BoardLoan; currentId: string | null }
  | { kind: "clear"; loan: BoardLoan };

const icon =
  "inline-flex size-10 items-center justify-center rounded-lg text-muted hover:bg-surface hover:text-ink disabled:opacity-30 disabled:hover:bg-transparent";

function LoanSummary({ loan }: { loan: BoardLoan }) {
  const { t } = useI18n();
  const reasonText = useReasonText();
  return (
    <div className="min-w-0 flex-1">
      <LoanLink loanId={loan.loanId} name={loan.borrowerName} className="font-medium" />
      <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <span className="num">{rupees(loan.outstanding)}</span>
        <DpdBadge dpd={loan.dpd} />
        <PromiseBadge promise={loan.promise} />
      </div>
      {loan.topReason && <p className="mt-1 text-sm text-muted">{reasonText(loan.topReason)}</p>}
      {loan.pin && (
        <p className="mt-1 flex items-start gap-1 text-sm text-accent">
          <Pin className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          {t("board.pinned", { reason: loan.pin.reason })}
        </p>
      )}
    </div>
  );
}

function OfficerList({
  officer,
  onAction,
}: {
  officer: BoardOfficer;
  onAction: (a: Action) => void;
}) {
  const { t } = useI18n();
  const unpin = useUnpin();
  const todo = officer.loans.filter((l) => l.state === "todo");
  const rest = officer.loans.filter((l) => l.state !== "todo");
  const stake = todo.reduce((sum, l) => sum + (l.expectedLoss ?? 0), 0);
  return (
    <Card className="shadow-xs">
      <div className="border-b border-line px-5 py-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-base text-ink tracking-tight">{officer.name}</h2>
            <span className="num rounded-full border border-line bg-surface px-2 py-0.5 text-xs font-semibold text-muted">
              {todo.length} / {officer.capacity}
            </span>
          </div>
          <span className="num text-xs font-medium text-muted">
            {t("board.toDo", { n: todo.length, capacity: officer.capacity })} ·{" "}
            {t("today.atStake", { amount: rupeesShort(stake) })}
          </span>
        </div>
        <div className="mt-2.5 flex items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface">
            <div
              className={cx(
                "h-full rounded-full transition-all duration-300",
                todo.length >= officer.capacity ? "bg-warn" : "bg-accent",
              )}
              style={{ width: `${Math.min(100, (todo.length / officer.capacity) * 100)}%` }}
            />
          </div>
          <p className="num shrink-0 text-[11px] font-medium text-faint">
            {officer.pincodes.join(", ")}
          </p>
        </div>
      </div>
      {officer.loans.length === 0 ? (
        <EmptyState title={t("board.emptyOfficer")} />
      ) : (
        <ol className="divide-y divide-line" data-testid="officer-list">
          {todo.map((loan, i) => (
            <li
              key={loan.loanId}
              className="flex gap-3 px-5 py-3.5 hover:bg-surface/30 transition-colors"
            >
              <span className="flex size-6 shrink-0 items-center justify-center rounded-lg border border-line/70 bg-surface text-xs font-bold num text-muted mt-0.5">
                {i + 1}
              </span>
              <LoanSummary loan={loan} />
              <div className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-start">
                <div className="flex">
                  <button
                    type="button"
                    className={icon}
                    disabled={i === 0}
                    aria-label={t("board.up", { name: loan.borrowerName })}
                    onClick={() =>
                      onAction({ kind: "move", loan, officerId: officer.id, position: i })
                    }
                  >
                    <ArrowUp className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    className={icon}
                    disabled={i === todo.length - 1}
                    aria-label={t("board.down", { name: loan.borrowerName })}
                    onClick={() =>
                      onAction({ kind: "move", loan, officerId: officer.id, position: i + 2 })
                    }
                  >
                    <ArrowDown className="size-4" aria-hidden />
                  </button>
                </div>
                <div className="flex gap-1">
                  {loan.pin && (
                    <Button
                      variant="ghost"
                      onClick={() => unpin.mutate({ officerId: officer.id, loanId: loan.loanId })}
                    >
                      {t("board.unpin")}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    onClick={() => onAction({ kind: "reassign", loan, currentId: officer.id })}
                  >
                    {t("board.reassign")}
                  </Button>
                </div>
              </div>
            </li>
          ))}
          {rest.map((loan) => (
            <li
              key={loan.loanId}
              className="flex items-center gap-3 bg-surface/50 px-4 py-2.5 text-sm"
            >
              <span className="min-w-0 flex-1 truncate text-muted">
                <LoanLink loanId={loan.loanId} name={loan.borrowerName} />
              </span>
              <Badge>{t(`board.state.${loan.state}`)}</Badge>
              {loan.state !== "paused" && (
                <Button
                  variant="ghost"
                  onClick={() => onAction({ kind: "reassign", loan, currentId: officer.id })}
                >
                  {t("board.reassign")}
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}

export function BoardScreen() {
  const { t, locale } = useI18n();
  const board = useBoard();
  const [selected, setSelected] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);

  const header = (
    <div>
      <h1 className="text-2xl font-semibold">{t("board.title")}</h1>
      <p className="mt-1 max-w-2xl text-sm text-muted">{t("board.subtitle")}</p>
    </div>
  );

  if (board.isPending) {
    return (
      <div className="space-y-4">
        {header}
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (board.error) {
    return (
      <div className="space-y-4">
        {header}
        <ErrorState error={board.error} onRetry={() => void board.refetch()} />
      </div>
    );
  }

  const { officers, unassigned, disputes, asOfDate } = board.data;
  if (officers.length === 0) {
    return (
      <div className="space-y-4">
        {header}
        <Card>
          <EmptyState icon={<Users className="size-8" />} title={t("board.noOfficers")} />
        </Card>
      </div>
    );
  }
  const officer = officers.find((o) => o.id === selected) ?? officers[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {header}
        {asOfDate && (
          <span className="text-sm text-muted">
            {t("board.asOf", { date: day(asOfDate, locale) })}
          </span>
        )}
      </div>

      {disputes.length > 0 && (
        <section>
          <h2 className="font-medium">
            {t("board.disputes")} <span className="num text-muted">({disputes.length})</span>
          </h2>
          <p className="text-sm text-muted">{t("board.disputesHint")}</p>
          <Card className="mt-2">
            <ul className="divide-y divide-line">
              {disputes.map((d) => (
                <li key={d.loanId} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <LoanSummary loan={d} />
                    <p className="mt-1 text-sm">
                      {d.note && <span>“{d.note}” · </span>}
                      <span className="text-muted">
                        {d.officerName ?? t("board.noOfficer")}
                        {d.raisedAt && ` · ${dateTime(d.raisedAt, locale)}`}
                      </span>
                    </p>
                  </div>
                  <Button variant="secondary" onClick={() => setAction({ kind: "clear", loan: d })}>
                    {t("board.clear")}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      {unassigned.length > 0 && (
        <section>
          <h2 className="font-medium">
            {t("board.unassigned")} <span className="num text-muted">({unassigned.length})</span>
          </h2>
          <p className="text-sm text-muted">{t("board.unassignedHint")}</p>
          <Card className="mt-2">
            <ul className="divide-y divide-line">
              {unassigned.map((loan) => (
                <li key={loan.loanId} className="flex flex-wrap items-start gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1 basis-56">
                    <LoanSummary loan={loan} />
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => setAction({ kind: "reassign", loan, currentId: null })}
                  >
                    {t("board.assign")}
                  </Button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      )}

      <section>
        <h2 className="font-medium">{t("board.lists")}</h2>
        <div className="mt-2 grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
          <ul
            className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-col lg:overflow-visible lg:px-0"
            aria-label={t("board.officer")}
          >
            {officers.map((o) => {
              const todo = o.loans.filter((l) => l.state === "todo").length;
              const active = o.id === officer?.id;
              return (
                <li key={o.id} className="shrink-0">
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => setSelected(o.id)}
                    className={cx(
                      "min-h-12 w-full rounded-xl border px-3 py-2 text-left text-sm",
                      active
                        ? "border-accent bg-accent-soft font-medium text-accent"
                        : "border-line bg-canvas hover:border-accent",
                    )}
                  >
                    <span className="block whitespace-nowrap">{o.name}</span>
                    <span
                      className={cx("num block text-xs", active ? "text-accent" : "text-muted")}
                    >
                      {t("board.toDoShort", { n: number(todo) })}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {officer && <OfficerList officer={officer} onAction={setAction} />}
        </div>
      </section>

      {action?.kind === "move" && (
        <MoveSheet
          loan={action.loan}
          officerId={action.officerId}
          position={action.position}
          onClose={() => setAction(null)}
        />
      )}
      {action?.kind === "reassign" && (
        <ReassignSheet
          loan={action.loan}
          officers={officers}
          currentId={action.currentId}
          onClose={() => setAction(null)}
        />
      )}
      {action?.kind === "clear" && (
        <ClearDisputeSheet loan={action.loan} onClose={() => setAction(null)} />
      )}
    </div>
  );
}
