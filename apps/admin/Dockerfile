# Container image for @gig/admin (Next.js ops dashboard). Build from the
# repository root:
#
#   docker build -f apps/admin/Dockerfile \
#     --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
#     -t gig-admin .
#
# NEXT_PUBLIC_* values are compiled into the client bundle, so the API URL is a
# BUILD argument, not a runtime variable — changing it means rebuilding.

FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable

ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Every workspace manifest must be present for --frozen-lockfile to match the
# lockfile; the filter then narrows the install to the dashboard's subgraph.
COPY . .
RUN pnpm install --frozen-lockfile --filter @gig/admin...
RUN pnpm --filter @gig/admin build

# Drop dev dependencies. A second filtered install rather than `pnpm prune
# --prod`, which resolves against the workspace root manifest and would strip
# the links this image needs. CI=true keeps pnpm from prompting without a TTY.
RUN CI=true pnpm install --prod --frozen-lockfile --filter @gig/admin...

FROM node:22-slim AS runtime
WORKDIR /app

USER node
COPY --from=build --chown=node:node /app /app

ENV NODE_ENV=production
ENV PORT=3001
EXPOSE 3001

WORKDIR /app/apps/admin

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD ["node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/`).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Invoke Next's binary through node so the running container needs neither pnpm
# nor corepack. `next start` honours PORT, which hosts inject.
CMD ["node", "node_modules/next/dist/bin/next", "start"]
