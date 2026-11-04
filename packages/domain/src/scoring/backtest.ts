import { compareByPriority, ROLL_DPD } from "./model.ts";

// Compares a ranking with what actually happened: of the rupees that rolled,
// how much sat in the part of each officer's list they would reach first?
// This measures targeting, not causation: being on top of the list doesn't
// prove a call would have saved the loan.

export type BacktestRow = {
  day: string;
  officer: string;
  dpd: number;
  outstanding: number;
  probability: number;
  expectedLoss: number;
  /** 31+ DPD thirty days later. */
  late: boolean;
};

export type BacktestMetrics = {
  rows: number;
  auc: number;
  /** AUC among 1–30 DPD loans only: does it tell which of them will roll? */
  aucWithin30: number;
  /** The same, for DPD alone: the bar a model has to clear. */
  aucWithin30DpdOnly: number;
  rollRate: number;
  calibration: { predicted: number; actual: number; n: number }[];
  /** Share of rolled rupees inside the first `topK` loans per officer, per day. */
  coverage: { topK: number; model: number; oldestFirst: number; oldestWithin30: number };
  /** Same, in rupees of expected loss (× NPA × LGD) per day. */
  rollingRupeesPerDay: { total: number; model: number; oldestFirst: number };
};

/** Probability a random late loan scores above a random non-late one (ties count half). */
export function auc(rows: readonly { score: number; label: boolean }[]): number {
  const sorted = [...rows].sort((a, b) => a.score - b.score);
  let rankSum = 0;
  let positives = 0;
  let i = 0;
  while (i < sorted.length) {
    let j = i;
    while (j < sorted.length && sorted[j]?.score === sorted[i]?.score) j++;
    const midRank = (i + j + 1) / 2;
    for (let k = i; k < j; k++) {
      if (sorted[k]?.label) {
        rankSum += midRank;
        positives++;
      }
    }
    i = j;
  }
  const negatives = sorted.length - positives;
  if (positives === 0 || negatives === 0) return 0.5;
  return (rankSum - (positives * (positives + 1)) / 2) / (positives * negatives);
}

function calibration(rows: readonly BacktestRow[], buckets = 10) {
  const sorted = [...rows].sort((a, b) => a.probability - b.probability);
  const out: BacktestMetrics["calibration"] = [];
  for (let b = 0; b < buckets; b++) {
    const slice = sorted.slice(
      Math.floor((b * sorted.length) / buckets),
      Math.floor(((b + 1) * sorted.length) / buckets),
    );
    if (slice.length === 0) continue;
    out.push({
      predicted: slice.reduce((a, r) => a + r.probability, 0) / slice.length,
      actual: slice.filter((r) => r.late).length / slice.length,
      n: slice.length,
    });
  }
  return out;
}

export function backtest(
  rows: readonly BacktestRow[],
  topK: number,
  lossRate = 0.07,
): BacktestMetrics {
  const rolledValue = (r: BacktestRow) => (r.dpd <= ROLL_DPD && r.late ? r.outstanding : 0);
  const groups = new Map<string, BacktestRow[]>();
  for (const r of rows) {
    const key = `${r.day}|${r.officer}`;
    const group = groups.get(key) ?? [];
    group.push(r);
    groups.set(key, group);
  }

  let total = 0;
  let model = 0;
  let oldest = 0;
  let oldest30 = 0;
  const sumTop = (list: BacktestRow[]) =>
    list.slice(0, topK).reduce((sum, r) => sum + rolledValue(r), 0);
  for (const group of groups.values()) {
    total += group.reduce((sum, r) => sum + rolledValue(r), 0);
    model += sumTop([...group].sort(compareByPriority));
    oldest += sumTop([...group].sort((a, b) => b.dpd - a.dpd));
    oldest30 += sumTop(
      [...group].sort((a, b) => {
        const inA = a.dpd <= ROLL_DPD ? 1 : 0;
        const inB = b.dpd <= ROLL_DPD ? 1 : 0;
        return inB - inA || b.dpd - a.dpd;
      }),
    );
  }

  const inBucket = rows.filter((r) => r.dpd <= ROLL_DPD);
  const days = new Set(rows.map((r) => r.day)).size || 1;
  return {
    rows: rows.length,
    auc: auc(rows.map((r) => ({ score: r.probability, label: r.late }))),
    aucWithin30: auc(inBucket.map((r) => ({ score: r.probability, label: r.late }))),
    aucWithin30DpdOnly: auc(inBucket.map((r) => ({ score: r.dpd, label: r.late }))),
    rollRate: inBucket.filter((r) => r.late).length / (inBucket.length || 1),
    calibration: calibration(rows),
    coverage: {
      topK,
      model: model / (total || 1),
      oldestFirst: oldest / (total || 1),
      oldestWithin30: oldest30 / (total || 1),
    },
    rollingRupeesPerDay: {
      total: Math.round((total * lossRate) / days),
      model: Math.round((model * lossRate) / days),
      oldestFirst: Math.round((oldest * lossRate) / days),
    },
  };
}
