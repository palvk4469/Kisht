import { describe, expect, it } from "vitest";
import {
  auc,
  type BacktestRow,
  backtest,
  CURRENT_MODEL,
  compareByPriority,
  FEATURES,
  factsAt,
  hasLimitedHistory,
  isWaitingOnPromise,
  type LoanEvents,
  type LoanFacts,
  type ModelParams,
  predict,
  scoreLoan,
  toVector,
  train,
} from "./index.ts";
import metrics from "./model-v1.metrics.json" with { type: "json" };

const DAY = "2026-11-02";

const events = (over: Partial<LoanEvents> = {}): LoanEvents => ({
  snapshots: [{ asOfDate: DAY, dpd: 12, outstanding: 640000, lastPaymentDate: "2026-10-21" }],
  promises: [],
  outcomes: [],
  ...over,
});

const facts = (over: Partial<LoanFacts> = {}): LoanFacts => ({
  dpd: 12,
  outstanding: 350000,
  daysSincePayment: 40,
  overdueDays90: 12,
  brokenPromises90: 0,
  keptPromises90: 0,
  promiseDueInDays: null,
  daysSinceContact: 5,
  notReachable30: 0,
  historyDays: 100,
  ...over,
});

describe("factsAt: nothing after the scored day may leak in", () => {
  it("returns null when the loan is not on that day's list", () => {
    expect(factsAt(events(), "2026-11-03")).toBeNull();
  });

  it("ignores future snapshots, outcomes and promises", () => {
    const f = factsAt(
      events({
        snapshots: [
          { asOfDate: DAY, dpd: 12, outstanding: 1000, lastPaymentDate: null },
          { asOfDate: "2026-11-03", dpd: 13, outstanding: 1000, lastPaymentDate: null },
        ],
        outcomes: [{ day: "2026-11-03", type: "NOT_REACHABLE" }],
        promises: [
          {
            madeOn: "2026-11-03",
            dueDate: "2026-11-05",
            status: "BROKEN",
            resolvedOn: "2026-11-07",
          },
        ],
      }),
      DAY,
    );
    expect(f).toMatchObject({ overdueDays90: 1, notReachable30: 0, daysSinceContact: null });
    expect(f?.brokenPromises90).toBe(0);
    expect(f?.promiseDueInDays).toBeNull();
  });

  it("treats a promise as open until its result was known, even if it later broke", () => {
    const p = {
      madeOn: "2026-10-30",
      dueDate: "2026-11-04",
      status: "BROKEN",
      resolvedOn: "2026-11-06",
    };
    const f = factsAt(events({ promises: [p] }), DAY);
    expect(f?.brokenPromises90).toBe(0);
    expect(f?.promiseDueInDays).toBe(2);
    expect(isWaitingOnPromise(f as LoanFacts)).toBe(true);
  });

  it("counts resolved promises and contacts inside their windows only", () => {
    const f = factsAt(
      events({
        promises: [
          {
            madeOn: "2026-10-01",
            dueDate: "2026-10-05",
            status: "BROKEN",
            resolvedOn: "2026-10-07",
          },
          { madeOn: "2026-09-01", dueDate: "2026-09-03", status: "KEPT", resolvedOn: "2026-09-03" },
          {
            madeOn: "2026-05-01",
            dueDate: "2026-05-03",
            status: "BROKEN",
            resolvedOn: "2026-05-05",
          },
        ],
        outcomes: [
          { day: "2026-10-30", type: "NOT_REACHABLE" },
          { day: "2026-09-01", type: "NOT_REACHABLE" },
        ],
      }),
      DAY,
    );
    expect(f).toMatchObject({
      brokenPromises90: 1,
      keptPromises90: 1,
      daysSinceContact: 3,
      notReachable30: 1,
      daysSincePayment: 12,
    });
  });
});

describe("limited history", () => {
  it("is flagged for a loan we know almost nothing about", () => {
    expect(
      hasLimitedHistory(facts({ historyDays: 3, daysSincePayment: null, daysSinceContact: null })),
    ).toBe(true);
    expect(hasLimitedHistory(facts())).toBe(false);
  });

  it("treats unknown inputs as average: they neither help nor hurt", () => {
    const m: ModelParams = { version: "t", intercept: 0, weights: [1], means: [0.5], stds: [1] };
    expect(predict(m, [null])).toBe(0.5);
    expect(toVector(facts({ daysSincePayment: null }))).toHaveLength(FEATURES.length);
  });
});

describe("scoreLoan", () => {
  it("values a 1–30 loan by its chance of rolling, in the client's rupees", () => {
    const s = scoreLoan(CURRENT_MODEL, facts());
    expect(s.actionableChance).toBeCloseTo(s.probability);
    expect(s.expectedLoss).toBe(Math.round(s.probability * 350000 * 0.07));
  });

  it("values a loan past 30 DPD by its chance of curing", () => {
    const s = scoreLoan(CURRENT_MODEL, facts({ dpd: 45 }));
    expect(s.actionableChance).toBeCloseTo(1 - s.probability);
  });

  it("is deterministic", () => {
    expect(scoreLoan(CURRENT_MODEL, facts())).toEqual(scoreLoan(CURRENT_MODEL, facts()));
  });

  it("ranks a bigger loan above an identical smaller one", () => {
    const small = scoreLoan(CURRENT_MODEL, facts({ outstanding: 100000 }));
    const big = scoreLoan(CURRENT_MODEL, facts({ outstanding: 1000000 }));
    expect(big.expectedLoss).toBeGreaterThan(small.expectedLoss);
  });

  it("gives at most three reasons, largest first, each with the fact behind it", () => {
    const s = scoreLoan(
      CURRENT_MODEL,
      facts({
        dpd: 27,
        outstanding: 2000000,
        brokenPromises90: 3,
        daysSincePayment: 150,
        overdueDays90: 70,
      }),
    );
    expect(s.reasons.length).toBeLessThanOrEqual(3);
    expect(s.reasons.length).toBeGreaterThan(0);
    const weights = s.reasons.map((r) => r.weight);
    expect(weights).toEqual([...weights].sort((a, b) => b - a));
    expect(s.reasons.find((r) => r.code === "LARGE_OUTSTANDING")?.value).toBe(2000000);
  });

  it("says how many days are left before the roll", () => {
    const s = scoreLoan(CURRENT_MODEL, facts({ dpd: 27 }));
    expect(s.reasons.find((r) => r.code === "NEAR_ROLL")?.value).toBe(4);
  });

  it("surfaces a broken promise, even one that isn't unusual in the book", () => {
    const s = scoreLoan(
      CURRENT_MODEL,
      facts({ dpd: 19, outstanding: 220000, brokenPromises90: 1 }),
    );
    expect(s.reasons.map((r) => r.code)).toContain("BROKEN_PROMISES");
  });

  it("leads with the stage for a loan already past 30 days", () => {
    const s = scoreLoan(CURRENT_MODEL, facts({ dpd: 95 }));
    expect(s.reasons[0]).toMatchObject({ code: "PAST_ROLL", value: 95 });
  });

  it("never gives a reason for a fact that isn't there", () => {
    const s = scoreLoan(CURRENT_MODEL, facts({ brokenPromises90: 0, notReachable30: 0 }));
    expect(s.reasons.some((r) => r.code === "BROKEN_PROMISES" || r.code === "HARD_TO_REACH")).toBe(
      false,
    );
  });
});

describe("compareByPriority", () => {
  it("puts loans that can still be stopped from rolling first, then most rupees", () => {
    const list = [
      { id: "past-big", dpd: 60, expectedLoss: 99999 },
      { id: "small", dpd: 10, expectedLoss: 100 },
      { id: "big", dpd: 5, expectedLoss: 5000 },
    ];
    expect([...list].sort(compareByPriority).map((l) => l.id)).toEqual([
      "big",
      "small",
      "past-big",
    ]);
  });
});

describe("train", () => {
  it("learns a simple separable rule", () => {
    const rows = Array.from({ length: 200 }, (_, i) => ({
      x: [i < 100 ? 0 : 1, i % 2],
      y: (i < 100 ? 0 : 1) as 0 | 1,
    }));
    const m = train(rows, { version: "t", iterations: 500 });
    expect(predict(m, [1, 0])).toBeGreaterThan(0.9);
    expect(predict(m, [0, 0])).toBeLessThan(0.1);
    expect(Math.abs(m.weights[0] ?? 0)).toBeGreaterThan(Math.abs(m.weights[1] ?? 0));
  });

  it("tolerates unknown values and constant columns", () => {
    const m = train(
      [
        { x: [null, 1], y: 0 },
        { x: [1, 1], y: 1 },
      ],
      { version: "t", iterations: 10 },
    );
    expect(m.stds[1]).toBe(1);
    expect(m.weights.every(Number.isFinite)).toBe(true);
  });
});

describe("auc", () => {
  it("is 1 for a perfect ranking, 0 for a reversed one, 0.5 for ties", () => {
    const pos = { score: 2, label: true };
    const neg = { score: 1, label: false };
    expect(auc([pos, neg])).toBe(1);
    expect(auc([{ ...pos, score: 0 }, neg])).toBe(0);
    expect(auc([{ ...pos, score: 1 }, neg])).toBe(0.5);
    expect(auc([neg])).toBe(0.5);
  });
});

describe("backtest", () => {
  const row = (over: Partial<BacktestRow>): BacktestRow => ({
    day: DAY,
    officer: "a",
    dpd: 10,
    outstanding: 1000,
    probability: 0.5,
    expectedLoss: 100,
    late: false,
    ...over,
  });

  it("credits a ranking only for rupees that rolled within its first k", () => {
    const m = backtest(
      [
        row({ dpd: 95, late: true, expectedLoss: 1 }), // already past 30: can't roll
        row({ dpd: 25, late: false, expectedLoss: 500 }),
        row({ dpd: 5, late: true, outstanding: 3000, expectedLoss: 900 }),
      ],
      1,
    );
    expect(m.coverage.model).toBe(1);
    expect(m.coverage.oldestFirst).toBe(0);
    expect(m.coverage.oldestWithin30).toBe(0);
  });

  it("works per officer per day", () => {
    const m = backtest([row({ officer: "a", late: true }), row({ officer: "b", late: true })], 1);
    expect(m.coverage.model).toBe(1);
  });
});

describe("the trained model, on a world it never saw", () => {
  it("beats today's oldest-first practice and the best simple rule", () => {
    for (const { coverage } of [metrics.top5, metrics.top10]) {
      expect(coverage.model).toBeGreaterThan(coverage.oldestWithin30);
      expect(coverage.model).toBeGreaterThan(coverage.oldestFirst);
    }
  });

  it("separates 1–30 loans better than DPD alone", () => {
    expect(metrics.top10.aucWithin30).toBeGreaterThan(metrics.top10.aucWithin30DpdOnly);
  });

  it("was fitted with the current feature list", () => {
    expect(CURRENT_MODEL.weights).toHaveLength(FEATURES.length);
  });
});
