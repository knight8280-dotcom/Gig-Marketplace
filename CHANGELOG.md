# Changelog

All notable changes to this project are documented here. Format loosely follows [Keep a Changelog](https://keepachangelog.com/); the project is pre-release (no versions yet — entries grouped by phase).

## [Unreleased]

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
