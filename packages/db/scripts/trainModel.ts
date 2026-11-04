// Trains the priority model on simulated history and back-tests it on a world
// it has never seen (A9). Writes model-v1.json and its metrics next to it.
//   pnpm --filter @kisht/db model:train
import { writeFileSync } from "node:fs";
import { addDays, istDayStart } from "@kisht/domain";
import {
  type BacktestRow,
  backtest,
  factsAt,
  type LoanEvents,
  type ModelParams,
  predict,
  scoreLoan,
  type TrainingRow,
  toVector,
  train,
} from "@kisht/domain/scoring";
import { eventsByLoan } from "../src/seed/scoringEvents.js";
import { type Simulation, simulate } from "../src/seed/simulate.js";

// Fixed, so retraining reproduces the same coefficients.
const TODAY = "2026-11-02";
const TRAIN_SEEDS = [101, 202, 303];
const TEST_SEED = 20261102; // The demo world's seed: the model never trains on it.
const HORIZON = 30;
// Lookback warm-up: early days have too little history to be representative.
const WARMUP = 60;
const OUT = new URL("../../domain/src/scoring/", import.meta.url).pathname;

type Sample = { day: string; loanId: string; events: LoanEvents; late: boolean };

function samples(sim: Simulation, stepDays: number): Sample[] {
  const events = eventsByLoan(sim);
  const dpdOn = new Map(sim.snapshots.map((s) => [`${s.loanId}|${s.asOfDate}`, s.dpd]));
  const out: Sample[] = [];
  const last = addDays(sim.today, -HORIZON);
  for (let d = addDays(sim.historyStart, WARMUP); d <= last; d = addDays(d, stepDays)) {
    for (const s of sim.snapshots) {
      if (s.asOfDate !== d) continue;
      const later = dpdOn.get(`${s.loanId}|${addDays(d, HORIZON)}`) ?? 0;
      const loanEvents = events.get(s.loanId);
      if (loanEvents) out.push({ day: d, loanId: s.loanId, events: loanEvents, late: later > 30 });
    }
  }
  return out;
}

function trainingRows(): TrainingRow[] {
  const rows: TrainingRow[] = [];
  for (const seed of TRAIN_SEEDS) {
    for (const s of samples(simulate(TODAY, seed), 3)) {
      const f = factsAt(s.events, s.day);
      if (f) rows.push({ x: toVector(f), y: s.late ? 1 : 0 });
    }
  }
  return rows;
}

function officerOn(sim: Simulation): (loanId: string, day: string) => string | null {
  const byLoan = new Map<string, Simulation["assignments"]>();
  for (const a of sim.assignments) {
    const list = byLoan.get(a.loanId) ?? [];
    list.push(a);
    byLoan.set(a.loanId, list);
  }
  return (loanId, day) => {
    const noon = new Date(istDayStart(day).getTime() + 12 * 3_600_000);
    const hit = byLoan
      .get(loanId)
      ?.find((a) => a.startedAt <= noon && (a.endedAt === null || a.endedAt > noon));
    return hit?.officer ?? null;
  };
}

function evaluate(model: ModelParams) {
  const sim = simulate(TODAY, TEST_SEED);
  const officer = officerOn(sim);
  const rows: BacktestRow[] = [];
  for (const s of samples(sim, 1)) {
    const f = factsAt(s.events, s.day);
    const who = officer(s.loanId, s.day);
    if (!f || !who) continue;
    const score = scoreLoan(model, f);
    rows.push({
      day: s.day,
      officer: who,
      dpd: f.dpd,
      outstanding: f.outstanding,
      probability: predict(model, toVector(f)),
      expectedLoss: score.expectedLoss,
      late: s.late,
    });
  }
  return { top5: backtest(rows, 5), top10: backtest(rows, 10) };
}

const rows = trainingRows();
const model = train(rows, { version: "v1" });
const metrics = evaluate(model);

const round = (o: unknown) =>
  JSON.parse(
    JSON.stringify(o, (_, v) => (typeof v === "number" ? Number(v.toFixed(6)) : v)),
  ) as unknown;
writeFileSync(`${OUT}model-v1.json`, `${JSON.stringify(round(model), null, 2)}\n`);
writeFileSync(
  `${OUT}model-v1.metrics.json`,
  `${JSON.stringify(
    round({
      trainedOn: { seeds: TRAIN_SEEDS, rows: rows.length, note: "simulated history (A9)" },
      testedOn: { seed: TEST_SEED, note: "the demo world, never used in training" },
      ...metrics,
    }),
    null,
    2,
  )}\n`,
);
console.log(`Trained on ${rows.length} rows.`);
console.log(JSON.stringify(round(metrics.top10), null, 2));
console.log("top5 coverage", JSON.stringify(round(metrics.top5.coverage)));
