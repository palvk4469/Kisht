"use client";

import { LoanDetail, RevealContactResponse } from "@kisht/contracts";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Phone } from "lucide-react";
import { useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Badge, Button, cx, ErrorState, Skeleton } from "@/components/ui";
import { DpdBadge, PromiseBadge } from "@/features/field/LoanCard";
import { useReasonText } from "@/features/field/useReasonText";
import { request } from "@/lib/api";
import { dateTime, rupees } from "@/lib/format";
import { useI18n } from "@/lib/i18n";

const OUTCOME_TONE = {
  PAID: "ok",
  PROMISE: "accent",
  NOT_REACHABLE: "neutral",
  DISPUTE: "risk",
} as const;

function LoanBody({ loanId }: { loanId: string }) {
  const { t, locale } = useI18n();
  const reasonText = useReasonText();
  const loan = useQuery({
    queryKey: ["manager", "loan", loanId],
    queryFn: () => request(`/api/loans/${encodeURIComponent(loanId)}`, { schema: LoanDetail }),
  });
  // DPDP: masked by default. The full number is an explicit, audited request.
  const reveal = useMutation({
    mutationFn: () =>
      request(`/api/loans/${encodeURIComponent(loanId)}/reveal-contact`, {
        method: "POST",
        schema: RevealContactResponse,
      }),
  });

  if (loan.isPending) return <Skeleton className="mt-4 h-40 w-full" />;
  if (loan.error) {
    return (
      <div className="mt-4">
        <ErrorState error={loan.error} onRetry={() => void loan.refetch()} />
      </div>
    );
  }
  const d = loan.data;
  return (
    <div className="mt-3 space-y-4 text-sm">
      <div className="rounded-xl border border-line/70 bg-surface/40 p-4 shadow-xs">
        <p className="text-base font-bold text-ink tracking-tight">{d.borrower.name}</p>
        <p className="mt-0.5 text-xs text-muted">
          {d.loanNo} · {d.borrower.address}
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {d.latest && (
            <span className="num font-bold text-ink">{rupees(d.latest.outstanding)}</span>
          )}
          {d.latest && <DpdBadge dpd={d.latest.dpd} />}
          <PromiseBadge promise={d.promise} />
        </div>
      </div>

      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-2 rounded-xl border border-line/60 bg-canvas p-3.5 shadow-2xs">
        <dt className="text-xs font-medium text-muted">{t("loanView.officer")}</dt>
        <dd className="font-medium text-ink">{d.officer?.name ?? t("board.noOfficer")}</dd>
        <dt className="text-xs font-medium text-muted">{t("loanView.phone")}</dt>
        <dd className="num flex flex-wrap items-center gap-2">
          {reveal.data ? (
            <a
              href={`tel:${reveal.data.phone}`}
              className="inline-flex items-center gap-1 font-semibold text-accent underline underline-offset-2"
            >
              <Phone className="size-3.5" aria-hidden />
              {reveal.data.phone}
            </a>
          ) : (
            <>
              <span className="font-mono text-xs">{d.borrower.phoneMasked}</span>
              <Button variant="ghost" busy={reveal.isPending} onClick={() => reveal.mutate()}>
                {t("loanView.reveal")}
              </Button>
            </>
          )}
        </dd>
      </dl>
      {!reveal.data && <p className="text-xs text-muted">{t("loanView.revealHint")}</p>}
      {reveal.error && <ErrorState error={reveal.error} />}

      {d.priority && (
        <div>
          <h3 className="font-medium">{t("loan.why")}</h3>
          <ul className="mt-1 list-inside list-disc text-muted">
            {d.priority.reasons.map((r) => (
              <li key={r.code}>{reasonText(r)}</li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="font-medium">{t("loan.history")}</h3>
        {d.history.length === 0 ? (
          <p className="mt-1 text-muted">{t("loan.historyEmpty")}</p>
        ) : (
          <ul className="mt-1 space-y-2">
            {d.history.map((h) => (
              <li key={h.id}>
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={OUTCOME_TONE[h.type]}>{t(`outcome.${h.type}`)}</Badge>
                  <span className="text-xs text-muted">{dateTime(h.at, locale)}</span>
                </div>
                {h.note && <p className="mt-0.5 text-muted">{h.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/** A borrower's name that opens their loan, wherever a manager sees it. */
export function LoanLink({
  loanId,
  name,
  className,
}: {
  loanId: string;
  name: string;
  className?: string;
}) {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("loanView.open", { name })}
        className={cx("min-h-6 text-left underline-offset-2 hover:underline", className)}
      >
        {name}
      </button>
      {open && (
        <Sheet title={t("loanView.title")} onClose={() => setOpen(false)}>
          <LoanBody loanId={loanId} />
        </Sheet>
      )}
    </>
  );
}
