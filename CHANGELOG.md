# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); the project is pre-release (no versions yet — entries grouped by phase).

## [Unreleased]

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
