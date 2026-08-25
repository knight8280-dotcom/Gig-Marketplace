# Architecture Decision Records — Local Gig Marketplace

> Format: Problem → Options → Decision → Reason → Consequences.
> Status values: PROPOSED, ACCEPTED, SUPERSEDED.
> New major decisions get a new ADR; changed decisions supersede, never silently edit.

---

## ADR-001: React Native + Expo + TypeScript for mobile — ACCEPTED

**Problem.** One mobile product must serve customers and workers on iOS and Android with a small team.

**Options.** (a) Native Swift + Kotlin apps; (b) Flutter; (c) React Native + Expo; (d) mobile web/PWA only.

**Decision.** React Native + Expo + TypeScript, single app with role-aware navigation.

**Reason.** One codebase and one language across backend/mobile/admin; Expo provides push notifications, OTA updates, build services, and location/maps modules that cover MVP needs; PWA cannot deliver reliable push + background location UX; two native apps double the work without MVP benefit.

**Consequences.** Some native-module constraints (acceptable for MVP feature set); must track Expo SDK upgrades; business logic stays server-side so app remains thin.

---

## ADR-002: PostgreSQL + PostGIS — ACCEPTED

**Problem.** The system of record needs relational integrity (jobs↔assignments↔payments), strong constraints, transactions for concurrency-safe acceptance, and efficient geographic queries ("jobs within N miles").

**Options.** (a) PostgreSQL + PostGIS; (b) PostgreSQL + haversine math without PostGIS; (c) MySQL; (d) MongoDB/Dynamo + a search service; (e) Postgres + Elasticsearch for geo.

**Decision.** PostgreSQL 16 with PostGIS. `geography(Point,4326)` columns + GiST indexes for all location queries.

**Reason.** Marketplace correctness is fundamentally relational/transactional; PostGIS `ST_DWithin` with a spatial index is the industry-standard solution for radius queries at any realistic MVP scale; one database keeps operations simple; every managed-Postgres provider supports PostGIS.

**Consequences.** ORM support for geography types is limited → spatial queries use parameterized raw SQL behind repository methods; migrations enable the `postgis` extension; local dev uses the `postgis/postgis` Docker image.

---

## ADR-003: Modular monolith backend (NestJS) — ACCEPTED

**Problem.** ~20 domains (auth, jobs, matching, payments, …) must ship coherently with a small team, with transactional integrity across domains, while remaining extractable later.

**Options.** (a) Microservices from day one; (b) plain Express/Fastify monolith with ad-hoc structure; (c) NestJS modular monolith; (d) serverless functions.

**Decision.** Single NestJS application with strict module boundaries; two entrypoints (HTTP API and BullMQ worker) from one codebase. TypeScript end-to-end.

**Reason.** Microservices multiply operational cost and destroy cross-domain transactions exactly where the MVP needs them (accept job + create assignment + payment authorization). NestJS enforces module structure, DI, guards (centralized authz), and pipes (validation) out of the box — the discipline a modular monolith needs. Serverless complicates queues, sockets-later, and long-lived DB pools.

**Consequences.** One deployable + one worker deployable; modules communicate via services/domain events only (reviewed in PRs); future extraction of `matching`/`notifications`/`payments` remains possible; must guard against boundary erosion.

---

## ADR-004: Stripe Connect for marketplace payments — ACCEPTED

**Problem.** Customers pay the platform; workers get paid out; the platform takes a configurable fee; refunds/disputes/idempotency must be correct. Building payments/KYC in-house is out of the question.

**Options.** (a) Stripe Connect; (b) PayPal/Braintree marketplace; (c) Adyen for Platforms; (d) manual payouts (ACH exports).

**Decision.** Stripe Connect with **Express connected accounts** for workers. Charge pattern: **destination-style flow using separate charges and transfers** — charge the customer on the platform account when the job is filled/starts, then create a Transfer to the worker's connected account only after the customer confirms completion (or auto-confirm window elapses). Platform fee retained by taking `amount - fee` as the transfer amount. Manual-payout-schedule control evaluated during implementation against current Stripe docs.

**Reason.** Stripe Connect is the de-facto standard for two-sided labor marketplaces: hosted Express onboarding handles worker KYC and payout details; separate charges & transfers decouples "customer paid" from "worker gets paid", which matches our confirm-then-release model and multi-worker splits (one charge, N transfers).

**Consequences.** Workers must complete Stripe onboarding before accepting paid work; webhook processing must be verified, idempotent, persisted; the implementation phase MUST follow **current official Stripe documentation** (not memory — see rule in `docs/development/ROADMAP.md` Phase 10); jobs scheduled far in the future need a charge-timing policy (auth holds expire ~7 days) — flagged as an open question in `docs/business/PAYMENT_MODEL.md`.

---

## ADR-005: REST API versioned at /v1 — ACCEPTED

**Problem.** Mobile + admin clients need a stable, evolvable API contract.

**Options.** (a) REST; (b) GraphQL; (c) tRPC; (d) gRPC.

**Decision.** JSON REST under `/v1`, cursor pagination, standard error envelope, OpenAPI generated from code annotations.

**Reason.** REST is the simplest contract to secure (per-endpoint authz + rate limits), cache, monitor, and version for a small team; GraphQL's flexibility invites authorization mistakes (field-level leaks) that this product cannot afford; tRPC couples clients to server internals and complicates a future public API.

**Consequences.** Some over/under-fetching (acceptable; purpose-built endpoints for hot screens like worker home); breaking changes require `/v2` or additive evolution.

---

## ADR-006: Explicit job state machine with immutable events — ACCEPTED

**Problem.** Job lifecycle spans many states across two parties, multiple workers, payments, and disputes. Scattered booleans (`is_filled`, `is_paid`, …) inevitably produce inconsistent states.

**Options.** (a) status enum + centrally defined transition table; (b) booleans/timestamps interpreted ad hoc; (c) workflow engine (Temporal etc.).

**Decision.** Two coordinated state machines with explicit transition tables, defined once in `packages/shared` and enforced in the `jobs` module:

- **Job:** `DRAFT → POSTED → MATCHING → PARTIALLY_FILLED → FILLED → IN_PROGRESS → COMPLETION_PENDING → COMPLETED → PAYMENT_PENDING → PAID → CLOSED`, with `CANCELLED` and `DISPUTED` branches.
- **Assignment (`job_workers`):** `ACCEPTED → CONFIRMED → EN_ROUTE → ARRIVED → STARTED → COMPLETED`, with `CANCELLED_BY_WORKER / CANCELLED_BY_CUSTOMER / NO_SHOW / REMOVED` branches.

Per-worker execution states live on the assignment; the job state aggregates assignments. Every transition happens in a transaction and appends an immutable `job_events` row (actor, from, to, timestamp, metadata). Not every job uses every state.

**Reason.** Transition tables make illegal states unrepresentable, are directly unit-testable, and give disputes/support/analytics a trustworthy timeline for free. A workflow engine is unjustified operational weight for MVP.

**Consequences.** All lifecycle changes must go through the transition service (enforced by code review + no direct status updates elsewhere); the transition table is versioned; `job_events` is append-only (no UPDATE/DELETE for the app DB role).

---

## ADR-007: Self-managed authentication (JWT + rotating refresh tokens) — ACCEPTED

**Problem.** Both apps need authentication; workers/customers are consumers (email/password + phone verification); we must avoid making a paid third-party service a hard dependency for local development.

**Options.** (a) Auth0/Clerk/Firebase Auth; (b) Supabase Auth; (c) self-managed email/password + JWT in the API.

**Decision.** Self-managed in the `auth` module: argon2id password hashing, short-lived JWT access tokens (~15 min), rotating single-use refresh tokens (revocable, stored hashed), email + SMS verification through provider adapters (console adapter in dev), strict rate limiting on auth endpoints. Admin app adds TOTP 2FA.

**Reason.** Auth is core to the authorization model (roles/permissions/ownership) which we must own anyway; hosted providers add per-MAU cost, vendor coupling, and still leave authorization to us; the well-trodden argon2+JWT+rotation pattern is auditable and testable locally with zero external services.

**Consequences.** We own password-reset, token-rotation and revocation correctness (covered by dedicated tests, Phase 1); social login can be added later as an additional identity provider without changing the session model.

---

## ADR-008: pnpm monorepo — ACCEPTED

**Problem.** Backend, mobile, admin, and shared types must stay in lockstep (job states, roles, error codes) without publishing packages.

**Options.** (a) separate repos; (b) npm/yarn workspaces; (c) pnpm workspaces.

**Decision.** Single repo, pnpm workspaces: `apps/api`, `apps/mobile`, `apps/admin`, `packages/shared`.

**Reason.** Shared domain enums (`JobState`, `AssignmentState`, `Role`, error codes) in one package eliminate client/server drift; pnpm is fast and disk-efficient with strict dependency isolation; atomic cross-cutting PRs (schema + API + client) keep the system coherent per the "all layers or not done" rule.

**Consequences.** CI filters by affected workspace; contributors need pnpm (documented in LOCAL_SETUP).

---

## Open decisions (tracked, not yet ADRs)

| ID | Topic | Notes |
|---|---|---|
| OD-1 | Geocoding/maps provider | Google vs Mapbox vs OSM/Nominatim — cost + license review; adapter interface isolates the choice |
| OD-2 | Identity-verification provider | e.g. Stripe Identity vs Persona; framework built first, provider wired when selected |
| OD-3 | SMS provider | Twilio default candidate; adapter isolates it |
| OD-4 | Charge timing for far-future jobs | auth-hold expiry vs charge-at-start — see PAYMENT_MODEL open questions |
| OD-5 | Hosting target | Render/Fly/AWS — API is a standard containerizable Node app binding `0.0.0.0:$PORT`; decision needed before Phase 19 (pilot) |
| OD-6 | ORM/query layer detail | Migrations as SQL; data access via a typed query builder vs ORM — finalized at Phase 1 kickoff |
