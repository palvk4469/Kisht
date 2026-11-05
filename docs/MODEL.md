# Model card: priority score v1

**What it does.** For each overdue loan, it estimates the chance the loan is 31+ days past due thirty days from now, and turns that into rupees at stake. It orders the officer's list and gives up to three reasons. It is advisory: it never blocks anything, and managers can reorder any list.

**What it is.** A logistic regression (`packages/domain/src/scoring`), stored as versioned coefficients in `model-v1.json` and run in TypeScript. Deterministic and auditable, with no LLM involved (D8). Retrain with `pnpm --filter @kisht/db model:train`.

## Inputs

All point-in-time: nothing after the scored day can influence the score, and tests enforce it.

| Input                    | Meaning                                               |
| ------------------------ | ----------------------------------------------------- |
| Days overdue             | Separate slopes up to 30 days and beyond              |
| Outstanding              | Log scale                                             |
| Days since last payment  | Unknown counts as average                             |
| Earlier lateness         | Days overdue in the last 90, before the current spell |
| Broken and kept promises | Last 90 days                                          |
| Open promise             | A promise not yet settled                             |
| Days since last contact  | Capped at 30                                          |
| Times not reachable      | Last 30 days                                          |

## Ranking (A18)

| Loan              | Rupees at stake                     |
| ----------------- | ----------------------------------- |
| 1–30 days overdue | P(roll) × outstanding × 0.20 × 0.35 |
| 31+ days overdue  | P(cure) × outstanding × 0.20 × 0.35 |

0.20 and 0.35 are the client's own NPA and loss rates (A10). Loans that can still be stopped from rolling come first, then the most rupees at stake.

## Reasons

Each reason is a real term of the model's sum, measured against a clean loan (just overdue, average size, nothing else against it). No reason is shown for a fact that isn't there. A loan with little history says so instead of pretending.

Facts the officer needs regardless, such as a promise broken this week, appear as a badge from the record, not as a model reason. Forcing them into the reasons would misstate what drove the score.

## Results

Trained on 13,149 rows from three simulated worlds; tested on 13,461 rows from a fourth (the demo world), with borrowers it never saw.

Share of the rupees that rolled inside each officer's first loans of the day:

| First…   | Model     | Oldest first, 1–30 only | Oldest first (today's practice) |
| -------- | --------- | ----------------------- | ------------------------------- |
| 5 loans  | **68.3%** | 59.2%                   | 0%                              |
| 10 loans | **91.8%** | 88.5%                   | 16.7%                           |

| Measure                | Value                             |
| ---------------------- | --------------------------------- |
| AUC, all overdue loans | 0.793                             |
| AUC within 1–30 days   | 0.727 (days overdue alone: 0.671) |

Calibration on the test world, predicted vs actual by decile: 10/7, 13/10, 16/21, 23/35, 37/47, 50/55, 61/62, 72/68, 77/77, 83/80 (%). It is reasonable at the extremes and **under-predicts by about 10 points in the 20–40% range**.

### The weekly back-test

The dashboard runs the same comparison every week on the scores actually given, against what those loans did thirty days later, and keeps each finished week. Expect it to differ from the table above, which is one fixed run. On the demo world, for the first 5 loans per officer:

| Period                    | Model | Oldest first, 1–30 only |
| ------------------------- | ----- | ----------------------- |
| First 4 weeks of history  | 52%   | 52%                     |
| Last 8 weeks with results | 82%   | 67%                     |

Single weeks range from 73% to 86%, and in one of those eight weeks the simple rule narrowly won (84% vs 83%). The model does worst early on, when loans have little history behind them. **The conservative figure is 68%, and expect week-to-week movement.**

## Limits

- **What "rolled" means.** 31+ days overdue on day D+30, which is the brief's 31–60: days overdue rise at most one a day, so a loan at 30 or under on day D can't pass 60 by then. The demo history confirms it: all 2,869 rolled loans are in 31–60.
- **The data is synthetic (A9).** These numbers show the method works on a simulation built to match the brief (roll rate about 22%). They are not a forecast for this lender. It must be retrained on real repayment history before go-live.
- **Targeting, not causation.** The back-test shows the model puts rolling loans first. It does not prove a call would have saved them. Only live results can show that, which is why roll rate stays on the manager's dashboard.
- **Most of the gain is the stage rule.** The first version mixed 31+ loans into the ranking and lost to a one-line rule (oldest first, 1–30 only): 59% vs 88%. Putting 1–30 loans first fixed that. The model's own lead over that rule is real but modest.
- **Fairness.** Inputs are repayment behaviour and amount only, with no personal attributes. Pincode decides assignment, never the score.
