# Built on the server itself, from a copy of the repo. API_URL is baked into the web image by Next's rewrites.
FROM node:22-slim AS base
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* && npm install -g pnpm@12.5.1
WORKDIR /repo
COPY . .

# The API runs its TypeScript through tsx, and also carries the migrate and seed tools.
FROM base AS api
# In one step so the deletions really shrink the image. These arrive as optional peers
# or through the workspace root; nothing in this image runs them.
RUN pnpm install --frozen-lockfile --filter "@kisht/api..." && pnpm --filter @kisht/db generate \
  && cd /repo/node_modules/.pnpm \
  && rm -rf next@* @next+swc* @biomejs+cli* @electric-sql+pglite* @prisma+studio-core* \
  && rm -rf /repo/apps/web /repo/e2e "$(pnpm store path)"
ENV NODE_ENV=production
WORKDIR /repo/apps/api
CMD ["node", "--import", "tsx", "src/server.ts"]

FROM base AS web-build
ARG API_URL=http://api:4000
ARG NEXT_PUBLIC_DEMO_MODE=true
ARG NEXT_PUBLIC_DEMO_PASSWORD=
ENV API_URL=$API_URL NEXT_PUBLIC_DEMO_MODE=$NEXT_PUBLIC_DEMO_MODE \
  NEXT_PUBLIC_DEMO_PASSWORD=$NEXT_PUBLIC_DEMO_PASSWORD NEXT_OUTPUT=standalone
# No install scripts: the root one generates the Prisma client, which the web app never uses.
RUN pnpm install --frozen-lockfile --ignore-scripts --filter "@kisht/web..." \
  && pnpm --filter @kisht/web build

FROM node:22-slim AS web
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=web-build /repo/apps/web/.next/standalone ./
COPY --from=web-build /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build /repo/apps/web/public ./apps/web/public
USER node
CMD ["node", "apps/web/server.js"]
