# Technical Design Document: Kisht Collections

**GitHub:** _TODO: repository URL_
**Live app:** _TODO: deployment URL_
**Demo logins:** see `deployment.md`

> Brief 4: an MSME lender's field collections app with AI prioritisation.
> Every assumption is labelled **A#** ([ASSUMPTIONS.md](ASSUMPTIONS.md)) and every decision **D#** ([DECISIONS.md](DECISIONS.md)).

## 1. Problem and success measures

_TODO: the client, today's WhatsApp/Excel process, the ₹1.63 crore a year problem, and the success targets: roll rate from 22% to 16%, 95% of visits logged the same day, weekly Excel stopped._

## 2. Scope

### 2.1 Core build (end to end)

_TODO: overdue CSV import and assignment, officer priority list, outcome logging, promise tracker, manager roll-rate view._
### 2.2 Optional depth we added

_TODO_
### 2.3 What we cut, and why

_TODO_

## 3. Architecture

_TODO: diagram; D1–D5 and why; request path through the /api rewrite (D3)._

## 4. Data model

_TODO: ER diagram and the key tables (LoanSnapshot, Assignment, ContactAttempt, Outcome, PromiseToPay, PriorityScore); append-only field events._

## 5. Main flows

### 5.1 Daily import and auto-assignment

### 5.2 Officer day: priority list → contact → outcome

### 5.3 Promise lifecycle and reminders

### 5.4 Manager: reorder, reassign, roll rates

## 6. The AI part: priority score with reasons

_TODO: features, training on synthetic history (A9), expected-loss ranking (A10), reasons as feature contributions (D8), behaviour on limited history, metrics, weekly back-test, manager overrides. What happens when it is wrong._

## 7. Hard parts

### 7.1 Offline logging and sync

_TODO: outbox, idempotency keys, sync triggers, clock-skew correction (D7, D9)._
### 7.2 The 8 am–7 pm contact block

_TODO: client and server enforcement, late syncs, blocked attempts recorded, daily attempt cap (A4, A5)._

## 8. Security and compliance

_TODO: role scoping (D6), input validation, no secrets in the repository, DPDP masking and audit log, RBI contact rules._

## 9. UI and design decisions

_TODO: key screens with screenshots, and the reason behind each layout; Hindi typography; three-tap logging; loading, empty and error states._

## 10. Testing

_TODO: what is tested and why: pure domain logic, API access control, sync idempotency, the Playwright offline flow._

## 11. Limits and what we'd do next

_TODO_
