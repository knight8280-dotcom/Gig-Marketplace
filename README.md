# Local Gig Marketplace

A production-grade, two-sided marketplace connecting **people who need local jobs done** with **people who want flexible local work** — post a job, match with nearby workers, complete it, pay, and rate each other.

> **Working name:** LOCAL GIG MARKETPLACE (final brand not selected).
> **Status: working prototype, pre-pilot.** The full golden loop (post → match →
> accept → perform → confirm → pay → rate) is implemented and covered by
> integration tests against a real PostgreSQL+PostGIS database. It has **not**
> been launched: several **launch blockers are legal, not technical** — see
> [LEGAL_COMPLIANCE.md](docs/business/LEGAL_COMPLIANCE.md) (L-2 terms of
> service, L-3 insurance) — and payments run in **Stripe test mode**.
> Deployment runbook: [DEPLOYMENT.md](docs/development/DEPLOYMENT.md).

## The core loop

```
CUSTOMER POSTS JOB → PLATFORM FINDS RELEVANT WORKERS → WORKER ACCEPTS
→ JOB IS PERFORMED → CUSTOMER CONFIRMS COMPLETION → PAYMENT IS RELEASED
→ BOTH SIDES RATE EACH OTHER
```

## Repository layout

```
apps/
  api/       NestJS backend — modular monolith (API + background worker)
  mobile/    Expo React Native app — customers + workers (also exports to web)
  admin/     Next.js admin dashboard
packages/
  shared/    Shared TypeScript domain types (job states, roles, errors)
docs/        Product, architecture, database, API, security, business docs
```

## Stack (see [ADRs](docs/architecture/DECISIONS.md))

| Layer | Choice |
|---|---|
| Mobile | React Native + Expo + TypeScript |
| Backend | Node.js + NestJS modular monolith, BullMQ worker |
| Database | PostgreSQL 16 + PostGIS |
| Queue/cache | Redis |
| Payments | Stripe Connect (Express accounts) |
| Files | S3-compatible object storage (MinIO locally) |
| Admin | Next.js |
| Monorepo | pnpm workspaces |

## Documentation

| Area | Docs |
|---|---|
| Product | [PRD](docs/product/PRD.md) · [MVP scope](docs/product/MVP_SCOPE.md) · [User flows](docs/product/USER_FLOWS.md) |
| Architecture | [System architecture](docs/architecture/SYSTEM_ARCHITECTURE.md) · [Decisions (ADRs)](docs/architecture/DECISIONS.md) |
| Data & API | [Database schema](docs/database/DATABASE_SCHEMA.md) · [API specification](docs/api/API_SPECIFICATION.md) |
| Security | [Security model](docs/security/SECURITY_MODEL.md) · [Trust & safety](docs/security/TRUST_AND_SAFETY.md) |
| Business | [Payment model](docs/business/PAYMENT_MODEL.md) · [Legal & compliance register](docs/business/LEGAL_COMPLIANCE.md) |
| Development | [Roadmap](docs/development/ROADMAP.md) · [Local setup](docs/development/LOCAL_SETUP.md) · [Changelog](CHANGELOG.md) |

## Quick start

```bash
corepack enable                     # or: npm i -g pnpm
pnpm install
pnpm --filter @gig/shared build     # @gig/api typechecks against its dist/ output
docker compose up -d db             # PostgreSQL 16 + PostGIS
pnpm --filter @gig/api migrate      # create the schema
pnpm --filter @gig/api seed         # clearly-fake dev accounts + demo jobs
pnpm --filter @gig/api dev          # API on :3000  (/healthz, /readyz)
```

The API test suite is **integration-only** — it runs against a real
PostgreSQL+PostGIS database (ADR-009), so the database must be up before
`pnpm test`.

Full instructions (database, seeds, mobile, admin, Stripe webhooks): [docs/development/LOCAL_SETUP.md](docs/development/LOCAL_SETUP.md).

## Engineering ground rules

- **No fake functionality** — unimplemented UI is labeled; no fake payments, verification, or payouts.
- **Backend is authoritative** — job state, payments, matching, and permissions are server-decided.
- **Money is integers** — minor units + explicit currency, never floats.
- **State machine, not booleans** — every job transition is validated and recorded as an immutable event.
- **Idempotent by construction** — payments, payouts, webhooks, and acceptance are safe to retry.
- **Docs stay true** — documentation, schema, code, tests, and CHANGELOG move together.

Priority order for all trade-offs: safety → security → core marketplace transaction → payment correctness → reliability → UX → liquidity → performance → analytics → nice-to-haves.
