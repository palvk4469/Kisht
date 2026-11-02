# Kisht Collections

A field collections app for an MSME lender (an RBI-registered NBFC in Indore). Each morning, field officers open the app and see which overdue borrowers matter most today and why. They log what happened (paid, promise to pay, not reachable, dispute) in three taps, even with no signal. Branch managers see promises and roll rates by branch the same day, instead of waiting for Friday's Excel.

- **Priority score with reasons.** A small trained model estimates the chance that each loan rolls from 1–30 into 31+ DPD. Each loan is ranked by the expected rupee loss we can still avoid, and shows the top three reasons. The score is advisory: managers can reorder any list, and a weekly back-test checks it against what borrowers actually paid.
- **Offline first.** Outcomes and contact attempts go to an on-device outbox and sync when there's signal. Each event carries an idempotency key, so retries never create duplicates.
- **Contact window.** RBI recovery rules allow contact only between 8 am and 7 pm, so the app blocks calls and visits outside that window. The server checks again using the time the action happened (corrected for device clock skew), and every attempt is recorded, blocked ones included.

> **Status:** in active development (a 7-day build, 2026-11-02 to 2026-11-08). Foundations are done; features land day by day. The [engineering log](docs/ENGINEERING-LOG.md) tracks what's built and why.

See [docs/ASSUMPTIONS.md](docs/ASSUMPTIONS.md), [docs/DECISIONS.md](docs/DECISIONS.md) and [docs/ENGINEERING-LOG.md](docs/ENGINEERING-LOG.md).

## Stack

| Layer    | Choice                                                                                         |
| -------- | ---------------------------------------------------------------------------------------------- |
| Web      | Next.js 16 (App Router), a PWA. The officer UI is built for phones, the manager UI for desktop |
| API      | Fastify 5, zod-validated routes                                                                |
| Database | PostgreSQL 16, Prisma 7 (pg driver adapter)                                                    |
| Auth     | Better Auth (email and password), roles `OFFICER`, `BRANCH_MANAGER` and `HEAD`                 |
| Offline  | Dexie (IndexedDB) outbox and a service worker                                                  |
| Tests    | Vitest; Playwright for the offline flow                                                        |

## Repository layout

```
apps/
  api/       Fastify API (buildApp() factory, tested with app.inject)
  web/       Next.js app; /api/* is rewritten to the API
packages/
  db/        Prisma schema, migrations, client, seed
  shared/    Pure domain logic shared by web and API: contact window,
             scoring, assignment, roll rate, zod schemas
docs/        Assumptions, decisions, engineering log, TDD
```

## Run locally

Requirements: Node 22, pnpm 12, Docker.

```bash
cp .env.example .env
pnpm install
pnpm db:up        # Postgres 16 on host port 5433 (set POSTGRES_PORT to change)
pnpm db:migrate    # applies committed migrations (prisma migrate deploy)
pnpm db:seed
pnpm dev          # web on http://localhost:3000, API on http://localhost:4000
```

```bash
pnpm typecheck
pnpm test
```

Tests that touch the database use the separate `kisht_test` database, which docker-compose creates on first start. Apply migrations to it with `pnpm db:migrate:test`.

To change the schema, edit `packages/db/prisma/schema.prisma` and run `pnpm db:migrate:dev` in an interactive terminal.

### Troubleshooting

- **Port 5432 already in use.** The compose file maps Postgres to host port 5433 by default. If you change `POSTGRES_PORT`, update the URLs in `.env` to match.
- **`next dev` fails with "Too many open files (os error 24)".** Your machine has run out of inotify instances. Raise the limit with `sudo sysctl fs.inotify.max_user_instances=512`, or use `pnpm --filter @kisht/web build && pnpm --filter @kisht/web start` instead.
