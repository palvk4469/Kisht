"use client";

import type { OutcomeType } from "@kisht/contracts";
import { addDays, istDayOf } from "@kisht/domain";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, cx } from "@/components/ui";
import { day, rupees } from "@/lib/format";
import { type MessageKey, useI18n } from "@/lib/i18n";
import { useFieldLog } from "./api";
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
  const { logOutcome } = useFieldLog();
  const [saving, setSaving] = useState(false);
  const amountId = useId();
  const noteId = useId();
  const [amount, setAmount] = useState(String(emiAmount));
  const [note, setNote] = useState("");
  const [showDetails, setShowDetails] = useState(type === "PAID" || type === "DISPUTE");
  const today = istDayOf(props.now);

  const parsedAmount = Number(amount);
  const validAmount = Number.isInteger(parsedAmount) && parsedAmount > 0;

  async function submit(promiseDueDate: string | null) {
    setSaving(true);
    await logOutcome({
      loanId: props.loanId,
      borrowerName: props.borrowerName,
      openAttemptClientId: props.openAttemptClientId,
      type,
      amount: type === "PAID" || type === "PROMISE" ? parsedAmount : null,
      promiseDueDate,
      note: note.trim() || null,
    });
    // Safe on the phone from here; if the server refuses it later, the sync bar says so.
    flash(t("saved.flash", { type: t(`outcome.${type}`), name: props.borrowerName }));
    router.replace("/today");
  }

  return (
    <Sheet title={t(TITLES[type])} onClose={props.onClose}>
      {type === "PAID" && <p className="mt-1 text-sm text-muted">{t("sheet.paidHint")}</p>}
      {type === "DISPUTE" && <p className="mt-1 text-sm text-warn">{t("sheet.disputeHint")}</p>}

      {showDetails ? (
        <div className="mt-4 space-y-3.5">
          {(type === "PAID" || type === "PROMISE") && (
            <div>
              <label htmlFor={amountId} className="text-sm font-medium">
                {t("sheet.amount")}
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted font-medium">
                  ₹
                </span>
                <input
                  id={amountId}
                  inputMode="numeric"
                  maxLength={9}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/\D/g, ""))}
                  className={cx(field, "num pl-8 font-semibold text-lg")}
                />
              </div>
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
              placeholder={t("sheet.notePlaceholder")}
              onChange={(e) => setNote(e.target.value)}
              className={field}
            />
          </div>
        </div>
      ) : (
        <div className="mt-3 flex items-center justify-between rounded-xl border border-line/60 bg-surface/50 px-3.5 py-2 text-xs text-muted">
          <span>
            {t("sheet.amount")}:{" "}
            <strong className="num text-sm text-ink">
              {rupees(validAmount ? parsedAmount : emiAmount)}
            </strong>
          </span>
          <button
            type="button"
            onClick={() => setShowDetails(true)}
            className="-my-1 -mr-2 inline-flex min-h-12 items-center px-2 text-right font-medium text-accent underline underline-offset-2"
          >
            {t("sheet.details")}
          </button>
        </div>
      )}

      {type === "PROMISE" ? (
        <div className="mt-4 grid grid-cols-3 gap-2.5">
          {PROMISE_CHOICES.map((n) => {
            const due = addDays(today, n);
            return (
              <button
                key={n}
                type="button"
                disabled={saving || !validAmount}
                onClick={() => void submit(due)}
                className="flex min-h-18 flex-col items-center justify-center rounded-2xl border border-line bg-canvas p-2.5 shadow-xs transition-all hover:border-accent hover:bg-accent-soft active:scale-[0.98] disabled:opacity-50"
              >
                <span className="font-semibold text-sm">
                  {n === 1 ? t("sheet.tomorrow") : t("sheet.inDays", { n })}
                </span>
                <span className="mt-0.5 text-xs text-muted">{day(due, locale)}</span>
              </button>
            );
          })}
        </div>
      ) : (
        <Button
          size="lg"
          variant={type === "DISPUTE" ? "danger" : "primary"}
          className="mt-4 w-full"
          busy={saving}
          disabled={type === "PAID" && !validAmount}
          onClick={() => void submit(null)}
        >
          {saving ? t("sheet.saving") : t("sheet.confirm")}
        </Button>
      )}
    </Sheet>
  );
}
