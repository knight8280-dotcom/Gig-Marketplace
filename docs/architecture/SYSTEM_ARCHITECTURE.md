# System Architecture — Local Gig Marketplace

> **Status:** Draft v0.1 — Phase 0. This document describes the target MVP architecture. Only the repository scaffold exists today; sections describe design, not shipped functionality.

## 1. Overview

A **modular monolith** backend (single deployable API + a background worker process), a **React Native (Expo)** mobile app serving both customers and workers, and a **Next.js admin web app**. PostgreSQL + PostGIS is the system of record; Redis backs queues and rate limiting; S3-compatible object storage holds uploaded files; Stripe Connect handles marketplace payments.

```
┌─────────────┐   ┌─────────────┐   ┌──────────────┐
│ Mobile app  │   │  Admin web  │   │ Stripe       │
│ (Expo RN)   │   │  (Next.js)  │   │ webhooks     │
└──────┬──────┘   └──────┬──────┘   └──────┬───────┘
       │  HTTPS REST /v1 │                 │
       ▼                 ▼                 ▼
┌─────────────────────────────────────────────────┐
│                API (NestJS modular monolith)    │
│  auth users customers workers skills categories │
│  jobs matching availability messaging           │
│  notifications payments payouts ratings         │
│  disputes reports verification admin analytics  │
│  files                                          │
└───────┬───────────────┬───────────────┬─────────┘
        │               │               │
        ▼               ▼               ▼
┌──────────────┐ ┌────────────┐ ┌───────────────┐
│ PostgreSQL   │ │ Redis      │ │ Object storage│
│ + PostGIS    │ │ (BullMQ,   │ │ (S3 / MinIO)  │
│              │ │ rate limit)│ │               │
└──────────────┘ └─────┬──────┘ └───────────────┘
                       │
                ┌──────▼───────┐
                │ Worker proc  │  notifications, matching fan-out,
                │ (BullMQ)     │  webhook processing, reminders,
                └──────────────┘  image processing, fraud analysis
```

Why a modular monolith (see ADR-003): one team, one pilot market, transactional integrity across jobs/payments/matching is far easier in one database + one process, and clean module boundaries keep future service extraction possible. No microservices in the MVP.

## 2. Repository layout (monorepo)

```
/
├── apps/
│   ├── api/        NestJS backend (API + worker entrypoints)
│   ├── mobile/     Expo React Native app (customer + worker)
│   └── admin/      Next.js admin dashboard
├── packages/
│   └── shared/     shared TypeScript types, enums, constants (job states, roles, error codes)
├── docs/           product / architecture / database / api / security / business / development
├── docker-compose.yml   local Postgres+PostGIS, Redis, MinIO
└── .github/workflows/   CI
```

Tooling: pnpm workspaces, TypeScript everywhere, ESLint + Prettier, Vitest/Jest, GitHub Actions CI.

## 3. Backend modules and responsibilities

| Module | Responsibility |
|---|---|
| `auth` | registration, login, JWT access + rotating refresh tokens, email/phone verification flows, password reset, session revocation |
| `users` | user records, roles, account status, deletion requests |
| `customers` | customer profiles, saved addresses |
| `workers` | worker profiles, service radius, transportation, equipment, reliability metrics |
| `skills` | skill catalog, worker↔skill links |
| `categories` | category config, verification requirements, restricted-work screening rules |
| `availability` | availability toggle, weekly windows, match preferences |
| `jobs` | job CRUD, drafts, state machine, job events, scope changes, photos metadata |
| `matching` | candidate query (PostGIS), eligibility filter, ranking interface, notification fan-out |
| `messaging` | job-scoped conversations, messages, read status, blocking |
| `notifications` | notification records, preference checks, push/email/SMS dispatch via adapters |
| `payments` | Stripe customers, payment intents, ledger, fees (pricing service), refunds, webhook processing |
| `payouts` | Stripe Connect accounts, transfers, payout status, earnings aggregation |
| `ratings` | two-sided ratings, double-blind visibility, aggregates |
| `disputes` | dispute records, evidence, payment holds, resolution |
| `reports` | safety/behavior/fraud reports, admin review queue |
| `verification` | verification records per type (email/phone/identity/background), provider adapters |
| `admin` | admin endpoints, platform settings, admin action auditing |
| `analytics` | domain event ingestion → analytics event stream, KPI queries |
| `files` | upload authorization, validation, signed URLs, storage adapter |

Cross-cutting: `common/` (authz guards + permission service, rate limiting, idempotency middleware, money/value objects, pagination, structured logging, config).

Module rules:
- Modules communicate through exported services or **domain events** (in-process event bus persisted to `outbox`/queue) — never by reaching into another module's tables.
- Controllers are thin: validation → authz → service call. No business rules in controllers (cancellation policy, fees, matching all live in services).

## 4. Key architectural mechanisms

### Job state machine
Central transition table in `jobs` module (single source of truth, exported to `packages/shared` for clients). Every transition: validated, executed in a DB transaction, appends an immutable `job_events` row, and publishes a domain event. No scattered booleans. See ADR-006.

### Concurrency-safe acceptance
`POST /jobs/:id/accept` runs a single transaction: `SELECT ... FOR UPDATE` on the job row → check remaining slots and worker eligibility → insert `job_workers` (unique `(job_id, worker_id)`) → update filled count/state. A DB `CHECK`/trigger guarantees accepted assignments never exceed `workers_needed`. Retries are idempotent (existing assignment returns success).

### Idempotency
- Client mutations accept an `Idempotency-Key` header; keys + response snapshots stored (`idempotency_keys` table) with TTL.
- Every Stripe call sends a deterministic idempotency key derived from our ledger record id.
- Webhooks: `stripe_events` table with unique event id → duplicate deliveries are no-ops.

### Background jobs (BullMQ)
Queues: `notifications`, `matching`, `stripe-webhooks`, `reminders`, `images`, `fraud`. HTTP requests never wait on slow async work; the API enqueues and returns. Jobs are retry-safe and idempotent. The worker process is a second entrypoint of the same codebase (separate process/dyno), enabling independent scaling.

### Outbox pattern (lightweight)
State-changing transactions write domain events to an `outbox` table in the same transaction; a poller moves them onto queues. Guarantees no lost notifications/analytics on crash between commit and enqueue.

## 5. Geospatial strategy

- PostGIS `geography(Point, 4326)` columns for job locations and worker home base; GiST indexes.
- Nearby-job query: `ST_DWithin(job.location, worker.location, radius_m)` + eligibility filters, ordered by distance/start time; cursor-paginated.
- Pre-acceptance location privacy: an `approx_location` column (deterministically offset ~300 m + rounded) is computed at posting time and is the **only** coordinate exposed before acceptance.
- Geocoding via provider adapter (pluggable; dev stub for local work). Provider choice is an open product decision (cost).

## 6. Matching engine

Deterministic pipeline, versioned and documented:

```
Job posted → candidate query (PostGIS: workers whose service radius covers the job,
             available now/at job time, category enabled, min-pay satisfied)
          → eligibility filter (verification requirements of the category,
             account in good standing, payout account ready)
          → ranking (MVP: distance ascending, tie-break by availability recency
             and a new-worker opportunity boost — documented fairness rule)
          → fan-out notifications in ranked batches (configurable batch size/interval)
          → acceptance closes slots; fill → stop fan-out
```

`MatchRanker` is an interface so future signals (rating, completion rate, response rate, anti-concentration fairness, demand balancing, and eventually learned ranking) plug in without changing callers. **No protected characteristics are ever inputs.** Matching policy changes require a DECISIONS.md entry.

## 7. API design

REST, versioned under `/v1` (ADR-005). JSON. Cursor-based pagination on all lists. Standard error envelope with machine-readable codes. Authn via short-lived JWT access tokens + rotating refresh tokens. Authorization enforced centrally (permission service + ownership checks in guards/services — never "the app won't call this"). Full contract in `docs/api/API_SPECIFICATION.md`.

## 8. Mobile app (Expo React Native, TypeScript)

- Expo Router; role-aware tab navigation (worker/customer modes on one account).
- Server state via TanStack Query (caching, retries, offline-tolerant reads); minimal local state (Zustand).
- Push via Expo Notifications; maps via `react-native-maps`; location permission requested contextually.
- The app makes **no authoritative decisions**: job state, payments, matching, permissions all come from the API. Client hides UI it can't use, server enforces.
- Shared enums/types from `packages/shared` keep client and server state names in lockstep.

## 9. Admin app (Next.js)

Web-only, deployed separately, admin/support roles only (server-checked on every request — the admin UI is a client of the same `/v1` API with admin-scoped endpoints under `/v1/admin/*`). Strong auth (long random passwords + TOTP 2FA at minimum). Every mutating admin action requires a reason where relevant and writes `admin_actions` + `audit_logs`.

## 10. Observability

- Structured JSON logs (pino) with request ids; **no** payment credentials, tokens, or unnecessary PII in logs.
- Error tracking (Sentry-compatible adapter) on API, worker, mobile, admin.
- Metrics: API latency, DB errors, queue depth/failures, payment failures, notification failures, auth failures, state-transition counts.
- Health endpoints: `/healthz` (liveness), `/readyz` (DB/Redis checks).

## 11. Security architecture

Summarized here; full model in `docs/security/SECURITY_MODEL.md`. Central permission service; per-endpoint authn/authz/validation/ownership/rate limits; file validation by content, not extension; secrets via environment only; money as integer minor units; immutable audit/event tables (no UPDATE/DELETE grants for app role on those tables).

## 12. Scalability path (explicitly not built now)

Start: 1 API instance + 1 worker + 1 Postgres + 1 Redis (fits a small PaaS footprint; HTTP servers bind `0.0.0.0:$PORT`; filesystem treated as ephemeral — all files in object storage). Growth levers, in order: horizontal API replicas (stateless), more worker processes per queue, Postgres read replicas for discovery/analytics reads, CDN for images, cache for category/config reads, region-partitioned matching. Module boundaries allow extracting `matching`, `notifications`, or `payments` into services later — only when demonstrated need arises.

## 13. Environments

| Env | Purpose | Notes |
|---|---|---|
| local | development | docker-compose (Postgres+PostGIS, Redis, MinIO), Stripe test mode + Stripe CLI webhooks, console adapters for SMS/email |
| staging | pre-prod validation | test-mode Stripe, seeded data |
| production | pilot market | real keys, restricted access |

`.env.example` documents all variables; secrets are never committed.

## 14. What exists today (updated after Phases 1–15 implementation)

- **API (`apps/api`)** — implemented and integration-tested (54 tests against real PostgreSQL+PostGIS): auth (JWT + rotating refresh tokens, email/phone verification), customer/worker profiles + onboarding, skills/categories/availability + platform settings, jobs with the full state machine + immutable events, restricted-work screening + admin review queue, PostGIS discovery with location obfuscation, deterministic matching + fan-out notifications, concurrency-safe multi-worker acceptance, execution lifecycle, scope-change approvals, job-scoped messaging + blocking, double-blind ratings, Stripe Connect payments (charge-at-fill, confirm-triggered transfers, refunds, idempotent webhooks) behind a gateway interface, cancellation policy engine, disputes with payout pause + audited resolution, in-app notifications with preferences, safety reports, admin API (KPIs, users, jobs, payments, audit), auto-confirm/close crons.
- **Mobile (`apps/mobile`)** — Expo SDK 57 app, typechecked, core screens implemented (auth, role-aware tabs, discovery, post-job, job actions, chat, activity, ratings). **Not yet device-tested**; payment-method entry, Connect onboarding UI, maps, photos, and push delivery pending (see its README).
- **Deviations from target architecture (deliberate MVP simplifications, documented):** domain events run on an in-process emitter post-commit instead of Redis/BullMQ queues (listeners are idempotent; queue move is a transport change); crons run in-process instead of a separate worker; file uploads (job photos, message images, evidence photos) are deferred pending the object-storage module; structured pino logging + Sentry hooks pending; admin web app pending (admin API is complete).
- **Not started:** `apps/admin` Next.js UI, BullMQ/Redis wiring, files module, real SMS/email/geocoding/identity providers (console/stub adapters in place behind interfaces).
