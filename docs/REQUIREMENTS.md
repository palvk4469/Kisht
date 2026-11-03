# Requirements checklist

Every requirement from brief 4 and the submission rules, with its status. Nothing is dropped silently: anything not built is listed under **Cut** with a reason, and appears in the TDD.

Status: **Done** · **Partial** (what is missing is stated) · **Day N** (planned) · **Cut**.

## Core build (must work end to end)

| Requirement                                                      | Status  | Where / note                                                                          |
| ---------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------- |
| Overdue CSV import                                               | Done    | Screen 5, `modules/imports`; preview → commit, row-level errors                       |
| Auto-assignment by pincode and workload                          | Done    | `domain/assignment.ts`; continuity first, then least-loaded (A3)                      |
| Officer priority list                                            | Day 3   | Screen 2                                                                              |
| Outcome logging: paid, promise, not reachable, dispute, with GPS | Day 3–4 | Screen 3; three taps                                                                  |
| Promise tracker                                                  | Day 5   | Screens 4 (officer) and 7 (manager); resolution rule done (`domain/promises.ts`)      |
| Manager roll-rate view                                           | Day 6   | Screen 8; metric done (`domain/rollRate.ts`)                                          |
| Roles: field officer and branch manager (+ head)                 | Done    | `modules/auth/scope.ts`, tested per role                                              |
| AI: priority score with top three reasons                        | Day 3   | `domain/scoring`, trained on the seeded history                                       |
| Hard part: offline logging with sync                             | Day 4   | Outbox (Dexie) + idempotent `/api/sync`                                               |
| Hard part: 8 am–7 pm contact block                               | Partial | Rule done and tested (`domain/contactWindow.ts`); enforcement in UI and sync on day 4 |
| Mocked payments, messages and outside systems                    | Partial | `MessageLog` table in place; reminders day 5                                          |
| Seeded from the sample data                                      | Done    | The three sample rows exactly, plus 6 months of history                               |

## Must have (beyond the core)

| Requirement                                                | Status | Where / note                                                |
| ---------------------------------------------------------- | ------ | ----------------------------------------------------------- |
| Call and map buttons                                       | Day 3  | `tel:` and Maps link (D11)                                  |
| Promise-to-pay reminders to borrower and officer           | Day 5  | Mocked; deferred outside 8 am–7 pm                          |
| AI-drafted Hindi/English reminders from approved templates | Day 7  | Template-first; word filter; sent only on the officer's tap |
| Manager dashboard: roll rates and broken promises          | Day 6  | Screen 8                                                    |
| Officer activity log with visit locations                  | Day 6  | Screen 8; GPS stored on every attempt and outcome           |

## When the AI is wrong

| Requirement                                 | Status    | Where / note                                 |
| ------------------------------------------- | --------- | -------------------------------------------- |
| Score is advisory                           | Day 3     | Reasons always shown; "why this rank"        |
| Managers can reorder lists                  | Day 5     | Screen 6; reason required and audited        |
| Weekly back-test: scores vs actual payments | Day 3 / 6 | Training script reports it; card on screen 8 |
| Drafts only from approved templates         | Day 7     |                                              |
| Word filter blocks threatening language     | Day 7     |                                              |
| Nothing sends without the officer's tap     | Day 7     |                                              |

## Constraints

| Requirement                                          | Status  | Where / note                                                                              |
| ---------------------------------------------------- | ------- | ----------------------------------------------------------------------------------------- |
| Block contact outside 8 am–7 pm                      | Day 4   | Button disabled with "next allowed at"; server re-checks                                  |
| Record every contact attempt, including blocked ones | Partial | `ContactAttempt` table with `allowed` and `blockReason`; seed has examples; capture day 4 |
| DPDP: borrower data as personal data                 | Partial | Phones masked, every reveal audited; list views follow the same rule                      |
| Offline on low-end phones, weak signal               | Day 4   | PWA + outbox; JS budget on officer routes                                                 |
| Hindi interface                                      | Partial | Hindi default, toggle everywhere; officer screens arrive in Hindi                         |

## Design

| Requirement                                                  | Status  | Where / note                                                |
| ------------------------------------------------------------ | ------- | ----------------------------------------------------------- |
| Minimal: white space, restrained palette, clear type         | Partial | Tokens, Noto Sans + Devanagari; applies to every new screen |
| One hand: big tap targets, short list, outcome in three taps | Day 3   | Screens 2–3                                                 |
| Loading, empty and error states                              | Partial | Shared components; on every screen built so far             |
| Layout that works on a phone                                 | Partial | Screens built so far are tested at 390 px                   |
| Light and dark themes                                        | Done    | Follows the device, or a remembered choice; no flash        |

## Submission rules

| Requirement                                                                                                | Status         | Where / note                                                         |
| ---------------------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------- |
| Frontend, backend, database, sign-in                                                                       | Done           |                                                                      |
| Tests for the most important logic                                                                         | Done (ongoing) | 101 unit/API + browser tests; domain coverage ≥ 90% enforced         |
| No secrets in the repo, validated inputs, access control                                                   | Done           | Contracts validate every input; `scope.ts`; CI-only throwaway values |
| No dead buttons                                                                                            | Ongoing        | Only built screens are linked                                        |
| Every assumption labelled                                                                                  | Ongoing        | `docs/ASSUMPTIONS.md` (A1–A17)                                       |
| Keep the commit history                                                                                    | Ongoing        | Small conventional commits                                           |
| TDD: GitHub URL and live link at the top; architecture; data model; flows; AI; UI decisions; cuts and next | Day 7          | Skeleton in `docs/TDD.md`; architecture written                      |
| deployment.md: local run, deployment, env var names, demo logins                                           | Day 7          |                                                                      |
| Live deployment                                                                                            | Day 7          | Vercel + Render + Neon                                               |

## Cut

Nothing yet. Anything cut later is listed here with the reason.
