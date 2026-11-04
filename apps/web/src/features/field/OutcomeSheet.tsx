"use client";

import type { OutcomeType, SyncReason } from "@kisht/contracts";
import { addDays, istDayOf } from "@kisht/domain";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button, cx, ErrorState } from "@/components/ui";
import { day } from "@/lib/format";
import { type MessageKey, useI18n } from "@/lib/i18n";
import { useLogOutcome } from "./api";
import { useFlash } from "./Flash";

type Props = {
  type: OutcomeType;
  loanId: string;
  borrowerName: string;
  emiAmount: number;
  openAttemptClientId: string | null;
  now: Date;
  onClose: () => void;
};

const TITLES: Record<OutcomeType, MessageKey> = {
  PAID: "sheet.paidTitle",
  PROMISE: "sheet.promiseTitle",
  NOT_REACHABLE: "sheet.notReachableTitle",
  DISPUTE: "sheet.disputeTitle",
};

const PROMISE_CHOICES = [1, 3, 7];

const field =
  "mt-1.5 h-12 w-full rounded-xl border border-line bg-canvas px-3 text-base outline-none focus:border-accent";

/**
 * The third tap. Everything is already filled in: a promise's date chip is
 * the confirmation itself, and the rest confirm with one button. Details are
 * there for when they're needed, out of the way when they're not.
 */
export function OutcomeSheet(props: Props) {
  const { type, emiAmount } = props;
  const { t, locale } = useI18n();
  const router = useRouter();
  const flash = useFlash();
  const log = useLogOutcome();
  const amountId = useId();
  const noteId = useId();
  const [amount, setAmount] = useState(String(emiAmount));
  const [note, setNote] = useState("");
  const [showDetails, setShowDetails] = useState(type === "PAID" || type === "DISPUTE");
  const [refusal, setRefusal] = useState<SyncReason | null>(null);
  const today = istDayOf(props.now);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && props.onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [props.onClose]);

  const parsedAmount = Number(amount);
  const validAmount = Number.isInteger(parsedAmount) && parsedAmount > 0;

  function submit(promiseDueDate: string | null) {
    setRefusal(null);
    log.mutate(
      {
        loanId: props.loanId,
        openAttemptClientId: props.openAttemptClientId,
        type,
        amount: type === "PAID" || type === "PROMISE" ? parsedAmount : null,
        promiseDueDate,
        note: note.trim() || null,
      },
      {
        onSuccess: (result) => {
          if (result?.status === "recorded" || result?.status === "duplicate") {
            flash(t("saved.flash", { type: t(`outcome.${type}`), name: props.borrowerName }));
            router.replace("/today");
          } else {
            setRefusal(result?.reason ?? "ATTEMPT_NOT_FOUND");
          }
        },
      },
    );
  }

  return (
    <div
      className="fixed inset-0 z-20 flex items-end justify-center"
      role="dialog"
      aria-modal
      aria-label={t(TITLES[type])}
    >
      <button
        type="button"
        aria-label={t("common.cancel")}
        onClick={props.onClose}
        className="absolute inset-0 bg-ink/40"
      />
      <div className="relative w-full max-w-md rounded-t-2xl bg-canvas p-5 pb-6 shadow-xl">
        <h2 className="text-lg font-semibold">{t(TITLES[type])}</h2>
        {type === "PAID" && <p className="mt-1 text-sm text-muted">{t("sheet.paidHint")}</p>}
        {type === "DISPUTE" && <p className="mt-1 text-sm text-warn">{t("sheet.disputeHint")}</p>}

        {showDetails ? (
          <div className="mt-4 space-y-3">
            {(type === "PAID" || type === "PROMISE") && (
              <div>
                <label htmlFor={amountId} className="text-sm font-medium">
                  {t("sheet.amount")}
                </label>
                <input
                  id={amountId}
                  inputMode="numeric"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                  className={cx(field, "num")}
                />
              </div>
            )}
            <div>
              <label htmlFor={noteId} className="text-sm font-medium">
                {t("sheet.note")}
              </label>
              <input
                id={noteId}
                value={note}
                maxLength={500}
                onChange={(e) => setNote(e.target.value)}
                className={field}
              />
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            className="mt-2 min-h-10 text-sm text-accent underline underline-offset-2"
          >
            {t("sheet.details")}
          </button>
        )}

        {refusal && (
          <p role="alert" className="mt-3 rounded-xl bg-risk-soft px-4 py-3 text-sm text-risk">
            {t(`syncError.${refusal}`)}
          </p>
        )}
        {log.error && (
          <div className="mt-3">
            <ErrorState error={log.error} />
          </div>
        )}

        {type === "PROMISE" ? (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {PROMISE_CHOICES.map((n) => {
              const due = addDays(today, n);
              return (
                <button
                  key={n}
                  type="button"
                  disabled={log.isPending || !validAmount}
                  onClick={() => submit(due)}
                  className="flex min-h-16 flex-col items-center justify-center rounded-xl border border-line px-1 hover:border-accent hover:bg-accent-soft disabled:opacity-50"
                >
                  <span className="font-medium">
                    {n === 1 ? t("sheet.tomorrow") : t("sheet.inDays", { n })}
                  </span>
                  <span className="text-xs text-muted">{day(due, locale)}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <Button
            size="lg"
            variant={type === "DISPUTE" ? "danger" : "primary"}
            className="mt-4 w-full"
            busy={log.isPending}
            disabled={type === "PAID" && !validAmount}
            onClick={() => submit(null)}
          >
            {log.isPending ? t("sheet.saving") : t("sheet.confirm")}
          </Button>
        )}
      </div>
    </div>
  );
}
