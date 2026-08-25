# Local Development Setup — Local Gig Marketplace

> **Status:** Phase 0. The scaffold runs today (API health server, shared package). Database/queue steps become relevant starting Phase 1; they are documented now so the flow is stable.

## Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | ≥ 22 | see `.nvmrc` |
| pnpm | ≥ 10 | `corepack enable` or `npm i -g pnpm` |
| Docker + Docker Compose | recent | local Postgres+PostGIS, Redis, MinIO |
| Stripe CLI | latest | webhook forwarding in dev (Phase 10+) |
| Expo tooling | via `pnpm` | mobile app (`npx expo`) |

No paid external services are required to run the app locally. External providers (SMS, geocoding, identity) have console/stub dev adapters; Stripe runs in test mode (free).

## 1. Clone & install

```bash
git clone <repo-url> gig-marketplace
cd gig-marketplace
pnpm install
```

## 2. Configure environment

```bash
cp .env.example .env
# edit .env — every variable is documented inline in .env.example
```

Never commit `.env` or any secret. `.env` is gitignored.

## 3. Start local dependencies

```bash
docker compose up -d        # postgres (postgis), redis, minio
```

Services and default local ports:

| Service | Port | Credentials (local only) |
|---|---|---|
| PostgreSQL + PostGIS | 5432 | `gig` / `gig_dev_password` / db `gig_dev` |
| Redis | 6379 | — |
| MinIO (S3 API / console) | 9000 / 9001 | `minio_local` / `minio_local_password` |

## 4. Migrations & seed (from Phase 1)

```bash
pnpm --filter @gig/api migrate     # run database migrations
pnpm --filter @gig/api seed        # load development seed data (clearly fake)
```

Seed data is idempotent, clearly fake, and refuses to run in production. Development accounts (password `devpassword123` for all):

| Email | Roles | Notes |
|---|---|---|
| `admin@example.test` | ADMIN | platform settings, categories, review queues |
| `customer@example.test` | CUSTOMER | seeded customer profile |
| `worker@example.test` | WORKER | seeded worker profile, skills, categories (Austin, TX area home base) |

Real personal information is never used in seeds.

## 5. Run the backend

```bash
pnpm --filter @gig/api dev         # API on http://localhost:3000  (binds 0.0.0.0:$PORT)
pnpm --filter @gig/api dev:worker  # background worker process (from Phase 7+)
```

Health checks: `GET /healthz` (liveness), `GET /readyz` (dependency checks).

## 6. Run the mobile app

```bash
pnpm --filter @gig/mobile start    # Expo dev server; scan QR with Expo Go
```

Set `EXPO_PUBLIC_API_URL` in `apps/mobile/.env` to your machine's LAN IP so a device can reach the API.

## 7. Run the admin app

```bash
pnpm --filter @gig/admin dev       # http://localhost:3001
```

`dev` pins port 3001, but `pnpm --filter @gig/admin start` (the production
server) defaults to 3000 and collides with the API. Run it as
`PORT=3001 pnpm --filter @gig/admin start` locally; hosting platforms inject
`PORT` themselves.

Sign in with the seeded `admin@example.test` / `devpassword123`.

## 8. Stripe webhooks in dev (Phase 10+)

```bash
stripe listen --forward-to localhost:3000/v1/webhooks/stripe
# copy the printed webhook signing secret into .env → STRIPE_WEBHOOK_SECRET
```

## 9. Tests, lint, typecheck

```bash
pnpm typecheck                     # all workspaces
pnpm lint
pnpm test                          # unit/integration (integration tests use dockerized Postgres)
```

## Environment variables

`.env.example` at the repo root is the authoritative, commented list. Summary:

| Variable | Purpose |
|---|---|
| `NODE_ENV`, `PORT` | runtime basics (server binds `0.0.0.0:$PORT`) |
| `DATABASE_URL` | Postgres connection string |
| `REDIS_URL` | Redis connection |
| `JWT_ACCESS_SECRET`, `JWT_ACCESS_TTL`, `REFRESH_TOKEN_TTL` | auth |
| `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` | object storage (MinIO locally) |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PUBLISHABLE_KEY` | test-mode keys locally |
| `SMS_PROVIDER`, `EMAIL_PROVIDER`, `GEOCODER_PROVIDER` | `console`/stub in dev; real adapters in prod |
| `EXPO_PUBLIC_API_URL` | mobile → API base URL |

## Troubleshooting

- **Postgres refuses connections**: `docker compose ps` → is `db` healthy? PostGIS image can take ~10 s on first boot.
- **Port already in use**: change `PORT` in `.env` (and Expo/admin equivalents).
- **pnpm install fails on native deps (argon2 etc.)**: ensure a working toolchain (`build-essential`/Xcode CLT) — from Phase 1.
- **Expo device can't reach API**: use LAN IP, not `localhost`, in `EXPO_PUBLIC_API_URL`; same Wi-Fi network.
