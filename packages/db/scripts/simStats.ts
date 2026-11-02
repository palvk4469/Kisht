// Prints calibration numbers for the seed simulation (quoted in the TDD).
//   pnpm --filter @kisht/db sim:stats
import { addDays, istDayOf } from "@kisht/shared";
import { simulate } from "../src/seed/simulate.js";

const today = process.env.SEED_TODAY ?? istDayOf(new Date());
const started = Date.now();
const sim = simulate(today);
const ms = Date.now() - started;

const dpdOn = new Map<string, number>();
for (const s of sim.snapshots) dpdOn.set(`${s.loanId}|${s.asOfDate}`, s.dpd);

// Roll rate: loans at 1-30 DPD on day D (weekly cohorts) that are 31+ on D+30 (A6).
let cohort = 0;
let rolled = 0;
for (let d = sim.historyStart; addDays(d, 30) <= today; d = addDays(d, 7)) {
  for (const s of sim.snapshots) {
    if (s.asOfDate !== d || s.dpd < 1 || s.dpd > 30) continue;
    cohort++;
    if ((dpdOn.get(`${s.loanId}|${addDays(d, 30)}`) ?? 0) >= 31) rolled++;
  }
}

const todays = sim.snapshots.filter((s) => s.asOfDate === today).map((s) => s.dpd);
const count = (status: string) => sim.promises.filter((p) => p.status === status).length;
const resolved = count("KEPT") + count("PARTIAL") + count("BROKEN");

console.table({
  "simulation time (ms)": ms,
  loans: sim.loans.length,
  snapshots: sim.snapshots.length,
  "contact attempts": sim.attempts.length,
  "blocked attempts (after 7 pm)": sim.attempts.filter((a) => !a.allowed).length,
  promises: sim.promises.length,
  "promise kept rate": (count("KEPT") / resolved).toFixed(3),
  "roll rate 1-30 -> 31+": (rolled / cohort).toFixed(3),
  "overdue today": todays.length,
  "1-30 DPD": todays.filter((d) => d <= 30).length,
  "31-60 DPD": todays.filter((d) => d > 30 && d <= 60).length,
  "61-90 DPD": todays.filter((d) => d > 60 && d <= 90).length,
  "90+ DPD": todays.filter((d) => d > 90).length,
  "contact paused (dispute)": sim.loans.filter((l) => l.contactPaused).length,
});
