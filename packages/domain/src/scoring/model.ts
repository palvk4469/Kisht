import {
  FEATURES,
  type FeatureName,
  hasLimitedHistory,
  type LoanFacts,
  priorOverdueDays,
  toVector,
} from "./features.ts";

// A logistic regression predicting: will this loan be 31+ DPD thirty days from
// now? Deterministic and auditable (D8): the same facts always give the same
// score, and every reason is a real term of the sum that produced it.

export type ModelParams = {
  version: string;
  intercept: number;
  /** Per feature, in FEATURES order. Weights apply to standardised inputs. */
  weights: number[];
  means: number[];
  stds: number[];
};

// The client's own numbers (A10): 20% of rolled loans turn NPA, 35% loss.
export const NPA_RATE = 0.2;
export const LOSS_GIVEN_DEFAULT = 0.35;
const LOSS_RATE = NPA_RATE * LOSS_GIVEN_DEFAULT;

export const ROLL_DPD = 30;

export type ReasonCode =
  | "NEAR_ROLL"
  | "PAST_ROLL"
  | "LARGE_OUTSTANDING"
  | "NO_RECENT_PAYMENT"
  | "OFTEN_OVERDUE"
  | "BROKEN_PROMISES"
  | "KEEPS_PROMISES"
  | "PROMISE_OPEN"
  | "NOT_CONTACTED"
  | "HARD_TO_REACH";

export type Reason = {
  code: ReasonCode;
  /** The fact behind the reason, for the UI's sentence. */
  value: number;
  /** How much this pushed the ranking up (log scale); stored for audit. */
  weight: number;
};

export type Score = {
  modelVersion: string;
  /** P(31+ DPD in 30 days). */
  probability: number;
  /** Chance a contact can still change: P(roll) up to 30 DPD, P(cure) after. */
  actionableChance: number;
  /** Rupees at stake: actionableChance × outstanding × NPA × LGD. */
  expectedLoss: number;
  reasons: Reason[];
  limitedHistory: boolean;
};

const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

/** Log-odds terms of the sum, one per feature. Unknown inputs contribute nothing. */
function contributions(model: ModelParams, vector: (number | null)[]): number[] {
  return vector.map((x, i) => {
    if (x === null) return 0;
    const std = model.stds[i] || 1;
    return (model.weights[i] ?? 0) * ((x - (model.means[i] ?? 0)) / std);
  });
}

export function predict(model: ModelParams, vector: (number | null)[]): number {
  return sigmoid(contributions(model, vector).reduce((a, b) => a + b, model.intercept));
}

function reasonFor(feature: FeatureName, f: LoanFacts): Omit<Reason, "weight"> | null {
  switch (feature) {
    case "dpdWithin30":
      return f.dpd <= ROLL_DPD ? { code: "NEAR_ROLL", value: ROLL_DPD + 1 - f.dpd } : null;
    case "dpdBeyond30":
      return f.dpd > ROLL_DPD ? { code: "PAST_ROLL", value: f.dpd } : null;
    case "pastRoll":
      return null; // A stage constant, not something to tell the officer.
    case "logOutstanding":
      return { code: "LARGE_OUTSTANDING", value: f.outstanding };
    case "monthsSincePayment":
      return f.daysSincePayment === null
        ? null
        : { code: "NO_RECENT_PAYMENT", value: f.daysSincePayment };
    case "priorOverdueShare90": {
      const days = priorOverdueDays(f);
      return days > 0 ? { code: "OFTEN_OVERDUE", value: days } : null;
    }
    case "brokenPromises90":
      return f.brokenPromises90 > 0 ? { code: "BROKEN_PROMISES", value: f.brokenPromises90 } : null;
    case "keptPromises90":
      return f.keptPromises90 > 0 ? { code: "KEEPS_PROMISES", value: f.keptPromises90 } : null;
    case "openPromise":
      return f.promiseDueInDays === null
        ? null
        : { code: "PROMISE_OPEN", value: f.promiseDueInDays };
    case "monthsSinceContact":
      return f.daysSinceContact === null
        ? null
        : { code: "NOT_CONTACTED", value: f.daysSinceContact };
    case "notReachable30":
      return f.notReachable30 > 0 ? { code: "HARD_TO_REACH", value: f.notReachable30 } : null;
  }
}

const MAX_REASONS = 3;
const STAGE_REASON_WEIGHT = 100;

/** The reference for reasons: just overdue, average size, nothing else against it. */
const CLEAN_LOAN: LoanFacts = {
  dpd: 1,
  outstanding: 350_000,
  daysSincePayment: 30,
  overdueDays90: 1,
  brokenPromises90: 0,
  keptPromises90: 0,
  promiseDueInDays: null,
  daysSinceContact: 0,
  notReachable30: 0,
  historyDays: 90,
};

export function scoreLoan(model: ModelParams, f: LoanFacts): Score {
  const vector = toVector(f);
  const terms = contributions(model, vector);
  const probability = sigmoid(terms.reduce((a, b) => a + b, model.intercept));
  const pastRoll = f.dpd > ROLL_DPD;
  const actionableChance = pastRoll ? 1 - probability : probability;

  // Reasons answer "why is this loan ranked above a clean one?": each is the
  // model's own term, measured from CLEAN_LOAN. Past 30 days we rank by the
  // chance of cure, so a term that lowers P(31+) is what helps.
  const direction = pastRoll ? -1 : 1;
  const clean = toVector(CLEAN_LOAN);
  const candidates: Reason[] = [];
  FEATURES.forEach((feature, i) => {
    const x = vector[i] ?? null;
    if (x === null) return;
    const std = model.stds[i] || 1;
    let weight = (((model.weights[i] ?? 0) * (x - (clean[i] ?? 0))) / std) * direction;
    // Amount drives rupees at stake directly, on top of its effect on the odds.
    if (feature === "logOutstanding") weight += x;
    // The stage is why a past-roll loan sits where it does, whatever else is true.
    if (feature === "dpdBeyond30" && pastRoll) weight = STAGE_REASON_WEIGHT;
    const reason = reasonFor(feature, f);
    if (reason) candidates.push({ ...reason, weight });
  });

  return {
    modelVersion: model.version,
    probability,
    actionableChance,
    expectedLoss: Math.round(actionableChance * f.outstanding * LOSS_RATE),
    reasons: candidates
      .filter((r) => r.weight > 0)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, MAX_REASONS),
    limitedHistory: hasLimitedHistory(f),
  };
}

/**
 * List order (A18). A loan that can still be stopped from rolling comes before
 * one that already has, because the roll rate is what the client is buying;
 * within each group, the most rupees at stake first.
 */
export function compareByPriority(
  a: { dpd: number; expectedLoss: number },
  b: { dpd: number; expectedLoss: number },
): number {
  const stage = (l: { dpd: number }) => (l.dpd <= ROLL_DPD ? 0 : 1);
  return stage(a) - stage(b) || b.expectedLoss - a.expectedLoss;
}
