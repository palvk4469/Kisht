# Engineering log

A dated record of decisions, trade-offs and problems found along the way. Formal decisions are in [DECISIONS.md](DECISIONS.md) and assumptions in [ASSUMPTIONS.md](ASSUMPTIONS.md).

## Phase 0: foundations (2026-11-02)

- **Why brief 4.** Its hard parts are about correctness under real constraints: offline sync, and RBI's 8 am–7 pm contact rule enforced even when the phone is offline or its clock is wrong. The "AI" can be a real, explainable model rather than a wrapper. And the value ties to the client's own numbers: one roll costs 0.20 × 0.35 × outstanding = ₹35k on a ₹5 lakh loan.
- **Ranking by expected loss, not raw probability.** P(roll) × outstanding × 0.07 (A10) puts a ₹6.4 lakh loan at 12 DPD ahead of a ₹50k loan at 27 DPD when that is where the money is. I'll be ready to defend the trade-off: small loans close to rolling still surface through the "days to roll" reason.
- **Separate Fastify API behind a Next rewrite (D3, D4).** Cookies stay first-party, there's no CORS, and the sync and import endpoints are plain HTTP handlers that tests call directly with `app.inject`.
- **Shared pure package (D1).** The contact-window and scoring code is the same on phone and server, so the button the officer sees greyed out is exactly what the server would reject.
- **Version pins (D12).** Prisma 7 (8 is still an RC), Better Auth's new `auth` CLI, and TS 6 rather than 7.
- **Hit during setup.** Port 5432 was taken by a local Postgres, so the container maps to 5433. pnpm 12 needs builds approved explicitly (`allowBuilds`). Prisma's generate step moved to the root `postinstall` because the package-level hook ran before the CLI was linked. `next dev` hit the machine's inotify instance limit, which is a local environment issue, documented in the README.

### Review pass, same day

- **Found an off-by-one in date storage.** Prisma writes only the UTC date part of a JS `Date` into a `DATE` column. IST midnight is 18:30 UTC the day before, so 2026-11-02 IST was stored as 2026-11-01. That would have flagged promises as broken a day early and shifted every roll-rate cohort. I confirmed it against Postgres, then made days `YYYY-MM-DD` strings that pass through `toDbDate`/`fromDbDate` in `@kisht/shared`, with regression tests.
- **The database now enforces two business rules, not just the app.** Partial unique indexes allow one current assignment per loan (`endedAt IS NULL`) and one pending promise per loan. These use Prisma 7's `partialIndexes` preview, so Prisma knows about the indexes and won't drop them in a later migration. Integration tests prove that duplicates are rejected.
- **Test safety.** The test database client refuses any database whose name doesn't contain "test", so a wrong `.env` can't wipe dev data.
- **Reviewer path.** `pnpm db:migrate` now runs `migrate deploy` (it applies committed migrations and never prompts). `db:migrate:dev` is for writing new migrations. `db:migrate:test` targets the test database.
- **Biome** checks lint and formatting in CI.
- **Noted for auth (day 2).** Better Auth lets anyone sign up and set extra user fields by default, so a self-registered user could choose `role: BRANCH_MANAGER`. Public sign-up will be off, and `role`/`branchId` won't be accepted as user input, with a test.

## Day 2: auth, seed data and the daily import (2026-11-02)

- **Auth.** Better Auth with sign-up disabled, and `role`/`branchId`/`locale` marked `input: false`. Tests show self-registration fails with `EMAIL_PASSWORD_SIGN_UP_DISABLED` and a role change fails with `FIELD_NOT_ALLOWED`, while a plain name change still succeeds, so the rejection is specific. Sessions last 30 days so an officer who is offline for days doesn't lose their outbox.
- **A test that proved nothing, caught.** The first sign-up test used a `@test.local` address. Better Auth rejected it as an invalid email, so the test passed for the wrong reason. Probing the real responses showed this, and the test now uses a valid address and asserts the specific error code.
- **Found that Better Auth turns off its Origin/CSRF checks when `NODE_ENV=test`.** Our tests were running a weaker configuration than production, and a POST from `https://evil.example` with a valid cookie succeeded. Fixed by forcing `disableOriginCheck: false`, plus our own Origin guard on every state-changing `/api` route (requests with no Origin are rejected too). Both are covered by tests.
- **One access rule.** `loanScope(user)` is AND-ed into every loan query. Officers see loans currently assigned to them (they lose access on reassignment), managers see their branch, the head sees everything. Out of scope returns 404, never 403, so loan IDs can't be probed. Borrower phones are masked, and each reveal writes an audit row (DPDP).
- **Assignment: the cap goes on the list, not on ownership.** The plan first said "capacity 25 per officer". Applied to ownership, that would leave overdue loans without an owner on a heavy day. Now a loan stays with its current officer while they cover its pincode, otherwise it goes to the least-loaded covering officer, and the 25 cap applies only to the day's list. Uncovered pincodes (452020 in the seed) go to the manager's queue.
- **Seed as a simulation, not random rows.** Each loan has a hidden risk that drives missed EMIs, payment speed, reachability and promise-keeping. Officers in the simulation work oldest-overdue-first, which is today's practice and the baseline the priority model has to beat. I calibrated it to the brief: roll rate 1–30 → 31+ is **23.1%** (brief: 22%), and 29% of promises are kept. `pnpm --filter @kisht/db sim:stats` prints the numbers. The brief's three sample rows come out exactly, including LN-11930's promise from 31 Oct being broken as of 2 Nov after the one-day grace.
- **Import: preview, then commit.** Preview validates and plans (payments found, cures, new loans, assignment changes) without writing any loan data. Commit claims the batch with a conditional update before doing anything, so a double submit can't apply twice. It then re-plans inside a single transaction, because the database may have changed since the preview. The CSV parser handles what Indian bank exports actually contain: BOM, CRLF, `₹6,40,000`, `+91` phones, `05/11/2026`. One bad row is reported with its Excel row number and never blocks the rest.
- **Local environment.** This machine's inotify limit also breaks `tsx watch`, so `pnpm --filter @kisht/api start` (no watcher) is the fallback, and it now loads `.env`.

### Day 2, continued: the first screens (2026-11-03)

- **Web foundation.** Design tokens in Tailwind v4 `@theme`: one ink-indigo accent, and red/amber/green reserved for meaning. Noto Sans plus Noto Sans Devanagari, tabular figures for money, 48px tap targets. Shared loading, empty and error states, so every screen handles them the same way. Hindi is the default; the language toggle is on every screen.
- **Sign-in.** One-tap demo accounts (officer, manager, head) appear only in demo mode. Officers are routed to `/today`, managers to the import screen; an officer who types a manager URL is sent home. The API enforces access regardless (D14).
- **Import screen (screen 5).** Choose a day and a file, see what the file will change, then commit. The preview shows rows ready, rows with errors (with Excel row numbers), new loans, cures, payments, assignment changes, each officer's load, and a warning when the upload replaces an earlier one for the same day. In demo mode it offers a generated sample export with deliberate changes, so a reviewer sees every path in one upload.
- **Caught by looking at the screenshots, not by tests:**
  - Tailwind v4 changed the arbitrary CSS-variable syntax, so `rounded-[--radius-card]` silently did nothing and cards had square corners. A theme token is now its own utility (`rounded-card`).
  - The demo buttons were missing from the build. `@next/env` caches the env it loads first (from `apps/web`), so loading the root `.env` from `next.config.ts` was a no-op until called with `forceReload`.
  - On phones the import history scrolled sideways and cut off the status column. Phones now get a stacked list, and the list shows the last 7 with "show all".
  - `text-rendering: optimizeLegibility` was removed: it mis-spaces Noto at small sizes and costs layout time on low-end phones.
- **Turbopack and NodeNext.** Next couldn't resolve `./dates.js`-style imports inside the shared package, which are correct for tsc's NodeNext mode. `@kisht/shared` now uses explicit `.ts` specifiers with `allowImportingTsExtensions`: the one form tsc, tsx, Vitest and Turbopack all accept.
- **End-to-end tests (Playwright, phone and desktop):** signed-out redirect, officer routing, the full preview → commit flow on the sample export, and the wrong-password message. They run with one worker because the projects share a database, and two parallel imports did race in the first run.

## Day 3 morning: architecture hardening (2026-11-03)

After two days of shipping features, I stopped and removed the duplication before building more on top of it. Every later feature copies whatever pattern exists, so this was the cheapest moment to fix it. The rule was that behaviour must not change: the existing tests were not edited beyond how the app is built, and they all still pass.

| Before                                                                 | After                                                                                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| 9 access conditions written by hand (17 scope references) in 3 files   | One `scope.ts` module; every `where` comes from it                                                                                      |
| 7 response types copied by hand into the web app                       | 0: both sides use `@kisht/contracts`, and the web parses every response with it                                                         |
| Routes mixing HTTP and Prisma; `HttpError` defined in the session file | `modules/*/{routes,service}.ts`, `http/{errors,guards,origin}.ts`                                                                       |
| A clock injected into imports only                                     | One `AppContext.clock`, ready for the contact window and the demo clock                                                                 |
| Roll-rate maths in 2 places (the dashboard would have been a third)    | `domain/rollRate.ts`, unit tested; it gives the same 23.1% for the 2 Nov seed                                                           |
| User provisioning and root-env loading each repeated                   | `provisionUser` and `loadRootEnv` in `@kisht/db`                                                                                        |
| A 528-line import page                                                 | 19-line composition of `features/imports/*`                                                                                             |
| Package boundaries by convention                                       | Lint-enforced (`noRestrictedImports`); domain coverage ≥ 90% (now 99.5%)                                                                |
| Browser tests run only locally                                         | A CI job that migrates, seeds, builds and runs them                                                                                     |
| 90 tests                                                               | 101 tests, including contract guarantees (unlisted fields stripped, broken responses become a logged 500) and the documented route list |

Also renamed `@kisht/shared` to `@kisht/domain`: it holds business rules, and the name should say so. The API now serves OpenAPI docs at `/api/docs`, generated from the same schemas.

Deliberately not done: splitting into services, or adding CQRS or a repository layer over Prisma. For a product this size they add indirection without a benefit a reviewer could point to.
