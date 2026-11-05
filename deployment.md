# Deployment

Live app: https://kist-collection.duckdns.org

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

One small Azure VM (2 vCPU, 836 MB RAM, Ubuntu 24.04) runs Kisht with Docker Compose (D32). Caddy provides HTTPS, and a DuckDNS name points at the VM.

```text
Internet -> Caddy (HTTPS) -> web (Next.js) -> api (Fastify) -> db (PostgreSQL 16)
```

Only Caddy publishes ports. The API and database have no public route. Memory is capped per container (`deploy/docker-compose.yml`).

The demo data is generated on a developer machine and copied over, because seeding needs more memory than the API container is allowed. Images are built on the VM, which takes a while but needs no upload.

### 1. Build the images

```bash
git archive HEAD | ssh <server> 'mkdir -p ~/kisht/src && tar -x -C ~/kisht/src'
ssh <server>
cd ~/kisht/src
docker build -f deploy/Dockerfile --target api -t kisht-api:latest .
docker build -f deploy/Dockerfile --target web --build-arg NEXT_PUBLIC_DEMO_PASSWORD=<demo password> -t kisht-web:latest .
```

### 2. Configure and start

On the server, in `~/kisht`, place `docker-compose.yml`, `Caddyfile` and a `.env` holding the variables listed below (`chmod 600`). Then:

```bash
docker compose up -d db
docker compose run --rm -T -w /repo/packages/db api node_modules/.bin/prisma migrate deploy
docker compose up -d
```

### 3. Load the demo data

Seed the local database, then copy it across. Seeded dates are relative to the day of the seed (A15), so repeat this shortly before a review. A repeat first needs the old data cleared on the server, with `TRUNCATE` on every table except `_prisma_migrations`.

```bash
pnpm db:seed
docker exec kisht-postgres pg_dump -U kisht -d kisht --data-only --exclude-table=_prisma_migrations -Fc \
  | ssh <server> 'cd ~/kisht && docker compose exec -T db pg_restore -U kisht -d kisht --data-only --disable-triggers --single-transaction'
```

### After deploying

1. Sign in and log an outcome.
2. Enter a wrong password with a made-up `x-forwarded-for` header, then read the newest `key` in the `rateLimit` table. It should hold your real address, because Caddy replaces that header. Caddy, then Next.js, leaves one address, so `TRUSTED_PROXY_HOPS` stays at its default of 1.
3. Open a loan and tap Send reminder. With a key set, the draft should be labelled as an AI draft. If not, check `fallbackReason` in the `reminder_draft` table.

## Environment variables

Names only. Values are never committed; `.env.example` shows the format for local use.

**Server (`~/kisht/.env`)**

| Name                 | Required | Purpose                                                                |
| -------------------- | -------- | ---------------------------------------------------------------------- |
| `POSTGRES_PASSWORD`  | Yes      | Database password                                                      |
| `BETTER_AUTH_SECRET` | Yes      | Signs sessions, 32 characters or more                                  |
| `BETTER_AUTH_URL`    | Yes      | Public HTTPS address; also the origin check                            |
| `DEMO_PASSWORD`      | Yes      | Password of the seeded accounts                                        |
| `OPENROUTER_API_KEY` | No       | AI drafts; without it officers get the approved templates              |
| `AI_DRAFT_MODELS`    | No       | OpenRouter models to try in order, comma-separated; has a free default |

**Set by the compose file:** `DATABASE_URL`, `BETTER_AUTH_URL`, `DEMO_MODE`, `NODE_OPTIONS`, `TZ`.

**Build arguments for the web image**

| Name                        | Purpose                                                       |
| --------------------------- | ------------------------------------------------------------- |
| `API_URL`                   | Where `/api/*` is proxied to; defaults to the compose service |
| `NEXT_PUBLIC_DEMO_MODE`     | One-tap logins and the demo clock bar                         |
| `NEXT_PUBLIC_DEMO_PASSWORD` | Password for the one-tap logins                               |

**API, optional**

| Name                   | Purpose                                                       |
| ---------------------- | ------------------------------------------------------------- |
| `TRUSTED_PROXY_HOPS`   | Proxies in front of the API, for the sign-in limit; default 1 |
| `API_HOST`, `API_PORT` | Default `0.0.0.0` and `4000`                                  |

**Local and tests only:** `TEST_DATABASE_URL`, `POSTGRES_PORT`.
