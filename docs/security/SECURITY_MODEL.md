# Security Model — Local Gig Marketplace

> **Status:** Draft v0.1 — Phase 0. Security requirements and design. These are build requirements for every phase, not aspirations.

## Threat model summary

Assets: user PII, worker home locations, payment flows/ledger, job history, credentials, admin powers.
Primary adversaries: direct API attackers (never assume "the mobile app won't call this"), account-takeover attempts, fraudulent customers/workers (payment abuse, fake completions), malicious insiders (mitigated by audit + least privilege), scraping/enumeration.

## Authentication

- Passwords: argon2id (tuned params documented in code), minimum length + breach-list check; no composition theater.
- Sessions: JWT access tokens ~15 min; rotating **single-use** refresh tokens stored hashed with family tracking — reuse of a rotated token revokes the whole family (stolen-token detection).
- Email + phone verification required before posting/accepting (configurable).
- Password reset: single-use expiring tokens; constant responses (no user enumeration); resets revoke all sessions.
- Admin app: password + mandatory TOTP 2FA; separate shorter session TTL; IP/audit logging on every login.
- All tokens transported over HTTPS only; nothing sensitive in URLs.

## Authorization (centralized — the core rule)

- A single **permission service** + NestJS guards; controllers never embed permission logic.
- Model: role → permissions (e.g. `job:create`, `job:accept`, `dispute:resolve`, `admin:settings:write`) + **ownership/participation checks** resolved against the database in services (never trusting client-provided ids alone).
- Canonical rules: customers modify only their own jobs; workers modify only their own profile/assignments; nobody but the payments module writes payment records; only admins resolve disputes; participants only for conversations.
- New roles (SUPPORT_AGENT, MODERATOR, …) = new permission sets — no code rewrites.
- **Authentication ≠ authorization**: every authenticated endpoint still checks permission + ownership. IDOR tests are mandatory per resource (Phase 18 checklist, but written alongside each phase).

## Input validation

- Every request body/query/param validated by schema (class-validator/zod) before reaching services; unknown fields rejected.
- IDs are UUIDs (non-enumerable). Parameterized queries only — no string-built SQL (spatial raw SQL uses bound parameters).
- Output encoding on admin web (React defaults + no `dangerouslySetInnerHTML`); API returns JSON only with correct content types.

## Data protection

- Allow-listed response DTOs; DB column existence never implies API exposure.
- Worker `home_location`, exact job addresses (pre-acceptance), payout details, verification documents: never in any non-owner response.
- Secrets only via environment variables; `.env` gitignored; `.env.example` documents names only. No secrets in logs, errors, or client bundles.
- PII minimization + retention rules in DATABASE_SCHEMA §privacy; account deletion anonymizes PII while preserving financial/audit records.
- Encryption in transit everywhere (TLS); at rest via managed Postgres/storage encryption.

## Payment security

- Card data never touches our servers (Stripe elements/SDK + SetupIntents).
- Backend is sole authority on payment state; webhook signatures verified; events persisted then processed idempotently (`stripe_events` unique id).
- Idempotency keys on every Stripe call, derived from ledger record ids; DB unique constraints (`stripe_payment_intent_id`, `payouts.assignment_id`) make duplicate charges/payouts structurally impossible.
- No client-asserted amounts: prices/fees computed server-side from the job record and fee configuration.

## File upload security

- Signed-URL direct-to-storage uploads; API never proxies large bodies.
- Validation: size limits per kind, content-type allow-list, magic-byte verification at completion, sha256 recorded, malware scanning hook (queued).
- Extensions are never trusted. Stored under random keys in private buckets; reads via short-lived signed URLs gated by the referencing entity's access rules.

## Rate limiting & abuse

- Redis-backed limits per class (see API_SPECIFICATION table): strictest on auth/verification codes; job creation, messaging, uploads bounded; discovery reads generous but bounded.
- Progressive lockout on repeated auth failures per account+IP.
- Fraud/risk framework (see TRUST_AND_SAFETY) produces `risk_flags` for admin review — no automated bans on weak signals.

## Audit & immutability

- `audit_logs` + `admin_actions`: who/what/when/entity/before/after/reason for security- and finance-relevant actions.
- Append-only enforcement at the DB level: app role lacks UPDATE/DELETE on `job_events`, `audit_logs`, `admin_actions`, `stripe_events`, `analytics_events`.
- Structured request logs with request ids; **never** log credentials, tokens, card data, or unnecessary PII.

## Infrastructure

- Least-privilege DB roles (app / worker / migration / read-only-analytics).
- Health endpoints expose no internals; stack traces never returned to clients.
- Dependencies: lockfiles + automated vulnerability scanning in CI; upgrades reviewed.
- CORS: admin origin allow-list; mobile uses native clients (no wildcard CORS on credentials).
- Server binds `0.0.0.0:$PORT`; no state on local disk (ephemeral filesystem — object storage for files).

## Security testing requirements (built per phase, gated at Phase 18)

- Broken access control / IDOR suites per resource (customer A vs customer B, worker vs customer, user vs admin).
- Authn bypass attempts (expired/forged/none tokens), refresh-token reuse detection test.
- Unauthorized job modification, unauthorized payment access.
- File upload abuse (oversize, spoofed content type, non-image magic bytes).
- Rate-limit bypass checks; injection attempts on search/filter params; XSS on admin-rendered content; sensitive-data-exposure snapshot tests on all DTOs.
