import { addDays, type IsoDay } from "./dates.ts";

// Roll rate, the brief's headline metric (A6): of the loans 1–30 days past due
// on day D, the share that are 31+ DPD on day D + 30. A loan missing from the
// later day's overdue list was cured, so it did not roll.

export const ROLL_HORIZON_DAYS = 30;
const BUCKET_MAX = 30;

export type DpdObservation = { loanId: string; asOfDate: IsoDay; dpd: number };

export type RollCohort = { day: IsoDay; cohort: number; rolled: number; rate: number | null };

export type RollRate = {
  cohort: number;
  rolled: number;
  rate: number | null;
  cohorts: RollCohort[];
};

/**
 * Roll rate over cohorts starting every `stepDays` from `from` while D + 30 is
 * still on or before `to`. Cohorts are pooled (total rolled / total cohort), so
 * busy days weigh more than quiet ones.
 */
export function rollRate(
  observations: Iterable<DpdObservation>,
  range: { from: IsoDay; to: IsoDay; stepDays?: number },
): RollRate {
  const byDay = new Map<IsoDay, Map<string, number>>();
  for (const o of observations) {
    const day = byDay.get(o.asOfDate) ?? new Map<string, number>();
    day.set(o.loanId, o.dpd);
    byDay.set(o.asOfDate, day);
  }

  const cohorts: RollCohort[] = [];
  const step = range.stepDays ?? 7;
  for (let d = range.from; addDays(d, ROLL_HORIZON_DAYS) <= range.to; d = addDays(d, step)) {
    const start = byDay.get(d);
    if (!start) continue;
    const later = byDay.get(addDays(d, ROLL_HORIZON_DAYS));
    let cohort = 0;
    let rolled = 0;
    for (const [loanId, dpd] of start) {
      if (dpd < 1 || dpd > BUCKET_MAX) continue;
      cohort++;
      if ((later?.get(loanId) ?? 0) > BUCKET_MAX) rolled++;
    }
    cohorts.push({ day: d, cohort, rolled, rate: cohort ? rolled / cohort : null });
  }

  const cohort = cohorts.reduce((n, c) => n + c.cohort, 0);
  const rolled = cohorts.reduce((n, c) => n + c.rolled, 0);
  return { cohort, rolled, rate: cohort ? rolled / cohort : null, cohorts };
}
