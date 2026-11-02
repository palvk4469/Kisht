# Interview notes

What I decided at each phase, and why, so I can explain it in the interview.

## Phase 0: foundations (2026-11-02)

- **Why brief 4.** Its hard parts are about correctness under real constraints: offline sync, and RBI's 8 am–7 pm contact rule enforced even when the phone is offline or its clock is wrong. The "AI" can be a real, explainable model rather than a wrapper. And the value ties to the client's own numbers: one roll costs 0.20 × 0.35 × outstanding = ₹35k on a ₹5 lakh loan.
- **Ranking by expected loss, not raw probability.** P(roll) × outstanding × 0.07 (A10) puts a ₹6.4 lakh loan at 12 DPD ahead of a ₹50k loan at 27 DPD when that is where the money is. I'll be ready to defend the trade-off: small loans close to rolling still surface through the "days to roll" reason.
- **Separate Fastify API behind a Next rewrite (D3, D4).** Cookies stay first-party, there's no CORS, and the sync and import endpoints are plain HTTP handlers that tests call directly with `app.inject`.
- **Shared pure package (D1).** The contact-window and scoring code is the same on phone and server, so the button the officer sees greyed out is exactly what the server would reject.
- **Version pins (D12).** Prisma 7 (8 is still an RC), Better Auth's new `auth` CLI, and TS 6 rather than 7.
- **Hit during setup.** Port 5432 was taken by a local Postgres, so the container maps to 5433. pnpm 12 needs builds approved explicitly (`allowBuilds`). Prisma's generate step moved to the root `postinstall` because the package-level hook ran before the CLI was linked. `next dev` hit the machine's inotify instance limit, which is a local environment issue, documented in the README.
