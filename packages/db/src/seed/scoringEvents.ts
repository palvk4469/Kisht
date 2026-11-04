import { istDayOf } from "@kisht/domain";
import type { LoanEvents } from "@kisht/domain/scoring";
import type { Simulation } from "./simulate.js";

/** Groups a simulation's rows by loan, in the shape the scoring features read. */
export function eventsByLoan(sim: Simulation): Map<string, LoanEvents> {
  const out = new Map<string, { snapshots: unknown[]; promises: unknown[]; outcomes: unknown[] }>();
  const entry = (id: string) => {
    let e = out.get(id);
    if (!e) {
      e = { snapshots: [], promises: [], outcomes: [] };
      out.set(id, e);
    }
    return e;
  };
  for (const s of sim.snapshots) entry(s.loanId).snapshots.push(s);
  for (const p of sim.promises) entry(p.loanId).promises.push(p);
  for (const o of sim.outcomes)
    entry(o.loanId).outcomes.push({ day: istDayOf(o.at), type: o.type });
  return out as unknown as Map<string, LoanEvents>;
}
