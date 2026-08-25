# API Specification — Local Gig Marketplace

> **Status:** Draft v0.1 — Phase 0 design. Contract for the MVP REST API. OpenAPI will be generated from code annotations once implementation begins; this document defines the shape and rules. Endpoints ship phase by phase (see ROADMAP) — nothing below is implemented yet.

## Conventions

- Base path: `/v1`. JSON request/response. UTF-8.
- **Auth:** `Authorization: Bearer <access JWT>` (~15 min TTL). Refresh via `/v1/auth/refresh` with rotating single-use refresh tokens.
- **Idempotency:** mutation endpoints marked ⟲ accept an `Idempotency-Key` header; replays return the original response.
- **Pagination:** cursor-based on all lists — `?cursor=<opaque>&limit=<1..100>`; responses include `{ "items": [...], "next_cursor": "..." | null }`.
- **Money:** `{ "amount_cents": 7550, "currency": "USD" }` — integers only.
- **Times:** ISO 8601 UTC (`2026-08-25T14:00:00Z`); job objects also carry the job-site IANA `timezone`.
- **Errors:**

```json
{ "error": { "code": "JOB_ALREADY_FILLED", "message": "This job has been filled.", "details": {} } }
```

HTTP status + stable machine-readable `code` (catalog in `packages/shared`). Validation errors: `422` with per-field details. Rate limits: `429` + `Retry-After`.

- **Security invariants:** every endpoint declares authn requirement, permission, ownership rule, validation schema, and rate-limit class (see SECURITY_MODEL). Responses are allow-listed DTOs.

## Auth — `/v1/auth`

| Method | Path | Notes |
|---|---|---|
| POST | `/auth/register` | email, password, role intent → user + verification email. Rate-limited hard |
| POST | `/auth/login` | → access + refresh tokens |
| POST | `/auth/refresh` | rotates refresh token; reuse detection revokes family |
| POST | `/auth/logout` | revokes refresh token |
| POST | `/auth/verify-email` | token from email |
| POST | `/auth/phone/request` ⟲ | sends SMS code |
| POST | `/auth/phone/confirm` | code → phone verified |
| POST | `/auth/password/forgot` | always 200 (no user enumeration) |
| POST | `/auth/password/reset` | token + new password; revokes all sessions |

## Users & profiles

| Method | Path | Notes |
|---|---|---|
| GET | `/me` | account, roles, verification status, onboarding state |
| PATCH | `/me` | limited account fields |
| DELETE | `/me` | deletion request (grace period) |
| GET/PUT | `/me/customer-profile` | create/update customer profile |
| GET/PUT | `/me/worker-profile` | create/update worker profile (radius, transport, equipment, bio…) |
| GET/POST | `/me/addresses`; PATCH/DELETE `/me/addresses/:id` | saved addresses (owner-only) |
| PUT | `/me/worker-profile/skills` | replace skill set |
| GET/PUT | `/me/availability` | weekly windows + `available_now` toggle + match preferences |
| GET/PUT | `/me/notification-preferences` | per channel × category |
| POST | `/me/device-tokens` | register push token |
| GET | `/users/:id/public` | **public card only**: first name + last initial, photo, rating, jobs completed, member since, verification badges. Never email/phone/address/location |

## Catalog

| Method | Path | Notes |
|---|---|---|
| GET | `/categories` | enabled categories + their requirements (so clients can explain accept-blockers) |
| GET | `/skills` | skill catalog |
| GET | `/pricing/suggestion?category_id&duration_minutes&workers&lat&lng` | deterministic suggestion band |

## Jobs (customer) — `/v1/jobs`

| Method | Path | Notes |
|---|---|---|
| POST | `/jobs` ⟲ | create draft or post directly; server geocodes + computes `approx_location`; restricted-term screen may set `PENDING_REVIEW` |
| GET | `/jobs/mine?state=` | customer's jobs, cursor-paginated |
| GET | `/jobs/:id` | owner, assigned workers, or admin. **Response shape varies by viewer**: pre-acceptance workers get approx location only, no access instructions |
| PATCH | `/jobs/:id` | drafts only; posted jobs change via change proposals |
| POST | `/jobs/:id/post` ⟲ | DRAFT → POSTED (validates payment method on file) |
| POST | `/jobs/:id/cancel` ⟲ | policy engine computes consequences; body includes `acknowledged_consequences: true` |
| POST | `/jobs/:id/duplicate` | "Post Again" → new draft copied from job |
| POST | `/jobs/:id/photos` | upload intent → signed URL flow (see Files) |
| GET | `/jobs/:id/timeline` | job_events, viewer-filtered |
| POST | `/jobs/:id/changes` ⟲ | propose scope change (diff payload) |
| GET | `/jobs/:id/changes` | change history |
| POST | `/job-changes/:id/approve` / `/decline` ⟲ | assigned worker decision |
| POST | `/jobs/:id/confirm-completion` ⟲ | customer confirms → triggers payment release |
| POST | `/jobs/:id/report-problem` | opens dispute intake |

## Discovery & assignments (worker)

| Method | Path | Notes |
|---|---|---|
| GET | `/discovery/jobs?lat&lng&radius_m&category_id&min_pay_cents&start_after&start_before&max_duration&workers_needed&sort` | nearby open jobs; PostGIS-backed; returns card fields + `approx_location` + distance; cursor-paginated |
| GET | `/discovery/jobs/map?bbox=` | map pins (approx locations only) |
| GET | `/discovery/recommended` | ranked for this worker (deterministic MVP ranking) |
| POST | `/jobs/:id/accept` ⟲ | transactional slot claim; 409 `JOB_ALREADY_FILLED` / 403 `REQUIREMENTS_NOT_MET` (with which requirement) |
| GET | `/assignments/mine?state=` | worker's assignments |
| GET | `/assignments/:id` | includes full job location + access instructions post-acceptance |
| POST | `/assignments/:id/cancel` ⟲ | policy engine; `reason` incl. `SAFETY` |
| POST | `/assignments/:id/en-route` ⟲ | → EN_ROUTE |
| POST | `/assignments/:id/arrived` ⟲ | body may include coords (evidence) → ARRIVED |
| POST | `/assignments/:id/start` ⟲ | → STARTED |
| POST | `/assignments/:id/complete` ⟲ | → COMPLETED → job COMPLETION_PENDING |

## Messaging

| Method | Path | Notes |
|---|---|---|
| GET | `/conversations` | user's conversations (job-scoped) |
| GET | `/conversations/:id/messages` | cursor-paginated |
| POST | `/conversations/:id/messages` ⟲ | text and/or image file_id; participants only |
| POST | `/conversations/:id/read` | read receipts |
| POST | `/messages/:id/report` | report content |
| POST | `/users/:id/block` | block within marketplace interactions |

## Payments & earnings

| Method | Path | Notes |
|---|---|---|
| GET | `/me/payment-methods` / POST setup-intent flow | Stripe SetupIntent; card data never touches our servers |
| GET | `/me/payments` | customer payment history + receipts |
| GET | `/me/earnings` | worker: today/week/month, pending vs available vs paid (never conflated) |
| GET | `/me/payouts` | payout history |
| POST | `/me/payout-account/onboarding-link` | Stripe Connect Express hosted onboarding link |
| GET | `/me/payout-account` | onboarding/payout status (mirrored from webhooks) |
| POST | `/webhooks/stripe` | **unauthenticated route, signature-verified**, insert-then-enqueue, idempotent by event id |

Client payment "success" screens are always driven by backend-confirmed state (poll/push), never by client-side Stripe results alone.

## Ratings

| Method | Path | Notes |
|---|---|---|
| POST | `/assignments/:id/rating` ⟲ | one per direction; double-blind until both submit or 14 days |
| GET | `/me/ratings` | received ratings (visible ones) |

## Disputes & reports

| Method | Path | Notes |
|---|---|---|
| POST | `/disputes` ⟲ | job/assignment, category, description; pauses payment release |
| GET | `/disputes/mine`, GET `/disputes/:id` | parties + admin |
| POST | `/disputes/:id/evidence` | photos/text; message/event refs auto-attached |
| POST | `/reports` | safety/behavior/fraud reports |

## Notifications

| Method | Path | Notes |
|---|---|---|
| GET | `/notifications` | cursor-paginated; unread count |
| POST | `/notifications/read` | mark read |

Catalog (type → recipient): `NEW_NEARBY_JOB`→W, `JOB_ACCEPTED`→C, `JOB_FILLED`→C, `WORKER_EN_ROUTE`→C, `WORKER_ARRIVED`→C, `JOB_STARTED`→C, `JOB_COMPLETED_PENDING`→C, `COMPLETION_CONFIRMED`→W, `JOB_CHANGE_PROPOSED`→W, `JOB_CHANGE_DECIDED`→C, `MESSAGE_RECEIVED`→both, `JOB_CANCELLED`→both, `PAYMENT_PROCESSED`→C, `PAYOUT_RELEASED`→W, `PAYOUT_FAILED`→W, `RATING_RECEIVED`→both, `DISPUTE_UPDATE`→both, `JOB_REMINDER`→both.

## Admin — `/v1/admin` (ADMIN role + 2FA; every mutation audited)

| Area | Endpoints |
|---|---|
| Overview | GET `/admin/metrics/overview` (active users/jobs, completed, GMV, revenue, disputes, reports, cancellations) |
| Users | GET `/admin/users?query=`, GET `/admin/users/:id`, POST `/admin/users/:id/suspend` (reason required), POST `/admin/users/:id/restore` |
| Jobs | GET `/admin/jobs?query=`, GET `/admin/jobs/:id` (full detail + timeline + messages + payments), POST `/admin/jobs/:id/cancel` |
| Review queue | GET `/admin/review-queue`, POST `/admin/jobs/:id/approve` / `/reject` |
| Payments | GET `/admin/payments?job_id&user_id&status`, GET `/admin/payments/:id` |
| Disputes | GET `/admin/disputes?status=`, GET `/admin/disputes/:id` (all evidence), POST `/admin/disputes/:id/resolve` `{resolution, amount_cents?, reason}` |
| Reports | GET `/admin/reports?status=`, POST `/admin/reports/:id/review` |
| Risk | GET `/admin/risk-flags?status=` |
| Categories | CRUD `/admin/categories`, incl. enable/disable + requirements |
| Settings | GET/PUT `/admin/settings/:key` (fees, cancellation policy, limits, verification requirements) — dangerous keys require re-auth |
| Audit | GET `/admin/audit-logs?entity=` |

## Rate-limit classes (initial values; configurable in platform_settings)

| Class | Endpoints | Limit (per user/IP) |
|---|---|---|
| auth-strict | register, login, password, phone codes | 5–10 / 15 min |
| write-standard | job create, accept, lifecycle transitions | 60 / h |
| messaging | send message | 30 / min |
| uploads | file intents | 30 / h |
| read | lists, discovery | 600 / 5 min |
| webhooks | Stripe | signature-verified, no user limit |

## Files (implemented upload flow)

1. `POST /files?kind=JOB_PHOTO|PROFILE_PHOTO` — multipart (`file` field), ≤10 MB; server validates by **magic bytes** (JPEG/PNG/WebP only, extensions/claimed types never trusted), records sha256, stores under a server-generated UUID key via the storage adapter (local disk in dev/single-server; S3-compatible adapter behind the same interface before horizontal scaling).
2. `GET /files/:id/content` — authenticated; access rules per kind: owner always; job photos to viewers of the job; profile photos to any authenticated user. 404 masks existence.
3. `POST /jobs/:id/photos {file_id}` — owner attaches own JOB_PHOTO uploads (max 8) while the job is editable/open; photo ids are returned in job views as `photo_file_ids`.
4. `POST /me/profile-photo {file_id, profile}` — sets customer/worker profile photo.

The original signed-URL direct-to-storage design remains the target once object storage is in place; the endpoint contract above stays stable (the upload step changes transport only).

## Additional implemented endpoints (kept in sync)

- `POST /auth/2fa/setup` / `POST /auth/2fa/enable {code}` — TOTP enrollment; login then requires `totp_code` (errors `TOTP_REQUIRED` / `TOTP_INVALID`).
- `POST /me/payment-methods/sync-setup-intent {setup_intent_id}` — adopt the card from a client-confirmed SetupIntent (payment-sheet flow).
- `POST /jobs/:id/tip {assignment_id, amount_cents}` — post-completion tip; full amount to the worker, no platform fee, one per assignment.
- `POST /jobs/:id/retry-payment` — customer retries a failed charge after fixing their card.
- `GET /jobs/:id/cancellation-preview` — policy consequences before confirming.
- `POST /geo/geocode {query}` — forward geocoding via provider adapter (Nominatim default).
