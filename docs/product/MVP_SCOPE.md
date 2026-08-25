# MVP Scope — Local Gig Marketplace

> **Status:** Draft v0.1 — Phase 0. Defines what is in and out of the first shippable product.

## MVP success definition

The MVP is successful when this complete real workflow works end-to-end with real (test-mode) payments:

**Customer:** create account → create job → add description → set location → set date/time → set pay → post job → worker accepts → message worker → worker arrives → worker starts → worker completes → customer confirms → payment processes → customer rates worker.

**Worker:** create account → complete profile → add skills → configure availability → discover nearby job → accept job → message customer → navigate to job → start job → complete job → receive payout → rate customer.

This workflow is more important than any secondary feature.

## In scope (MVP)

### Accounts & auth
- Email/password registration, login, refresh-token rotation, logout
- Email verification; phone verification (SMS provider, dev console adapter)
- One user record, dual roles: customer profile and/or worker profile
- Account deletion request path

### Customer
- Progressive onboarding (can post first job with minimal profile)
- Guided job creation (title, description, category, location, date/time or ASAP, duration, workers needed, flat/hourly pay, photos)
- Job drafts; "Post Again" duplication from a completed job
- Saved addresses
- Active/past job views, job timeline
- Confirm completion / report a problem
- Payment method management (Stripe), receipts, payment history
- Rate worker(s)

### Worker
- Full onboarding: profile, skills, categories, service radius, availability, transportation, equipment, payout setup (Stripe Connect Express), terms, safety info
- "Available for Work" toggle + match preferences (distance, categories, min pay)
- Nearby job discovery: list + map (obfuscated pre-acceptance locations), filters, structured search
- Accept job (server-authoritative, concurrency-safe, idempotent)
- Job execution flow: en-route → I'm here → start → complete
- Earnings dashboard (pending vs available vs paid — never conflated)
- Rate customer

### Marketplace core
- Configurable job categories with per-category verification requirements
- Restricted-work screening (keyword flag → admin review queue)
- Deterministic matching engine (distance, availability, category, skills, radius, min pay, eligibility)
- Multi-worker jobs with per-worker assignments (accept/arrive/start/complete per worker)
- Explicit job state machine + immutable job event timeline
- Job scope-change proposals (customer proposes, workers approve)
- Centralized, configurable cancellation policy engine
- Formal disputes with evidence and admin resolution
- Two-sided ratings with double-blind window

### Payments
- Stripe Connect (Express) worker onboarding
- Card payment: authorize/charge at fill, platform fee, transfer to worker on confirmed completion
- Configurable platform fee (percentage + fixed; per-category override)
- Refunds on cancellation per policy
- Verified, idempotent, persisted webhook processing
- Full payment/payout ledger records

### Messaging & notifications
- Job-scoped conversations (text + images), read status, reporting/blocking
- Push notifications (Expo), email; per-user notification preferences
- Full transactional notification catalog (accepted, en-route, arrived, completed, payment, cancellation, dispute)

### Admin
- Overview metrics (active users/jobs, completed jobs, GMV, revenue, disputes, reports, cancellations)
- User search/view/suspend/restore
- Job search/view/investigate (timeline + events)
- Payment state viewer
- Dispute review & resolution
- Report review (safety/fraud)
- Category management
- Platform settings (fees, limits, cancellation policy, verification requirements)
- Admin action audit log

### Platform
- PostgreSQL + PostGIS, migrations, seeds
- Redis + BullMQ background jobs (notifications, matching fan-out, webhook processing, reminders)
- Object storage for photos (S3-compatible; MinIO locally)
- Rate limiting, structured logs, error tracking hooks, health checks
- CI: typecheck, lint, unit + integration tests, build
- Seed data + documented test accounts (clearly fake)

## Explicitly OUT of MVP

Per product direction, do **not** build unless explicitly approved:

- Complex bidding / proposals
- Social feeds
- Enterprise/B2B workforce management (multi-employee businesses, approval workflows, invoices, worker pools)
- International payments / multiple currencies (single country, single currency at launch)
- Advanced AI matching, AI pricing, AI job parsing (deterministic MVP versions only)
- Subscriptions (customer or worker), priority jobs, premium listings
- Cryptocurrency
- Recurring jobs (schema reserved, feature deferred)
- Full insurance marketplace
- Nationwide launch infrastructure
- Microservice architecture
- Tips (designed-for: UI hooks + ledger fields reserved, feature deferred — cheap to enable in a fast-follow)
- Favorite workers / invitations (schema reserved)
- Background-check provider integration (verification framework supports it; provider wiring deferred; categories requiring it stay disabled until wired)
- Surge pricing, bonuses
- Translation / multi-language UI
- Safety check-in feature (deferred; documented in TRUST_AND_SAFETY)

## Deferred-but-designed-for register

These have explicit schema/interface reservations so adding them is additive, not a rewrite:

| Feature | Reservation |
|---|---|
| Recurring jobs | `jobs.recurrence_rule`, `jobs.parent_job_id` |
| Tips | `payments.kind = 'TIP'` ledger kind; completion-screen hook |
| Favorites | `favorites` table in schema doc |
| Business accounts | `organizations` extension point; role enum extensible |
| Available-until | `worker_availability.available_until` |
| Alternative acceptance models | `job_workers.source` discriminator |
| Surge/bonus pricing | centralized pricing service interface |
| New roles | permission-based authz (no role checks scattered in code) |

## MVP quality bar (non-negotiable)

- No fake functionality: unimplemented UI is labeled TODO/Coming Soon; no fake payment success, fake verification, fake payouts.
- Backend authoritative for job state, payments, matching, authorization.
- No duplicate financial transactions (idempotency keys + unique constraints).
- No inconsistent job states (state machine + transactions).
- No floating-point money.
- Immutable audit/event history for jobs, payments, admin actions.
- Tests for: state machine, concurrent acceptance, payment idempotency, webhook replay, authorization (IDOR), cancellation policy.
