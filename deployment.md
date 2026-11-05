# Deployment

Live app: LIVE_URL_PENDING

## Demo logins

The password for every account is `Kisht@Demo2026`. These are seeded test accounts with placeholder data. The sign-in page also offers them as one-tap buttons.

| Role                | Email                                                                                                                     | Sees                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| Head of collections | `anil.mehta@kisht.example`                                                                                                | All branches               |
| Branch manager      | `sanjay.joshi@kisht.example`                                                                                              | Indore Central             |
| Branch manager      | `kavita.sharma@kisht.example`                                                                                             | Pithampur                  |
| Field officer       | `rahul.chouhan@kisht.example`                                                                                             | Holds sample loan LN-10293 |
| Field officer       | `neha.solanki@kisht.example`                                                                                              | Holds sample loan LN-10871 |
| Field officer       | `imran.qureshi@kisht.example`                                                                                             | Holds sample loan LN-11930 |
| Field officer       | `priya.malviya@kisht.example`, `arjun.patidar@kisht.example`, `sunita.yadav@kisht.example`, `vikas.rathore@kisht.example` | Their own lists            |

Contact is blocked outside 8 am to 7 pm IST, as the rules require. If you're testing outside those hours, use the "Demo time" button shown on screen.

## Run locally

Requirements: Node 22, pnpm 12, Docker.

```bash
cp .env.example .env
pnpm install
pnpm db:up          # Postgres 16 on host port 5433
pnpm db:migrate
pnpm db:seed
pnpm --filter @kisht/web build
pnpm --filter @kisht/api start     # API on http://localhost:4000
pnpm --filter @kisht/web start     # in a second terminal: web on http://localhost:3000
```

`pnpm dev` also works, with hot reload.

To use another web port, for example if 3000 is taken, start each side like this:

```bash
BETTER_AUTH_URL=http://localhost:3001 pnpm --filter @kisht/api start
pnpm --filter @kisht/web exec next start --port 3001
```

Run the checks with `pnpm lint`, `pnpm typecheck` and `pnpm test`. Browser tests need a seeded database and a web build, then `pnpm e2e`.

## How it's deployed

| Part          | Host                 | Why                                                                           |
| ------------- | -------------------- | ----------------------------------------------------------------------------- |
| Web (Next.js) | Vercel               | Serves the static shell and proxies `/api/*` to the API (D3)                  |
| API (Fastify) | Render web service   | A long-running process, because the reminder dispatcher runs on a timer (D24) |
| Database      | Neon (PostgreSQL 16) | Managed Postgres                                                              |

### Database

1. Create a Neon project and copy its connection string.
2. From your machine, with `DATABASE_URL` set to it and `DEMO_PASSWORD` set, run `pnpm db:migrate` and then `pnpm db:seed`.

### API on Render

- **Build command:** `pnpm install --frozen-lockfile --prod=false`. Dev dependencies are needed because the service runs on `tsx`, and `prisma generate` runs on install.
- **Start command:** `pnpm --filter @kisht/api start`
- **Health check path:** `/health`

### Web on Vercel

- **Root directory:** `apps/web`, with "include files outside the root directory" on, because it uses the shared packages.
- **Framework preset:** Next.js. The defaults for build and output work.

### After deploying

1. Set `BETTER_AUTH_URL` on the API to the final Vercel URL.
2. Set `API_URL` on the web app to the Render URL, and redeploy.
3. Sign in and log an outcome.
4. Try signing in several times with a few people at once. If one person's failed attempts lock out others, the proxy chain is sending several addresses in `x-forwarded-for`, and Better Auth's `trustedProxies` option needs setting.
5. Open a loan and tap Send reminder. If a key is set, the draft should be labelled as an AI draft. If not, check `fallbackReason` in the `reminder_draft` table.

## Environment variables

Names only. Values are never committed; `.env.example` shows the format for local use.

**API (Render)**

| Name                   | Required | Purpose                                                   |
| ---------------------- | -------- | --------------------------------------------------------- |
| `DATABASE_URL`         | Yes      | Postgres connection                                       |
| `BETTER_AUTH_SECRET`   | Yes      | Signs sessions, 32 characters or more                     |
| `BETTER_AUTH_URL`      | Yes      | Public web URL; also the origin check                     |
| `NODE_ENV`             | Yes      | `production` turns on the sign-in rate limit              |
| `DEMO_MODE`            | No       | Demo clock, sample export and API docs                    |
| `ANTHROPIC_API_KEY`    | No       | AI drafts; without it officers get the approved templates |
| `AI_DRAFT_MODEL`       | No       | Overrides the default model                               |
| `API_HOST`, `API_PORT` | No       | Default `0.0.0.0` and `4000`                              |

**Web (Vercel)**

| Name                        | Required | Purpose                                             |
| --------------------------- | -------- | --------------------------------------------------- |
| `API_URL`                   | Yes      | Where `/api/*` is proxied to                        |
| `NEXT_PUBLIC_DEMO_MODE`     | No       | One-tap logins and the demo clock bar               |
| `NEXT_PUBLIC_DEMO_PASSWORD` | No       | Password for the one-tap logins                     |
| `NEXT_PUBLIC_BUILD_ID`      | No       | Names the offline cache; defaults to the build time |

**Seed and tests only**

| Name                | Purpose                             |
| ------------------- | ----------------------------------- |
| `DEMO_PASSWORD`     | Password given to seeded accounts   |
| `TEST_DATABASE_URL` | Database for the test suite         |
| `POSTGRES_PORT`     | Host port for local Docker Postgres |
