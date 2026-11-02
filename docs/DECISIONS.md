# Decisions

Short records of architectural choices: what we chose and why.

| # | Decision | Why |
|---|---|---|
| D1 | A pnpm monorepo with `apps/web`, `apps/api`, `packages/db` and `packages/shared`. | The contact window, scoring and validation rules have to be identical on the phone and on the server. A shared package keeps one copy. |
| D2 | One Next.js App Router PWA serves both the officer UI (phone) and the manager UI (desktop). | There's one codebase and one deployment. A PWA installs from a link, with no app-store step. |
| D3 | Next.js rewrites `/api/*` to the Fastify API, so the browser only ever talks to the web origin. | Auth cookies stay first-party, the API needs no CORS, and in production the API URL is an environment variable. |
| D4 | The API is a separate Fastify app with a `buildApp()` factory. | It keeps a clean boundary for sync and import endpoints. Tests call `app.inject()` without opening a port, and the API can scale or move without touching the web app. |
| D5 | PostgreSQL 16 with Prisma 7: `prisma.config.ts`, the `prisma-client` generator and `@prisma/adapter-pg`. | The data is relational (loans, snapshots, assignments) and the schema is typed. Prisma 7 is the current stable major. |
| D6 | Better Auth with email and password. `User` has `role` (OFFICER, BRANCH_MANAGER or HEAD) and `branchId`. Every data query goes through one scope helper. | Access control sits in one place that can be tested: officers see only their assigned loans, and managers see only their own branch. Anything outside that scope returns 404, not 403. |
| D7 | The offline outbox (Dexie) holds append-only events: contact attempts and outcomes. Each event carries a client-generated UUID, which the server upserts on. | Retries are safe, and events never need merging because nothing is edited in place. Derived state, such as the latest promise, is computed on the server. |
| D8 | The priority score comes from a logistic regression, trained offline, stored as versioned JSON coefficients and evaluated in TypeScript. Its reasons are the three largest feature contributions. No LLM is used in scoring. | It is deterministic and auditable, and the reasons are true by construction. A lender has to be able to explain why one borrower was chased before another. |
| D9 | The contact window `[08:00, 19:00)` IST is a pure function in `@kisht/shared`. The client uses it to grey out buttons, and the server has the final say. Events are judged by when they happened (device time corrected for clock skew), not by when they synced. | An outcome logged offline at 18:50 and synced at 21:00 is legitimate. A tampered device clock is not. |
| D10 | Roll rates are computed from a daily `LoanSnapshot` row per loan, written by each import. | Cohort roll rates need daily DPD history. The import is the source of truth. |
| D11 | SMS and WhatsApp are mocked: "sent" messages are written to a `MessageLog` table. Call buttons open `tel:` links, and map buttons open a Google Maps URL. | Outside systems are out of scope. A map SDK would be too heavy for 2–3 GB phones. |
| D12 | Pinned versions: Prisma 7.10.1 (npm `latest` is an 8.0 release candidate), Better Auth 1.7.15 with its `auth` CLI (`@better-auth/cli` is stale), and TypeScript 6.0.3 (TS 7's native compiler isn't yet supported by all of our tooling). | We need stable, supported versions for a one-week build. |
| D13 | Demo clock: when `DEMO_MODE=true`, a manager can set a "simulated now" that both client and server respect. It shows a visible banner and is off by default. | Without it, a reviewer opening the app at night (IST) would find every contact blocked, as the rules require. |
