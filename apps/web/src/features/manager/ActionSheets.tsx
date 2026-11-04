"use client";

import type { BoardLoan, BoardOfficer } from "@kisht/contracts";
import { type FormEvent, useId, useState } from "react";
import { Sheet } from "@/components/Sheet";
import { Button, ErrorState } from "@/components/ui";
import { useI18n } from "@/lib/i18n";
import { useClearDispute, useMoveLoan, useReassign } from "./api";

const field =
  "mt-1.5 h-12 w-full rounded-xl border border-line bg-canvas px-3 text-base outline-none focus:border-accent";
const MIN_REASON = 3;

function ReasonField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = useId();
  return (
    <div className="mt-4">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        value={value}
        maxLength={300}
        onChange={(e) => onChange(e.target.value)}
        className={field}
      />
    </div>
  );
}

type Base = { loan: BoardLoan; onClose: () => void };

/** Asked every time: overruling the model or a colleague leaves a reason on record. */
export function MoveSheet({
  loan,
  officerId,
  position,
  onClose,
}: Base & { officerId: string; position: number }) {
  const { t } = useI18n();
  const move = useMoveLoan();
  const [reason, setReason] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    move.mutate({ officerId, loanId: loan.loanId, position, reason }, { onSuccess: onClose });
  };
  return (
    <Sheet title={t("board.moveTitle", { n: position })} onClose={onClose}>
      <p className="mt-1 text-sm text-muted">{loan.borrowerName}</p>
      <form onSubmit={submit}>
        <ReasonField label={t("board.reason")} value={reason} onChange={setReason} />
        <p className="mt-1 text-xs text-muted">{t("board.reasonHint")}</p>
        {move.error && (
          <div className="mt-3">
            <ErrorState error={move.error} />
          </div>
        )}
        <Button
          type="submit"
          size="lg"
          className="mt-4 w-full"
          busy={move.isPending}
          disabled={reason.trim().length < MIN_REASON}
        >
          {t("board.moveConfirm")}
        </Button>
      </form>
    </Sheet>
  );
}

export function ReassignSheet({
  loan,
  officers,
  currentId,
  onClose,
}: Base & { officers: BoardOfficer[]; currentId: string | null }) {
  const { t } = useI18n();
  const reassign = useReassign();
  const selectId = useId();
  const choices = officers.filter((o) => o.id !== currentId);
  // An officer who already covers this pincode is the likely choice.
  const covering = choices.find((o) => o.pincodes.includes(loan.pincode));
  const [officerId, setOfficerId] = useState(covering?.id ?? choices[0]?.id ?? "");
  const [reason, setReason] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    reassign.mutate({ loanId: loan.loanId, officerId, reason }, { onSuccess: onClose });
  };
  return (
    <Sheet title={currentId ? t("board.reassign") : t("board.assign")} onClose={onClose}>
      <p className="mt-1 text-sm text-muted">
        {loan.borrowerName} · {loan.pincode}
      </p>
      <form onSubmit={submit}>
        <div className="mt-4">
          <label htmlFor={selectId} className="text-sm font-medium">
            {t("board.officer")}
          </label>
          <select
            id={selectId}
            value={officerId}
            onChange={(e) => setOfficerId(e.target.value)}
            className={field}
          >
            {choices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.loans.length})
              </option>
            ))}
          </select>
        </div>
        <ReasonField label={t("board.reason")} value={reason} onChange={setReason} />
        {reassign.error && (
          <div className="mt-3">
            <ErrorState error={reassign.error} />
          </div>
        )}
        <Button
          type="submit"
          size="lg"
          className="mt-4 w-full"
          busy={reassign.isPending}
          disabled={!officerId || reason.trim().length < MIN_REASON}
        >
          {t("board.reassignConfirm")}
        </Button>
      </form>
    </Sheet>
  );
}

export function ClearDisputeSheet({ loan, onClose }: Base) {
  const { t } = useI18n();
  const clear = useClearDispute();
  const [note, setNote] = useState("");
  const submit = (e: FormEvent) => {
    e.preventDefault();
    clear.mutate({ loanId: loan.loanId, note }, { onSuccess: onClose });
  };
  return (
    <Sheet title={t("board.clearTitle")} onClose={onClose}>
      <p className="mt-1 text-sm text-muted">{loan.borrowerName}</p>
      <form onSubmit={submit}>
        <ReasonField label={t("board.clearNote")} value={note} onChange={setNote} />
        {clear.error && (
          <div className="mt-3">
            <ErrorState error={clear.error} />
          </div>
        )}
        <Button
          type="submit"
          size="lg"
          className="mt-4 w-full"
          busy={clear.isPending}
          disabled={note.trim().length < MIN_REASON}
        >
          {t("board.clearConfirm")}
        </Button>
      </form>
    </Sheet>
  );
}
