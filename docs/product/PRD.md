# Product Requirements Document — Local Gig Marketplace

> **Working name:** LOCAL GIG MARKETPLACE (brand not selected; see [Brand](#brand)).
> **Status:** Draft v0.1 — Phase 0 (architecture/documentation pass). No product features implemented yet.

## 1. Vision

A two-sided, on-demand marketplace that connects **customers who need local jobs done** with **workers who want flexible local work and extra income**.

Core promise to customers: *"I need something done. Help me find someone nearby who can do it."*

Core promise to workers: *"I have time available. Show me nearby work I can accept and get paid for."*

The central product loop:

```
CUSTOMER POSTS JOB
→ PLATFORM FINDS RELEVANT WORKERS
→ WORKER ACCEPTS
→ JOB IS PERFORMED
→ CUSTOMER CONFIRMS COMPLETION
→ PAYMENT IS RELEASED
→ BOTH SIDES RATE EACH OTHER
```

Every feature is evaluated against two flows:

- **Customer:** POST → MATCH → ACCEPT → COMPLETE → PAY
- **Worker:** AVAILABLE → SEE JOB → ACCEPT → WORK → GET PAID

If a proposed feature makes either flow substantially slower or more confusing, it does not belong in the MVP.

## 2. Positioning

This product is an **on-demand marketplace for local labor**. It is explicitly **not**:

- A resume/job board
- A staffing company
- A traditional contractor marketplace (no lengthy proposals or interviews)
- A social network
- A classified-ad website

The marketplace emphasizes: immediate local opportunities, flexible work, transparent compensation, nearby workers, fast matching, trust, safety, simple payments, reputation, and repeat usage.

## 3. Users and roles

| Role | Description | MVP |
|---|---|---|
| `CUSTOMER` | Person or organization that needs work performed | Yes |
| `WORKER` | Person who accepts and performs jobs | Yes |
| `ADMIN` | Platform operator | Yes (minimal dashboard) |
| `SUPPORT_AGENT` | Support staff with limited admin powers | Future |
| `MODERATOR` | Content/report moderation | Future |
| `BUSINESS_CUSTOMER` | B2B customer organizations | Future |
| `BUSINESS_WORKER_MANAGER` | Manages a team of workers | Future |

A single account may hold both `CUSTOMER` and `WORKER` roles (separate profiles on one user record). The authorization system is role/permission based so new roles can be added without rewriting access control (see `docs/security/SECURITY_MODEL.md`).

## 4. Example use cases

Moving furniture, loading/unloading, yard work, lawn cleanup, cleaning, garage cleanup, junk removal assistance, furniture assembly, appliance moving assistance, event setup/teardown, warehouse labor, inventory assistance, retail support, seasonal labor, delivery/pickup assistance, basic household help, packing/unpacking, property cleanup, real-estate/apartment turnover, small-business labor, and other legally permitted local tasks.

Job categories are **data, not code** — new categories can be added through admin configuration without a code rewrite.

## 5. Job categories and restricted work

Categories are configurable records. Each category defines:

- Name, description, icon
- Required skills and required equipment
- Minimum worker age
- Whether identity verification is required
- Whether background verification is required
- Whether additional insurance is required
- Whether the category is currently allowed (enabled/disabled)
- Whether the category requires special disclosures
- Maximum job duration (if applicable)
- Safety requirements/notes

A **prohibited/restricted-job framework** prevents the platform from becoming a marketplace for dangerous, illegal, or highly regulated activities:

- Categories default to **disabled** until explicitly reviewed and enabled by an admin.
- A configurable keyword/pattern screen flags job posts that appear to describe restricted work (e.g., electrical/gas/roofing licensed trades, childcare, medical care, driving passengers, weapons, anything requiring professional licensure) for admin review before posting.
- The platform makes **no assumptions about legality**. Legal/compliance questions are tracked in `docs/business/LEGAL_COMPLIANCE.md` for professional review.

## 6. Customer account

Profile supports: name, profile photo, phone verification, email verification, rating, completed-job count, account creation date, verification status, preferred payment method, saved addresses, and business information where applicable.

Privacy rule: workers see only what they need — first name + last initial, photo, rating, completed jobs, and member-since date. Exact addresses are revealed only after acceptance (see §16).

## 7. Worker account

Profile supports: name, photo, bio, skills, experience, job categories, rating, completed jobs, cancellation rate, completion rate, response rate, verification status, service radius, availability, transportation options, equipment, languages, and payout information.

Sensitive data (payout details, exact home location, identity documents) is never displayed to other users.

## 8. Worker onboarding

Worker onboarding is more thorough than customer onboarding because workers perform physical jobs:

1. Account creation
2. Email verification
3. Phone verification
4. Identity verification (provider integration; requirement level is configurable per category)
5. Profile creation (photo, bio)
6. Skills
7. Categories
8. Service radius
9. Availability
10. Transportation
11. Equipment
12. Payout setup (Stripe Connect onboarding)
13. Terms/agreements
14. Safety information

Verification requirements are **configurable platform settings**, not hardcoded. The platform never claims a verification that has not actually occurred (see "no fake functionality" rule): verification badges are driven exclusively by completed `verification_records`.

Onboarding is **progressive** — a worker can browse jobs before completing every step, but cannot accept a job until the requirements for that job's category are met.

## 9. "Available for Work"

Core worker feature: a toggle that controls whether the worker receives job matches.

Configurable preferences: maximum distance, job categories, minimum pay, preferred time windows, preferred duration, skills, transportation, equipment.

Future: "Available until [time]" (e.g., "available right now until 6 PM"). The data model reserves an `available_until` timestamp so this can be added without migration churn.

## 10. Job creation

Guided flow with minimal required fields. Fields:

| Field | Required (MVP) |
|---|---|
| Title | Yes |
| Description | Yes |
| Category | Yes |
| Location (address → geocoded) | Yes |
| Date + start time (or ASAP) | Yes |
| Estimated duration | Yes |
| Number of workers | Yes (default 1) |
| Compensation (flat or hourly) | Yes |
| Photos | Optional |
| Required equipment | Optional |
| Special instructions | Optional |
| Physical requirements | Optional |
| Access instructions (shown only to accepted workers) | Optional |

Customers describe the job naturally; structured extraction (AI job parsing) is a **future** enhancement — MVP uses the guided form.

## 11. Drafts, repeats, recurrence

- **MVP:** save job as `DRAFT`; "Post Again" duplication from a completed job (high-retention, low-cost).
- **Future:** templates, recurring jobs ("every Saturday at 9 AM"). The schema reserves `recurrence_rule` and `parent_job_id` columns so recurrence can be added without rewriting the job system.

## 12. Photos

Customers upload photos to help workers estimate size/quantity/difficulty/equipment. Enforced: file-size limits, image validation (magic bytes, not extension), secure object storage (never binary blobs in PostgreSQL), content-type validation, short-lived signed URLs.

## 13. Compensation

MVP supports **flat-rate** and **hourly** compensation. All compensation logic is centralized in the `payments` module pricing service — never scattered through controllers.

Designed-for (not built in MVP): tips, bonuses, surge/demand pricing, customer-approved additional time, recurring compensation.

All money is stored as **integer minor units (cents) with explicit currency** (see ADR notes and `docs/business/PAYMENT_MODEL.md`).

## 14. Pricing intelligence

- **MVP:** deterministic suggestion — median pay of completed jobs in the same category within N miles over the last 90 days, with a configurable fallback range per category. Shown as "Similar jobs nearby typically pay $75–$110."
- **Future:** AI-assisted pricing trained on completed jobs. AI is never required for basic operation.

## 15. Job discovery

Workers get: nearby jobs (list + map), filters (distance, pay, date, start time, duration, category, workers needed, minimum pay, skills), structured search, and recommended jobs.

Job cards immediately show: title, pay, distance, start time, estimated duration, workers needed, category — the worker should not need to open every job to evaluate it.

## 16. Location privacy

- Before acceptance: workers see an **approximate location** (rounded coordinates / neighborhood-level, ~300 m obfuscation) and distance from their position.
- After acceptance: full address and access instructions.
- Worker home locations are never exposed to customers; matching uses them server-side only.
- Map pins pre-acceptance use the obfuscated coordinate.

## 17. Matching engine

Dedicated `matching` module with a deterministic, documented policy (see `docs/architecture/SYSTEM_ARCHITECTURE.md` §Matching).

MVP inputs: distance, availability, category, skills, service radius, minimum pay, worker status (available + eligible), category verification requirements.

The ranking function is behind an interface (`MatchRanker`) so future factors (rating, completion rate, response rate, fairness/anti-concentration, demand balancing) can be added without changing callers. Matching **never** uses protected characteristics. Policy is documented and versioned.

## 18. Acceptance model

Default: **direct accept**. Worker sees job → taps ACCEPT JOB. Multi-worker jobs show "2 / 3 workers accepted" and continue matching until filled. Concurrency is enforced server-side (transactional slot claim; see ADR-006 and DATABASE_SCHEMA).

Architecture supports future models (customer selection, applications, invitations, bidding) via a `job_workers.source` discriminator — bidding is **not** the default.

## 19. Multi-worker jobs

A job tracks **individual worker assignments** (`job_workers` rows), each with its own acceptance, status, arrival, start, completion, payment allocation, and rating. A multi-worker job is never modeled as one giant worker record.

## 20. Job scope protection

The original job description, photos, pay, duration, and requirements are **immutable after posting**. Scope changes go through a formal `job_changes` proposal: customer proposes → each assigned worker approves/declines → change recorded as an event. The original agreement is never silently modified. Future: additional compensation/time/workers attached to a change.

## 21. Job lifecycle

Explicit state machine (`DRAFT → POSTED → MATCHING → PARTIALLY_FILLED → FILLED → ... → PAID/CANCELLED/DISPUTED → CLOSED`) with a defined transition table and immutable `job_events` audit records for every transition. See ADR-006 and `docs/database/DATABASE_SCHEMA.md`.

Every job has a visible **timeline** built from `job_events` (posted, accepted, en-route, arrived, started, completed, confirmed, paid) — used for transparency, disputes, fraud detection, support, and analytics.

## 22. Arrival, start, completion

- Worker taps "I'm here" → `ARRIVED` event with timestamp + approximate location (GPS is **evidence, not proof**).
- Worker taps START JOB → `IN_PROGRESS`.
- Worker taps COMPLETE JOB → `COMPLETION_PENDING`; customer can **CONFIRM** or **REPORT A PROBLEM**.
- If the customer does not respond within a configurable window (default 72 h), completion auto-confirms and payment releases (documented, disputable afterward).
- Future: completion photos, signature, checklist — not in MVP to avoid burdening users.

## 23. Payments

Stripe Connect marketplace payments; backend is the sole authority on payment state; all webhooks verified; all money operations idempotent. Full model in `docs/business/PAYMENT_MODEL.md`. Platform fees are **configurable** (percentage and/or fixed, optional per-category override) — never hardcoded.

## 24. Ratings

Two-sided, per-assignment ratings with dimensions (overall required; reliability, communication, professionalism, accuracy optional). **Double-blind window**: ratings are hidden until both parties submit or 14 days elapse, whichever comes first, to prevent retaliation. Policy documented in `docs/security/TRUST_AND_SAFETY.md`.

## 25. Messaging

Job-scoped conversations only (a conversation belongs to a job). Text + images, read status, timestamps, message reporting, blocking. Not a general social network. Future: automated reminders, arrival messages, translation.

## 26. Notifications

Push/email/SMS with per-user preferences; critical transactional notifications distinguished from marketing. Event catalog in `docs/api/API_SPECIFICATION.md` §Notifications.

## 27. Safety

Both sides can report unsafe conditions/behavior, cancel for safety without normal penalties, and contact support. The app provides clear guidance to contact local emergency services for serious situations and **never** claims to guarantee physical safety or replace emergency services. See `docs/security/TRUST_AND_SAFETY.md`.

## 28. Cancellations and disputes

Centralized, configurable cancellation policy engine (who cancelled, when relative to acceptance/start/arrival, consequences for refund/compensation/metrics). Formal dispute system with evidence, timelines, and an admin resolution interface. Policies live in configuration + the `disputes`/`cancellations` modules, never in controllers.

## 29. Business customers, favorites, recurring (future)

Designed-for but excluded from MVP: B2B accounts (property managers, event companies, warehouses), favorite workers ("invite my previous workers" — never bypassing safety/verification rules), recurring jobs. The schema and role model keep these extensions cheap.

## 30. Earnings and payment history

- Worker: today/week/month earnings, completed jobs, pending payouts, available balance, tips, fees, payment history. **Pending funds are never shown as available.**
- Customer: payment history, receipts, job history, refunds, payment methods.

## 31. Accessibility and i18n

WCAG-informed: screen-reader labels, font scaling, contrast, touch targets ≥ 44 pt, keyboard navigation on web/admin, clear errors, reduced-motion support, status never communicated by color alone. English-only launch, but all UI strings live in locale files (no text in business logic) and dates/numbers/currency are formatted through i18n utilities.

## 32. Time and money invariants

- All timestamps stored in UTC (`timestamptz`); displayed in the user's local timezone; job scheduling stores the job's IANA timezone.
- No floating-point money anywhere. Integer minor units + explicit ISO 4217 currency.

## 33. KPIs

| Area | Metrics |
|---|---|
| Supply | registered / verified / active / available workers |
| Demand | customers, active customers, jobs posted |
| Liquidity | fill rate, time-to-first-acceptance, time-to-fill, completion rate |
| Economics | GMV, platform revenue, average job value, average worker earnings, average platform fee |
| Retention | repeat customers, repeat workers, jobs per customer, jobs per worker |
| Trust | cancellation rate, dispute rate, refund rate, average rating |

All KPIs derive from the analytics event stream (see §Analytics in SYSTEM_ARCHITECTURE).

## 34. Launch strategy

Single geographically concentrated pilot market first (liquidity before breadth). Geographic expansion is a data problem (market/region records + PostGIS), not an architecture rewrite.

## Brand

Candidate names (brainstorm only — **no trademark/domain/app-store availability assumed**): JOBPOP, GIGGO, EARNLOCAL, JOBHOP, WORKUP, JOBDASH, GIGNOW, WORKLY, GIGUP, WORKTAP, JOBPICK, PICKAGIG, LOCALGIG, WORKNEAR, JOBDROP, GIGMATCH, SIDEWORK. Internal name until selection: **LOCAL GIG MARKETPLACE**.

## Priorities

When choosing between features: 1) Safety, 2) Security, 3) Core marketplace transaction, 4) Payment correctness, 5) Reliability, 6) User experience, 7) Marketplace liquidity, 8) Performance, 9) Analytics, 10) Nice-to-haves.
