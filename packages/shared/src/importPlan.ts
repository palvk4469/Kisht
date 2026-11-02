import type { OverdueRow } from "./csv.js";
import { addDays, type IsoDay } from "./dates.js";

// What a day's overdue list tells us, compared with the previous import (A8).
//
//  - Payment: last_payment_date moved forward (amount from the export). If the
//    export didn't update the date but outstanding fell, the drop is taken as
//    a payment made the day before (the export runs a day behind).
//  - Cured: the loan was on the previous list and is not on this one. The
//    overdue export only lists loans with arrears, so dropping off it means
//    the arrears were cleared.
//  - New: first time this loan number has been seen.

export type PreviousState = {
  outstanding: number;
  lastPaymentDate: IsoDay | null;
};

export type DetectedPayment = {
  loanNo: string;
  date: IsoDay;
  amount: number;
  source: "LAST_PAYMENT_DATE" | "OUTSTANDING_DROP";
};

export type ImportPlan = {
  payments: DetectedPayment[];
  cured: string[];
  newLoans: string[];
};

export function planImport(input: {
  asOfDate: IsoDay;
  rows: readonly OverdueRow[];
  /** Latest known state of each loan before this import, by loan number. */
  previous: ReadonlyMap<string, PreviousState>;
  /** Loan numbers on the most recent earlier overdue list. */
  previousList: ReadonlySet<string>;
  /** Loan numbers that already exist in the system. */
  knownLoans: ReadonlySet<string>;
}): ImportPlan {
  const payments: DetectedPayment[] = [];
  const onList = new Set<string>();
  const newLoans: string[] = [];

  for (const row of input.rows) {
    onList.add(row.loanNo);
    if (!input.knownLoans.has(row.loanNo)) newLoans.push(row.loanNo);

    const prev = input.previous.get(row.loanNo);
    const dateMoved =
      row.lastPaymentDate !== null &&
      row.lastPaymentAmount !== null &&
      (!prev?.lastPaymentDate || row.lastPaymentDate > prev.lastPaymentDate);

    if (dateMoved && row.lastPaymentDate && row.lastPaymentAmount !== null) {
      payments.push({
        loanNo: row.loanNo,
        date: row.lastPaymentDate,
        amount: row.lastPaymentAmount,
        source: "LAST_PAYMENT_DATE",
      });
    } else if (prev && row.outstanding < prev.outstanding) {
      payments.push({
        loanNo: row.loanNo,
        date: addDays(input.asOfDate, -1),
        amount: prev.outstanding - row.outstanding,
        source: "OUTSTANDING_DROP",
      });
    }
  }

  const cured = [...input.previousList].filter((loanNo) => !onList.has(loanNo)).sort();
  return { payments, cured, newLoans };
}
