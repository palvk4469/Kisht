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
