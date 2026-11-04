# Architecture

Kisht Collections is a modular monolith: one API, one web app, and three small packages with one job each. Every business rule exists exactly once, every API response has one schema that both sides use, and CI fails if the packages start depending on each other in the wrong direction.

## System context

```mermaid
flowchart LR
  officer["Field officer<br/>(Android phone, patchy network)"]
  manager["Branch manager / head<br/>(desktop or phone)"]
  lms["Loan management system<br/>(daily overdue CSV export)"]
  sms["SMS / WhatsApp gateway<br/>(mocked: MessageLog)"]

  subgraph kisht["Kisht Collections"]
    web["Web app<br/>Next.js PWA"]
    api["API<br/>Fastify"]
    db[("PostgreSQL")]
  end

  officer --> web
  manager --> web
  lms -. "CSV, uploaded by a manager" .-> web
  web -- "/api/* (same origin)" --> api
  api --> db
  api -. reminders .-> sms
```

## Packages and the dependency rule

```mermaid
flowchart TB
  web["apps/web<br/>screens, offline outbox"]
  api["apps/api<br/>HTTP, access scope, transactions"]
  contracts["packages/contracts<br/>zod schemas of every request and response"]
  domain["packages/domain<br/>pure business rules"]
  db["packages/db<br/>Prisma schema, client, seed"]

  web --> contracts
  web --> domain
  api --> contracts
  api --> domain
  api --> db
  contracts --> domain
  db --> domain
```

| Package     | Owns                                                                                                                                                                 | May not import                        |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `domain`    | Dates in IST, contact window (RBI 8 am–7 pm), promise resolution, assignment, CSV parsing, import planning, roll rate, phone masking, and (day 3) the priority model | db, contracts, any framework, any I/O |
| `contracts` | The wire format: request and response schemas, plus enums                                                                                                            | db, servers, UI frameworks            |
| `db`        | Schema and migrations, the client, user provisioning, the deterministic seed                                                                                         | apps                                  |
| `api`       | Auth, access scope, HTTP, transactions                                                                                                                               | the web app                           |
| `web`       | Screens, i18n, and (day 4) the offline outbox                                                                                                                        | **the database**                      |

These rules are enforced by Biome's `noRestrictedImports` (see `biome.json`), so a violation fails `pnpm lint` and CI. Because `domain` is pure, the phone and the server run the _same_ contact-window and promise code: the button an officer sees disabled is exactly what the server would reject.

## Inside the API

```
apps/api/src
  app.ts            composition root: builds the AppContext, registers every module
  context.ts        AppContext { prisma, auth, clock, config, authenticate }
  http/             errors (HttpError, error handler), guards (session, role), origin check
  modules/
    auth/           Better Auth bridge, scope.ts (the one access-control module)
    audit/          append-only audit log
    scoring/        scores a day's loans on import
    field/          today's list, sync (contact window, attempts, outcomes)
    demo/           demo clock; only registered in demo mode
    health/ me/ loans/ imports/
      routes.ts     HTTP only: guards + contract schemas, then calls the service
      service.ts    logic and Prisma, returns contract types
```

- **One access-control module.** `modules/auth/scope.ts` turns a user into a `Scope` (an officer's current assignments, some branches, or all), and every loan, officer and import-batch query takes its `where` from there. Out of scope looks exactly like not found (404), so ids can't be probed.
- **Contracts at the edge.** Routes declare `schema: { params, body, response }` from `@kisht/contracts` through `fastify-type-provider-zod`. Inputs are validated before the handler runs; responses are serialised _through_ their schema, so a field that isn't in the contract (a borrower's phone, say) can't leak. A response that breaks its contract becomes a logged 500, never a malformed reply. The web parses responses with the same schemas. OpenAPI docs are generated from them at `/api/docs`.
- **Explicit dependencies.** Modules get everything through `AppContext`; nothing reaches for a global. Tests build the whole app with a pinned clock and call it with `app.inject()`.

## Request path

```mermaid
sequenceDiagram
  participant B as Browser
  participant N as Next.js (same origin)
  participant F as Fastify
  participant S as Service
  participant P as Postgres

  B->>N: POST /api/imports (cookie, Origin)
  N->>F: rewrite /api/* (D3)
  F->>F: origin guard (CSRF), body validated by contract
  F->>F: authenticate → request.user, requireRole
  F->>S: previewImport(ctx, user, body)
  S->>P: queries filtered by scope.ts
  S-->>F: ImportPreview
  F-->>B: 201, serialised through the ImportPreview schema
```

## Daily import: preview, then commit

```mermaid
sequenceDiagram
  participant M as Manager
  participant A as API
  participant D as domain
  participant P as Postgres

  M->>A: preview (CSV text, as-of day)
  A->>D: parseOverdueCsv (row-level errors with Excel row numbers)
  A->>P: previous day's list, snapshots, assignments, officers
  A->>D: planImport (payments, cures, new loans) + assignLoans
  A->>P: save batch as PREVIEW (rows held, no loan data written)
  A-->>M: what this file will change
  M->>A: commit
  A->>P: BEGIN, claim batch PREVIEW→COMMITTED (a double submit claims nothing)
  A->>D: plan again from the current database
  A->>P: loans, snapshots, payments, assignments, promises (resolvePromise), audit
  A->>P: COMMIT
  A-->>M: summary, including promises kept, partial or broken
```

## The priority model

`domain/scoring` holds the features, the model, the reasons and the back-test as pure code. `packages/db/scripts/trainModel.ts` trains on simulated worlds and tests on one it never saw, writing `model-v1.json` and its metrics. Scores are written on seed and on every import commit, then read by the list. Details and honest limits: [MODEL.md](MODEL.md).

## Offline logging

```mermaid
sequenceDiagram
  participant O as Officer
  participant P as Phone (IndexedDB)
  participant A as API
  participant D as Postgres

  O->>P: Tap: attempt + outcome, stamped now, with a client UUID
  P-->>O: On screen at once (list = last server copy + unsent events)
  Note over P: No signal: nothing changes. Reloads are safe, it's on disk.
  P->>A: Signal returns: batch + what the phone's clock reads now
  A->>A: Correct each event's time by the gap to the server's clock
  A->>D: Attempt: stored, allowed or blocked. Outcome: only on an allowed attempt
  A-->>P: Per-item result: recorded, blocked, duplicate or rejected
  P->>P: Clear what landed. Refused items stay on screen with the reason
```

- **Append-only events with client UUIDs (D7).** Nothing is edited, so nothing needs merging, and a retry after a lost response stores nothing twice.
- **The app itself is cached** by a service worker (`public/sw.js`): pages network-first with a 3-second timeout, because weak signal hangs rather than fails; hashed files cache-first. The build id names the cache, so each deploy replaces the old one. API responses are never cached there.
- **Borrower data on the phone** lives only in IndexedDB, scoped to the user, cleared on sign-out and expired after 7 days. Unsent work survives sign-out, because it's the only copy.
- **The contact window** follows the server's clock using the offset measured when the list last arrived, so it works offline and the screen changes at 7 pm by itself. The server still has the final say (D9).

## Testing

| Layer                                       | What it proves                                                                                                 | Where                               |
| ------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| Domain unit tests (≥ 90% coverage enforced) | Every business rule, with boundary cases such as 18:59:59 vs 19:00:00 and the 90% promise line                 | `packages/domain/src/*.test.ts`     |
| Database tests                              | Partial unique indexes (one current officer and one pending promise per loan), date round-trips                | `packages/db/test`                  |
| Seed tests                                  | Determinism, the brief's sample rows reproduced exactly, roll rate ≈ 22%                                       | `packages/db/test/simulate.test.ts` |
| API integration tests                       | Access scope per role, CSRF, sign-up closed, contract guarantees, import preview/commit/re-upload/out-of-order | `apps/api/test`                     |
| Browser tests (phone + desktop)             | Sign-in routing and the full import flow on the demo data                                                      | `e2e/`                              |
