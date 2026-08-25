# Container image for @gig/api. Works on any container host (Fly.io, Railway,
# Render, Cloud Run, a VPS). Build from the repository root:
#
#   docker build -f apps/api/Dockerfile -t gig-api .
#
# The API needs PostgreSQL 16+ with the postgis, citext and pgcrypto
# extensions available — see docs/development/DEPLOYMENT.md.

FROM node:22-slim AS build
WORKDIR /app

# argon2 is a native module. It ships prebuilds, but keep a toolchain here so
# the build still succeeds on a platform with no matching prebuild.
RUN corepack enable \
 && apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Every workspace manifest has to be present for --frozen-lockfile to match the
# lockfile, so copy the tree and then narrow the install to the API's subgraph —
# that keeps the Expo app's dependencies out of this image.
COPY . .
RUN pnpm install --frozen-lockfile --filter @gig/api...

# @gig/api resolves @gig/shared through its compiled dist/, so build that first.
RUN pnpm --filter @gig/shared build \
 && pnpm --filter @gig/api build

# Drop dev dependencies now the TypeScript build is done. This is a second
# filtered install rather than `pnpm prune --prod`: prune resolves against the
# workspace ROOT manifest, which declares no dependencies, so it strips every
# link under apps/api/node_modules and the image starts with "Cannot find
# module 'pg'". CI=true keeps pnpm from prompting without a TTY.
RUN CI=true pnpm install --prod --frozen-lockfile --filter @gig/api...

FROM node:22-slim AS runtime
WORKDIR /app

# Run as the image's unprivileged user rather than root.
USER node

COPY --from=build --chown=node:node /app /app

ENV NODE_ENV=production
# Hosts inject their own PORT; main.ts binds 0.0.0.0 so it is routable.
ENV PORT=3000
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/healthz`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Migrations, then the idempotent bootstrap (platform fee + first admin), then
# the server. Safe to re-run on every deploy.
#
# Invoked through node rather than `pnpm start:prod` so the running container
# needs neither pnpm nor corepack — nothing is fetched at boot.
CMD ["sh", "-c", "node apps/api/dist/database/migrate-cli.js && node apps/api/dist/database/bootstrap-cli.js && node apps/api/dist/main.js"]
