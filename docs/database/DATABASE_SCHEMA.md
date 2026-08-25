# Database Schema — Local Gig Marketplace

> **Status:** Draft v0.1 — Phase 0 design. Tables are created incrementally by phase (see ROADMAP); this document is the schema's source of truth and must be updated with every migration.

## Conventions

- PostgreSQL 16 + PostGIS (`CREATE EXTENSION postgis`).
- Primary keys: `uuid` (v7 where available) — non-enumerable, safe in URLs.
- All timestamps: `timestamptz` (UTC). `created_at`/`updated_at` on every table.
- Money: `bigint` minor units (cents) + `currency char(3)` (ISO 4217). **Never float/real/money types.**
- Enums: Postgres enum types mirrored in `packages/shared`.
- Soft deletes only where product-required (`deleted_at`); financial/audit tables are append-only.
- Append-only tables (`job_events`, `audit_logs`, `admin_actions`, `stripe_events`, `analytics_events`): the application DB role has no UPDATE/DELETE grants.
- Locations: `geography(Point, 4326)` + GiST indexes.

## Entity groups

```
identity:   users, refresh_tokens, verification_records, device_tokens
profiles:   customer_profiles, worker_profiles, saved_addresses,
            skills, worker_skills, worker_availability, worker_locations
catalog:    categories, category_requirements, restricted_terms, platform_settings
jobs:       jobs, job_photos, job_workers, job_events, job_changes
comms:      conversations, messages, notifications, notification_preferences
money:      payment_customers, payout_accounts, payments, payouts,
            platform_fees, stripe_events, idempotency_keys
trust:      ratings, disputes, dispute_evidence, reports, risk_flags
ops:        admin_actions, audit_logs, outbox, analytics_events
```

## Identity

### users
| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| email | citext UNIQUE NOT NULL | |
| email_verified_at | timestamptz NULL | |
| phone | text UNIQUE NULL | E.164 |
| phone_verified_at | timestamptz NULL | |
| password_hash | text NOT NULL | argon2id |
| roles | user_role[] NOT NULL | `{CUSTOMER}`, `{WORKER}`, or both; `ADMIN`, future roles |
| status | user_status NOT NULL | `ACTIVE / SUSPENDED / DELETION_REQUESTED / DELETED` |
| suspended_reason | text NULL | admin-set |
| created_at / updated_at | timestamptz | |

Indexes: `email`, `phone`, `status`.

### refresh_tokens
`id, user_id FK, token_hash UNIQUE, family_id uuid, expires_at, revoked_at, created_ip, user_agent, created_at` — rotation invalidates the family on reuse detection.

### verification_records
| Column | Notes |
|---|---|
| id, user_id FK | |
| type | `EMAIL / PHONE / IDENTITY / BACKGROUND` |
| status | `PENDING / PASSED / FAILED / EXPIRED` |
| provider | e.g. `internal`, `stripe_identity` — never fake; a badge exists only if a PASSED row exists |
| provider_ref | provider's id; **no raw documents stored in our DB** |
| verified_at, expires_at | |

Unique partial index: one PASSED row per `(user_id, type)`.

### device_tokens
`id, user_id FK, platform (ios/android), token UNIQUE, last_seen_at, disabled_at`.

## Profiles

### customer_profiles
`user_id PK/FK, display_name, photo_file_id FK, business_name NULL, business_info jsonb NULL, default_payment_method_ref NULL, rating_avg numeric(3,2), rating_count int, jobs_completed int, created_at, updated_at`.

### worker_profiles
| Column | Notes |
|---|---|
| user_id PK/FK | |
| display_name, photo_file_id, bio | |
| experience | text |
| transportation | worker_transport[] (`NONE/BICYCLE/CAR/TRUCK/VAN`) |
| equipment | text[] (catalog-backed later) |
| languages | text[] |
| service_radius_m | int NOT NULL DEFAULT 16093 (10 mi) — configurable, never hardcoded in code |
| home_location | geography(Point,4326) — **server-side only, never exposed via API** |
| onboarding_step | worker_onboarding_step |
| rating_avg, rating_count | |
| jobs_completed, jobs_cancelled, completion_rate, cancellation_rate, response_rate | maintained by ratings/lifecycle services |
| min_pay_cents, currency | match preference |
| created_at, updated_at | |

Index: GiST on `home_location`.

### skills / worker_skills
`skills(id, slug UNIQUE, name, category_id FK NULL, active)`;
`worker_skills(worker_user_id FK, skill_id FK, PRIMARY KEY(worker_user_id, skill_id))`.

### worker_availability
`id, worker_user_id FK, weekday smallint 0–6, start_minute, end_minute, timezone text (IANA)` — weekly windows.
Plus on worker_profiles: `available_now boolean NOT NULL DEFAULT false`, `available_until timestamptz NULL` (reserved for "available until 6 PM").

### worker_locations
`id, worker_user_id FK, location geography, recorded_at, purpose (MATCHING/ARRIVAL_EVIDENCE)` — sparse snapshots only (no continuous tracking in MVP); retention-limited (see DATA PRIVACY).

### saved_addresses
`id, user_id FK, label, address_line1/2, city, region, postal_code, country, location geography, access_notes text NULL, deleted_at`.

## Catalog & configuration

### categories
| Column | Notes |
|---|---|
| id, slug UNIQUE, name, description, icon | |
| enabled | boolean NOT NULL DEFAULT **false** — categories are reviewed before enablement |
| min_worker_age | smallint NULL |
| requires_identity_verification | boolean |
| requires_background_check | boolean |
| requires_insurance | boolean |
| requires_disclosures | boolean + `disclosure_text` |
| max_duration_minutes | int NULL |
| safety_notes | text |
| required_equipment | text[] |
| required_skill_ids | uuid[] |
| sort_order | int |

### restricted_terms
`id, pattern text, kind (BLOCK/REVIEW), reason, active` — keyword/pattern screen for job posts; matches route the job to admin review, never silent drops.

### platform_settings
`key text PK, value jsonb, updated_by FK users, updated_at` — versioned via audit_logs. Holds: fee config, cancellation thresholds/fees, auto-confirm window, matching batch size, rate limits, verification requirements defaults. **No business constants hardcoded in code.**

### platform_fees
`id, name, percent_bps int (basis points), fixed_cents bigint, currency, category_id FK NULL (per-category override), active_from, active_to NULL` — fee history is preserved; each payment references the fee row used.

## Jobs

### jobs
| Column | Notes |
|---|---|
| id | uuid PK |
| customer_user_id | FK users |
| category_id | FK categories |
| title, description | immutable after POSTED (changes go through job_changes) |
| state | job_state enum (see ADR-006) |
| address fields + location | geography — exact; exposed only to accepted workers |
| approx_location | geography — obfuscated ~300 m; the only pre-acceptance coordinate |
| timezone | IANA tz of the job site |
| scheduled_start_at | timestamptz NULL (NULL + `urgency='ASAP'`) |
| urgency | `SCHEDULED / SAME_DAY / ASAP` |
| estimated_duration_minutes | int |
| workers_needed | smallint NOT NULL DEFAULT 1 CHECK (>=1) |
| workers_filled | smallint NOT NULL DEFAULT 0 CHECK (workers_filled <= workers_needed) |
| pay_type | `FLAT / HOURLY` |
| pay_cents, currency | flat total or hourly rate, per worker |
| required_equipment, physical_requirements, special_instructions | |
| access_instructions | revealed post-acceptance only |
| review_status | `NONE / PENDING_REVIEW / APPROVED / REJECTED` (restricted-work screen) |
| recurrence_rule | text NULL — **reserved, unused in MVP** |
| parent_job_id | uuid NULL self-FK — reserved for repeats/recurrence |
| posted_at, filled_at, completed_at, cancelled_at, closed_at | |

Indexes: GiST(`location`), `(state, scheduled_start_at)`, `(customer_user_id, created_at)`, `(category_id)`.

### job_photos
`id, job_id FK, file_id FK files, sort_order, created_at`.

### files
`id, owner_user_id FK, kind (JOB_PHOTO/PROFILE_PHOTO/MESSAGE_IMAGE/EVIDENCE), storage_key UNIQUE, content_type, byte_size, sha256, scan_status, created_at` — binary content lives in object storage, never in Postgres.

### job_workers (assignments) — the heart of multi-worker jobs
| Column | Notes |
|---|---|
| id | uuid PK |
| job_id FK, worker_user_id FK | UNIQUE(job_id, worker_user_id) |
| state | assignment_state enum (ADR-006) |
| source | `DIRECT_ACCEPT` (MVP) / `INVITATION / APPLICATION / ADMIN` reserved |
| accepted_at, confirmed_at, en_route_at, arrived_at, started_at, completed_at, cancelled_at | |
| arrival_location | geography NULL — evidence, not proof |
| earnings_cents, currency | this worker's allocation |
| payout_id | FK payouts NULL |

Slot integrity: acceptance is a `SELECT ... FOR UPDATE` transaction on the job row; a trigger/CHECK keeps `workers_filled` = count of active assignments and ≤ `workers_needed`.

### job_events (append-only)
`id, job_id FK, assignment_id FK NULL, actor_user_id FK NULL (NULL = system), event_type, from_state, to_state, metadata jsonb, created_at` — every meaningful transition; drives timeline, disputes, analytics. No UPDATE/DELETE.

### job_changes (scope protection)
`id, job_id FK, proposed_by FK users, changes jsonb (field→{old,new}), status (PROPOSED/APPROVED/DECLINED/CANCELLED), decided_at` + `job_change_approvals(job_change_id, assignment_id, decision, decided_at)` — original job fields are never mutated in place; approved changes are applied and event-logged.

## Communications

### conversations / messages
`conversations(id, job_id FK, customer_user_id, worker_user_id, UNIQUE(job_id, worker_user_id), created_at, closed_at)`;
`messages(id, conversation_id FK, sender_user_id FK, body text NULL, file_id FK NULL, created_at, read_at, reported_at NULL, hidden_at NULL)` — CHECK (body or file present). Cursor-paginated by `(conversation_id, id)`.

### notifications / notification_preferences
`notifications(id, user_id FK, type, title, body, data jsonb, channels text[], created_at, read_at, sent_at, failed_at)`;
`notification_preferences(user_id FK, channel (PUSH/EMAIL/SMS), category (TRANSACTIONAL/JOB_ALERTS/MARKETING), enabled, PRIMARY KEY(user_id, channel, category))` — critical transactional notices are always delivered on at least one channel.

## Money (see PAYMENT_MODEL.md for flows)

### payment_customers
`user_id PK/FK, stripe_customer_id UNIQUE, default_payment_method, created_at`.

### payout_accounts
`worker_user_id PK/FK, stripe_account_id UNIQUE, onboarding_status (PENDING/COMPLETE/RESTRICTED), charges_enabled, payouts_enabled, requirements jsonb, updated_at` — mirrors Stripe account state via webhooks; a worker cannot accept paid work until `COMPLETE`.

### payments (customer-side ledger)
| Column | Notes |
|---|---|
| id | uuid PK |
| job_id FK, customer_user_id FK | |
| kind | `JOB_PAYMENT / TIP (reserved) / CANCELLATION_FEE / REFUND / ADJUSTMENT` |
| status | `REQUIRES_PAYMENT / AUTHORIZED / CAPTURED / SUCCEEDED / FAILED / REFUNDED / PARTIALLY_REFUNDED / CANCELLED` |
| amount_cents, currency | gross customer charge |
| platform_fee_cents | snapshot at charge time |
| platform_fee_id | FK platform_fees — which config produced it |
| processor_fee_cents | from Stripe, when known |
| stripe_payment_intent_id | UNIQUE NULL |
| stripe_charge_id, stripe_refund_id | |
| idempotency_key | UNIQUE |
| failure_code, failure_message | |
| created_at, updated_at | |

Status changes are driven **only** by verified webhooks / API responses — never client claims.

### payouts (worker-side ledger)
`id, job_id FK, assignment_id FK UNIQUE, worker_user_id FK, amount_cents, currency, status (PENDING/IN_TRANSIT/PAID/FAILED/REVERSED), stripe_transfer_id UNIQUE NULL, stripe_payout_id NULL, idempotency_key UNIQUE, failure_code, created_at, updated_at` — `assignment_id UNIQUE` + idempotency key make double payouts structurally impossible.

### stripe_events (append-only)
`id, stripe_event_id UNIQUE, type, payload jsonb, signature_verified_at, processed_at NULL, processing_error NULL, created_at` — insert-then-process; duplicate deliveries hit the unique constraint and no-op.

### idempotency_keys
`key text PK, user_id FK, endpoint, request_hash, response_status, response_body jsonb, created_at, expires_at` — client-supplied `Idempotency-Key` support for accept/complete/payment mutations.

## Trust & safety

### ratings
`id, job_id FK, assignment_id FK, rater_user_id FK, ratee_user_id FK, direction (CUSTOMER_TO_WORKER/WORKER_TO_CUSTOMER), overall smallint CHECK 1–5, reliability/communication/professionalism/accuracy smallint NULL, comment text, visible_at timestamptz NULL (double-blind release), created_at` — UNIQUE(assignment_id, direction). Aggregates recomputed on visibility release.

### disputes / dispute_evidence
`disputes(id, job_id FK, assignment_id FK NULL, opened_by FK users, category (NOT_COMPLETED/INCOMPLETE/SCOPE_CHANGED/PAYMENT/PROPERTY_DAMAGE/WORKER_BEHAVIOR/CUSTOMER_BEHAVIOR/CANCELLATION/NO_SHOW/SAFETY/FRAUD), status (OPEN/UNDER_REVIEW/RESOLVED/CLOSED), description, resolution (RELEASE/REFUND_FULL/REFUND_PARTIAL/OTHER), resolution_amount_cents NULL, resolved_by FK users NULL, resolved_at, resolution_reason)`;
`dispute_evidence(id, dispute_id FK, kind (PHOTO/MESSAGE_REF/EVENT_REF/PAYMENT_REF/TEXT), file_id FK NULL, ref_table/ref_id NULL, note, created_by, created_at)` — evidence references immutable records; users cannot edit history.

### reports
`id, reporter_user_id FK, reported_user_id FK NULL, job_id FK NULL, message_id FK NULL, category (UNSAFE_JOB/DANGEROUS_CONDITIONS/HARASSMENT/THREAT/FRAUD/OTHER), description, status (OPEN/REVIEWED/ACTIONED/DISMISSED), reviewed_by, reviewed_at, created_at`.

### risk_flags
`id, user_id FK, signal (MULTI_ACCOUNT/PAYMENT_ANOMALY/EXCESSIVE_CANCELLATIONS/RATING_ANOMALY/REPEATED_DISPUTES/RAPID_SIGNUP/DEVICE_PATTERN/PAYMENT_FAILURES/JOB_ANOMALY), score numeric, details jsonb, status (OPEN/REVIEWED/DISMISSED), created_at` — flags for **admin review**; no automated bans on weak signals.

### favorites (reserved — future feature)
`customer_user_id FK, worker_user_id FK, created_at, PRIMARY KEY(customer_user_id, worker_user_id)`.

## Operations

### admin_actions (append-only)
`id, admin_user_id FK, action, target_table, target_id, reason, previous_state jsonb, new_state jsonb, created_at`.

### audit_logs (append-only)
`id, actor_user_id FK NULL, actor_type (USER/ADMIN/SYSTEM), action, entity_table, entity_id, previous_state jsonb NULL, new_state jsonb NULL, reason NULL, request_id, created_at` — who/what/when/before/after/why for security- and finance-relevant actions.

### outbox
`id, aggregate_type, aggregate_id, event_type, payload jsonb, created_at, published_at NULL` — transactional event publication (see SYSTEM_ARCHITECTURE §4).

### analytics_events (append-only)
`id, user_id NULL, anonymous_id NULL, event text (user_registered, job_created, job_posted, job_viewed, job_accepted, job_filled, worker_arrived, job_started, job_completed, payment_created, payment_succeeded, payment_failed, payout_created, rating_submitted, job_cancelled, dispute_created, worker_available, worker_onboarding_started, worker_onboarding_completed, …), properties jsonb, occurred_at, created_at` — populated from the outbox; feeds KPI queries. May move to a warehouse later.

## Key indexes summary

| Purpose | Index |
|---|---|
| Nearby jobs | GiST on `jobs.location` (+ partial `WHERE state IN ('POSTED','MATCHING','PARTIALLY_FILLED')`) |
| Worker matching | GiST on `worker_profiles.home_location`; btree `(available_now)` partial |
| Job lists | `(customer_user_id, created_at DESC)`, `(state, scheduled_start_at)` |
| Assignments | `(worker_user_id, state)`, UNIQUE `(job_id, worker_user_id)` |
| Messages | `(conversation_id, id DESC)` |
| Payments | UNIQUE `stripe_payment_intent_id`, UNIQUE `idempotency_key`, `(job_id)` |
| Webhooks | UNIQUE `stripe_events.stripe_event_id` |
| Events/timeline | `(job_id, created_at)` |
| Notifications | `(user_id, created_at DESC)`, partial `WHERE read_at IS NULL` |

## Data privacy & retention

- Collect only what the product needs; no identity documents stored in our systems (provider-held, referenced by id).
- `worker_locations` snapshots retained max 90 days except rows referenced as dispute evidence.
- Account deletion: PII anonymized on `users`/profiles; financial ledger and audit records retained (legal/financial reporting) with the user reference pseudonymized. Exact retention windows: legal review (LEGAL_COMPLIANCE.md).
- API responses are allow-listed DTOs — a column existing in the DB never implies it is exposed.
