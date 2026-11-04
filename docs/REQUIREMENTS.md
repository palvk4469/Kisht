# Requirements checklist

Every requirement from brief 4 and the submission rules, with its status. Nothing is dropped silently: anything not built is listed under **Cut** with a reason, and appears in the TDD.

Status: **Done** · **Partial** (what is missing is stated) · **Day N** (planned) · **Cut**.

## Core build (must work end to end)

| Requirement                                                      | Status | Where / note                                                             |
| ---------------------------------------------------------------- | ------ | ------------------------------------------------------------------------ |
| Overdue CSV import                                               | Done   | Screen 5, `modules/imports`; preview → commit, row-level errors          |
| Auto-assignment by pincode and workload                          | Done   | `domain/assignment.ts`; continuity first, then least-loaded (A3)         |
| Officer priority list                                            | Done   | Screen 2; ordered by the model (A18), capped at 25                       |
| Outcome logging: paid, promise, not reachable, dispute, with GPS | Done   | Screen 3; three taps, GPS never blocks logging. Offline queue day 4      |
| Promise tracker                                                  | Done   | Screens 4 (officer, works offline) and 7 (manager, with filters)         |
| Manager roll-rate view                                           | Day 6  | Screen 8; metric done (`domain/rollRate.ts`)                             |
| Roles: field officer and branch manager (+ head)                 | Done   | `modules/auth/scope.ts`, tested per role                                 |
| AI: priority score with top three reasons                        | Done   | `domain/scoring`, [MODEL.md](MODEL.md); up to three, only true ones      |
| Hard part: offline logging with sync                             | Done   | Outbox on the phone + idempotent `/api/sync`; real offline browser tests |
| Hard part: 8 am–7 pm contact block                               | Done   | UI and server, by corrected time; blocked taps recorded                  |
| Mocked payments, messages and outside systems                    | Done   | Reminders go to `MessageLog` (D24); labelled as simulated on screen      |
| Seeded from the sample data                                      | Done   | The three sample rows exactly, plus 6 months of history                  |

## Must have (beyond the core)

| Requirement                                                | Status | Where / note                                                                   |
| ---------------------------------------------------------- | ------ | ------------------------------------------------------------------------------ |
| Call and map buttons                                       | Done   | `tel:` and Maps link (D11)                                                     |
| Promise-to-pay reminders to borrower and officer           | Done   | Approved templates only; held outside 8 am–7 pm; stop when settled or disputed |
| AI-drafted Hindi/English reminders from approved templates | Day 7  | Template-first; word filter; sent only on the officer's tap                    |
| Manager dashboard: roll rates and broken promises          | Day 6  | Screen 8                                                                       |
| Officer activity log with visit locations                  | Day 6  | Screen 8; GPS stored on every attempt and outcome                              |

## When the AI is wrong

| Requirement                                 | Status  | Where / note                                                                                      |
| ------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------- |
| Score is advisory                           | Done    | Reasons and maths shown; nothing is blocked by a score                                            |
| Managers can reorder lists                  | Done    | Screen 6; reason required, shown to the officer and audited                                       |
| Weekly back-test: scores vs actual payments | Partial | Back-test done against a world it never saw ([MODEL.md](MODEL.md)); weekly card on screen 8 day 6 |
| Drafts only from approved templates         | Partial | Reminders already use approved templates only; AI drafts day 7                                    |
| Word filter blocks threatening language     | Partial | Filter built and tested in `domain/wordFilter.ts`; applied to AI drafts on day 7                  |
| Nothing sends without the officer's tap     | Day 7   |                                                                                                   |

## Constraints

| Requirement                                          | Status  | Where / note                                                                                                                     |
| ---------------------------------------------------- | ------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Block contact outside 8 am–7 pm                      | Done    | Blocked and explained in the UI with the next time; server re-checks                                                             |
| Record every contact attempt, including blocked ones | Done    | `ContactAttempt` with `allowed` and `blockReason`; tested                                                                        |
| DPDP: borrower data as personal data                 | Partial | Phones masked, every reveal audited; list views follow the same rule                                                             |
| Offline on low-end phones, weak signal               | Done    | Service worker + IndexedDB; system fonts; first load 245 KB JS (over the 200 KB target, see the log), then served from the phone |
| Hindi interface                                      | Partial | Hindi default, toggle everywhere; officer screens arrive in Hindi                                                                |

## Design

| Requirement                                                  | Status  | Where / note                                                |
| ------------------------------------------------------------ | ------- | ----------------------------------------------------------- |
| Minimal: white space, restrained palette, clear type         | Partial | Tokens, Noto Sans + Devanagari; applies to every new screen |
| One hand: big tap targets, short list, outcome in three taps | Done    | 48 px targets; covered by a browser test                    |
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

| What                                                               | Why                                                                                                                                           |
| ------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Sending the outbox while the app is fully closed (Background Sync) | It would duplicate the send logic inside the service worker, and officers have the app open all day. Everything sends the next time it opens. |
