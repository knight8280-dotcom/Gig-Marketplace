# Development Roadmap — Local Gig Marketplace

> **Status:** Phase 0 in progress. Phases build in dependency order; a phase is "done" only when **all affected layers** are updated (database, API, backend, mobile, admin, tests, documentation) — no frontend-only "features".

## Phase definition of done (applies to every phase)

- Migrations + schema doc updated
- API endpoints implemented with authn/authz/validation/rate limits + API spec updated
- Mobile and/or admin UI (with honest empty/error states; unbuilt pieces labeled, never faked)
- Unit + integration tests, including authorization (IDOR) tests for new resources
- Seed data updated where relevant
- CHANGELOG entry; DECISIONS.md entry if a major decision was made/changed

## PHASE 0 — Repository + architecture ✅ (this pass)

Repo inspection, full documentation set, monorepo scaffold (api/mobile/admin/shared), docker-compose for local deps, CI skeleton. **No product features.**

## PHASE 1 — Authentication + users

Users table, argon2id, register/login/refresh-rotation/logout, email verification, phone verification (console adapter in dev), password reset, sessions revocation, rate limiting, `/me`. Tests: token rotation + reuse detection, enumeration resistance, brute-force limits.

## PHASE 2 — Customer onboarding

Customer profiles, saved addresses, progressive-onboarding gating, public-card DTO. Mobile customer profile screens.

## PHASE 3 — Worker onboarding

Worker profiles, onboarding step machine, service radius + home location (private), transportation/equipment/languages, terms-acceptance records, verification framework (records + adapters; identity provider selection = OD-2). Mobile worker onboarding flow.

## PHASE 4 — Skills / categories / availability

Skill + category catalogs, category requirements, restricted_terms screening config, platform_settings service, availability windows + Available-for-Work toggle + match preferences. Admin: category management (first admin surface) + settings.

## PHASE 5 — Job creation

Jobs table + state machine core (DRAFT/POSTED + validation), guided creation API, geocoding adapter, approx_location computation, photos via signed-URL file flow, drafts, duplicate ("Post Again"), restricted-work review queue. Deterministic pricing suggestion. Mobile: full post-a-job flow. Admin: review queue.

## PHASE 6 — Job discovery + geolocation

PostGIS discovery queries + indexes, list/map endpoints (approx locations), filters + structured search, cursor pagination, worker home screen with nearby jobs + empty states.

## PHASE 7 — Matching + acceptance

Matching pipeline (candidate query → eligibility → ranking interface → batched fan-out via queue), concurrency-safe transactional accept, multi-worker slot handling, idempotent accept. Tests: concurrent-acceptance race (two workers, last slot), eligibility blocks, idempotent retries.

## PHASE 8 — Job lifecycle

Full state machines (job + assignment), en-route/arrived/started/completed transitions, arrival location evidence, completion confirm + 72h auto-confirm job, scope-change proposals + approvals, job timeline API + UI. Tests: full transition-table coverage incl. illegal transitions.

## PHASE 9 — Messaging

Job-scoped conversations, text+image messages, read status, reporting/blocking, pagination. Mobile messages tab.

## PHASE 10 — Payments + payouts ⚠️ read current Stripe docs first

**Rule: implement against current official Stripe Connect documentation — do not code from memory.** Stripe customers + SetupIntent card flow, Connect Express onboarding, charge-at-fill PaymentIntents, fee pricing service (configurable), confirm-triggered transfers per assignment, refunds per cancellation policy, verified idempotent persisted webhooks, reconciliation job, earnings dashboard (pending/available/paid), receipts. Tests: idempotency (double webhook, double transfer attempt), fee math, failure paths (charge fail, transfer fail), ledger integrity.

## PHASE 11 — Ratings

Two-sided per-assignment ratings, double-blind visibility, aggregates + minimum-count display rule, profile surfaces.

## PHASE 12 — Cancellations

Central policy engine on platform_settings, all scenarios (see TRUST_AND_SAFETY table), consequence preview API, refund/compensation execution via payments module, reliability metrics. Tests: every scenario row.

## PHASE 13 — Disputes

Dispute records + evidence, payment-release pause, intake flows both sides, admin resolution UI + audited actions.

## PHASE 14 — Notifications

Notification records + preference checks, Expo push + email adapters (SMS transactional), full catalog wiring from domain events (outbox), notification center in app.

## PHASE 15 — Admin dashboard

Next.js app: overview KPIs, users (search/suspend/restore), jobs (investigate), payments viewer, disputes, reports, risk flags, categories, settings, audit-log viewer. TOTP 2FA.

## PHASE 16 — Trust / safety / fraud

Risk-signal collectors → risk_flags + admin queue, blocking effects on matching, report SLAs, safety-cancellation path polish, content-hiding moderation.

## PHASE 17 — Analytics

Outbox → analytics_events pipeline, KPI queries (supply/demand/liquidity/economics/retention/trust), admin KPI dashboards.

## PHASE 18 — Testing / hardening

Full security suite (IDOR matrix, upload abuse, rate-limit bypass, injection/XSS), failure-scenario suite (payment/payout failure, no-show, duplicate webhook/acceptance, connectivity loss, job-unavailable-while-viewing), E2E of the golden flow, load tests on discovery/accept/webhooks, accessibility audit.

## PHASE 19 — Pilot deployment

Hosting decision (OD-5) executed; staging + production environments; secrets management; monitoring/alerts; backups + restore drill; **legal gate from LEGAL_COMPLIANCE.md must be cleared**; pilot-market seed configuration.

## PHASE 20 — Marketplace optimization

Liquidity tuning (matching batches, radius suggestions), funnel analysis, retention features from the deferred register (Post Again polish, tips fast-follow, favorites) as data justifies.

## Standing engineering rules (from product direction)

1. **No fake functionality** — unimplemented UI labeled TODO/Coming Soon; no fake payments/verification/payouts. Mocks only in tests/dev, clearly separated.
2. **Do not guess external APIs** — check current official docs for Stripe, Expo, React Native, PostgreSQL/PostGIS, maps, push.
3. **Keep the system coherent** — DB + API + backend + mobile + admin + tests + docs move together.
4. **Docs are source of truth** — decision changes update docs → architecture → code → tests → CHANGELOG, in that order.
5. **Priority order** — safety > security > core transaction > payment correctness > reliability > UX > liquidity > performance > analytics > nice-to-haves.
