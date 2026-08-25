# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); the project is pre-release (no versions yet — entries grouped by phase).

## [Unreleased]

### Prototype completion + hands-on review (2026-08-25)

**Added**
- Admin dashboard (`apps/admin`, Next.js 16): overview KPIs, restricted-work review queue, user suspend/restore, job investigation (assignments + payments + immutable timeline), dispute evidence review + resolution, safety reports, payment/payout ledgers, category management, live platform settings, audit-log viewer.
- Mobile web compatibility: localStorage token fallback (SecureStore is native-only), labeled pilot-city location fallback when GPS is unavailable, CORS allow-list on the API (`CORS_ORIGINS`).
- Demo seeds: fully verified dev accounts (email + phone) and 4 open demo jobs around Austin.
- Review screenshots saved as artifacts.

**Fixed (found in hands-on browser review of the full stack)**
- Timezone validation rejected non-slashed IANA zones like `UTC`, blocking job posting from browsers in UTC — regex relaxed (jobs + availability DTOs).
- Partially-staffed jobs that started work were never charged (charge only fired at FILLED) — charging now also triggers when work starts, for the number of actually committed workers; regression test added (55 total).
- Mobile validation errors now surface the failing field instead of a generic message.
- Honest empty states for the admin audit log and job payments panel.

**Review outcome**
- Full golden loop verified in the browser end-to-end: worker discovers → accepts (address revealed post-acceptance) → en-route → arrived → start → complete → message → customer confirms → rates 5★; customer posts new job → matching fan-out notifies the nearby worker in Activity; admin oversees via KPIs, timeline, users, categories, settings.

### Mobile app — core screens (2026-08-25)

**Added**
- Expo app generated with the official scaffolder (SDK 57, React Native 0.86, expo-router 57 — real current versions, not guessed).
- Secure auth: expo-secure-store token storage, automatic refresh-token rotation, welcome/register (role choice)/login screens.
- Role-aware navigation with dual-role mode switch: worker tabs (Home with availability toggle + GPS nearby jobs + today's earnings, Jobs, Messages, Activity, Profile) and customer tabs (Home with post CTA + active jobs, My Jobs, Messages, Activity, Profile).
- Post-a-job guided form (API categories, ASAP/scheduled, flat/hourly, device-location pin with labeled Coming Soon for map-pin placement).
- Role-aware job detail: accept, en-route/arrived/start/complete, confirm completion, report a problem, cancel, 1–5★ ratings; job-scoped chat; notification center.
- Honest-gap README: not yet device-tested; maps, photos, Stripe UI, push delivery pending.

### Phases 10, 12–15 (+16 foundations) — Payments, cancellations, disputes, notifications, admin (2026-08-25)

**Added**
- Schema: `payment_customers`, `payout_accounts` (Connect Express status mirror), `payments` (full customer-side ledger with fee snapshots + fee-config references, unique PaymentIntent/idempotency keys), `payouts` (unique per assignment+kind — double payouts structurally impossible), append-only `stripe_events` webhook inbox, `disputes` + `dispute_evidence`, `reports`, `notifications` + `notification_preferences` + `device_tokens`.
- Stripe gateway abstraction (ADR-004): real SDK implementation (Express accounts, hosted onboarding links, off-session PaymentIntents, refunds, transfers, signature-verified webhooks) behind an interface; deterministic fake for automated tests only. Gateway idempotency keys derive from ledger row ids.
- Payments module: SetupIntent card flow with ownership verification; charge-at-fill (P-1 default) with honest FAILED states + customer retry endpoint; confirm-triggered per-assignment transfers (net of configurable fee); refunds + worker callout compensation per cancellation policy; fixed-amount dispute refunds; insert-then-process idempotent webhooks; earnings summary that never conflates pending/in-transit/paid; payouts blocked without a successful charge (no fake payouts) and while disputed.
- Cancellation policy engine (Phase 12): centralized, settings-driven consequences (free window, late-fee bps, en-route callout compensation, safety cancellations penalty-free), consequence preview endpoint, outcomes recorded in job events and executed by payments.
- Disputes module (Phase 13): party-scoped dispute opening moves jobs to DISPUTED (pausing payouts), text evidence + auto-attached description, admin evidence view (timeline + payments + messages), audited resolutions (RELEASE / REFUND_FULL / REFUND_PARTIAL / OTHER) that execute money and close the job.
- Notifications module (Phase 14): in-app notification records with preference checks (marketing opt-out honored; transactional always recorded), unread counts, device-token registration; domain-event listeners cover acceptance, lifecycle, cancellations, messages, payments, payouts, disputes. Push delivery is a labeled dev adapter until the mobile app lands.
- Reports module (Phase 16 foundations): safety/behavior/fraud reports, automatic report on safety cancellations, admin review with audit.
- Admin module (Phase 15): live KPI overview (supply/demand, jobs, GMV/revenue/refunds, disputes/reports, 30-day fill rate + time-to-fill), user search/detail/suspend/restore (audited, sessions revoked), job investigation (timeline + payments), payment/payout viewers, audit-log viewer.
- In-process domain event bus (post-commit) wiring jobs → payments/notifications/reports; listeners are idempotent so a later move to queue transport is a transport change only.
- 10 new integration tests: golden money flow with exact fee math, double-release protection, charge failure + retry, policy refunds (75/25 split), dispute pause + admin release + audit, webhook signature + duplicate no-op, missing-payout-account recovery, admin metrics, suspension with immediate session death, foreign payment-method rejection.

### Phases 9 & 11 — Messaging and ratings (2026-08-25)

**Added**
- Schema: `conversations` (unique per job + worker), `messages` (sequenced, report/hide flags, never hard-deleted), `user_blocks`, `ratings` (per-assignment, unique per direction, double-blind `visible_at`).
- Messaging module: job-scoped conversations opened at/after acceptance, text messages with keyset pagination, unread counts + read receipts, message reporting (audited), block/unblock; conversations become read-only 14 days after terminal job states; blocked pairs cannot message, match, or accept each other's jobs (wired into matching + acceptance).
- Ratings module: two-sided per-assignment ratings (overall + optional dimensions), double-blind visibility (mutual submit or configurable window), profile aggregates recomputed over visible ratings only, pending-ratings prompts, duplicate/outsider protection.
- 6 new integration tests: conversation participation + IDOR, read receipts, reporting, block enforcement, rating gating (pre-completion, duplicates, outsiders), double-blind visibility + aggregate math.

### Phases 5–8 — Job creation, discovery, matching, lifecycle (2026-08-25)

**Added**
- Schema: `jobs` (exact + deterministic ~150–350 m obfuscated `approx_location`, PostGIS GiST + partial open-state indexes, reserved recurrence columns, overfill CHECK), `job_workers` (per-worker assignments, unique job+worker), `job_events` (append-only with monotonic sequence), `job_changes` + `job_change_approvals`.
- Job state machine service: single code path for all job/assignment transitions, validated against the shared transition tables, every transition event-logged (ADR-006).
- Jobs module: guided creation with category/duration/start-time validation, restricted-term screening (BLOCK → rejected; REVIEW → admin queue), drafts + post, duplicate ("Post Again"), customer cancel (assignments cancelled, acknowledgment required), viewer-dependent responses (owner/assigned worker/public shapes; exact address + access instructions only post-acceptance).
- Discovery: PostGIS `ST_DWithin` nearby search with category/pay/time filters and distance-ordered keyset pagination; map pins (approx only, capped); deterministic pricing suggestion (IQR of completed local jobs, honest null under 5 samples).
- Matching engine: documented deterministic candidate query (availability, radius, category, min-pay, verification requirements, account standing) ranked by distance with new-worker fairness tiebreak; protected characteristics never inputs.
- Acceptance: transactional row-locked slot claim; multi-worker partial/full fill transitions; idempotent retries; per-category verification enforcement at accept time; self-accept blocked.
- Execution lifecycle: en-route → arrived (GPS as evidence) → start → complete per assignment; job aggregates to IN_PROGRESS/COMPLETION_PENDING; customer confirm; earnings computed centrally (flat / hourly×estimate).
- Scope protection: change proposals with per-worker approvals; unanimous approval applies the diff; full history preserved; declined proposals leave the job untouched.
- Worker cancellation: slot reopens (FILLED/PARTIALLY_FILLED → MATCHING), reliability counter, no re-accept after leaving.
- Admin: restricted-job review queue with approve/reject.
- 15 new integration tests: screening/review flow, draft visibility, location privacy (approx-only + distance bound), radius filtering, matching eligibility/order, verification gating, multi-worker fill, concurrent last-slot race (exactly one winner), full lifecycle with timeline assertion, illegal transitions, assignment IDOR, cancellations both sides, scope changes, duplicate.

### Phases 2–4 — Customer onboarding, worker onboarding, skills/categories/availability (2026-08-25)

**Added**
- Schema: `customer_profiles`, `worker_profiles` (private PostGIS home base + GiST index, availability toggle, reserved `available_until`), `saved_addresses` (geocoded, soft-delete), `agreement_acceptances` (versioned terms records), `skills`, `categories` (default-disabled with per-category verification requirements), `worker_skills`, `worker_categories`, `worker_availability` (weekly windows with timezone), `platform_settings`, `restricted_terms` (BLOCK/REVIEW screening patterns), `platform_fees` (bps + fixed, per-category, effective windows).
- Customers module: profile upsert, saved-address CRUD with ownership enforced in SQL.
- Workers module: full profile (bio, transportation, equipment, languages, service radius, min pay), skills/categories selection (enabled-only validation), availability windows + available-now toggle, agreement acceptance records.
- Catalog module: public `GET /v1/categories` + `/v1/skills` (enabled/active only); admin category/skill management (audited).
- Settings module: configurable platform settings service with code defaults (auto-confirm window, cancellation policy, matching batches, rating blind window, discovery limits) + audited admin endpoints.
- `GET /v1/users/:id/public`: minimal public card (shortened name, ratings, real verification badges — never email/phone/location).
- `GET /v1/me/onboarding`: honest progressive-onboarding status (payout_ready is false until payments exist — never faked).
- Idempotent dev seeds: 10 categories, 10 skills, 11 restricted-term patterns, default 15% fee config, documented `@example.test` accounts; refuses to run in production.
- 10 new integration tests: catalog visibility, admin authorization, profile permission separation (worker cannot write customer profile), saved-address IDOR, home-location leak checks, disabled-category rejection, availability validation, onboarding truthfulness, settings audit trail.

### Phase 1 — Authentication + users (2026-08-25)

**Added**
- PostgreSQL migrations infrastructure: minimal forward-only SQL migrator (`pnpm --filter @gig/api migrate`), `schema_migrations` tracking, extensions (postgis, citext, pgcrypto).
- Schema: `users` (dual-role support), `refresh_tokens`, `one_time_tokens`, `verification_records` (single-PASSED-per-type constraint), append-only `audit_logs`.
- Auth module: argon2id registration/login, short-lived HS256 JWT access tokens, rotating single-use refresh tokens with family revocation on reuse detection, email verification, E.164 phone verification via 6-digit codes (attempt-limited), enumeration-resistant password reset that revokes all sessions.
- Users module: `GET /v1/me` (allow-listed DTO), `POST /v1/me/roles` (add CUSTOMER/WORKER; ADMIN never self-assignable), `DELETE /v1/me` (deletion request with login-reactivation grace).
- Authorization core: global JWT guard (fresh DB user load — suspensions take effect immediately), central permission service + `@RequirePermissions`, standard error envelope with stable codes, global validation pipe (whitelist + 422 envelope), strict per-route throttling on credential endpoints.
- Dev provider adapters (clearly labeled console email/SMS senders); readiness check now verifies database connectivity.
- Test infrastructure: Jest + supertest against real PostgreSQL (dedicated `gig_test` db, full reset per run); 12 integration tests covering registration, duplicate/validation errors, email/phone verification, login timing-safe enumeration resistance, refresh rotation + reuse-detection family revocation, password reset session revocation, dual roles, deletion flow.

**Fixed during testing**
- Refresh-token family revocation on reuse was rolled back with the failing transaction — moved outside the transaction so the security revocation persists.
- Registered pg type parsers for enum arrays (`user_role[]` returned as raw string).

**Decisions**
- ADR-009: node-postgres + hand-written SQL migrations (no ORM); resolves OD-6.

### Phase 0 — Repository + architecture (2026-08-25)

**Added**
- Full documentation set: PRD, MVP scope, user flows; system architecture + ADRs 001–008; database schema design; API specification; security model; trust & safety policy; payment model; legal & compliance register; roadmap; local setup guide.
- Monorepo scaffold (pnpm workspaces): `apps/api` (NestJS skeleton with health endpoints and module directory structure), `apps/mobile` (Expo placeholder), `apps/admin` (Next.js placeholder), `packages/shared` (domain enums/types: roles, job states, assignment states, error codes).
- `docker-compose.yml` for local PostgreSQL+PostGIS, Redis, MinIO.
- `.env.example` documenting all environment variables (no secrets committed).
- GitHub Actions CI: typecheck + lint + test + build.

**Notes**
- No product features implemented. Scaffold apps are clearly labeled placeholders — no fake functionality.
- Key decisions: React Native/Expo (ADR-001), PostgreSQL+PostGIS (ADR-002), NestJS modular monolith (ADR-003), Stripe Connect (ADR-004), REST /v1 (ADR-005), explicit job state machine (ADR-006), self-managed auth (ADR-007), pnpm monorepo (ADR-008).
