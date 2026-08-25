# Trust & Safety — Local Gig Marketplace

> **Status:** Draft v0.1 — Phase 0. Product-level trust & safety policy and mechanisms. Legal-sensitive items are flagged to `docs/business/LEGAL_COMPLIANCE.md`.

## Principles

1. Physical-world marketplace ⇒ safety outranks every feature (priority rule #1).
2. Never create a **false sense of protection**: no claimed verification that didn't occur, no implied insurance that doesn't exist, no implied emergency response capability.
3. Evidence is immutable; users cannot rewrite history.
4. Enforcement decisions are human-reviewed; automation flags, it does not ban.

## Verification framework

- `verification_records` are the single source of truth; UI badges render only from PASSED records. **No fake verification, ever.**
- Levels: email → phone → identity (provider) → background check (provider, future wiring).
- Requirements are configurable per category (e.g., in-home categories can require identity verification). Enforced server-side at accept time.
- Verification expiry supported (`expires_at`) for re-verification policies.
- Background-check provider integration is deferred; categories configured to require it remain **disabled** until it is wired (never silently waived).

## Restricted work

- Categories default disabled until reviewed; the category record carries age/verification/insurance/disclosure requirements.
- `restricted_terms` screening on job title/description at posting: `BLOCK` patterns stop posting with a clear message; `REVIEW` patterns route to the admin review queue (`PENDING_REVIEW`) before the job goes live.
- Never allow the platform to drift into dangerous/illegal/regulated work by default; new category proposals require the legal checklist in LEGAL_COMPLIANCE.md.

## Location privacy

- Pre-acceptance: obfuscated coordinates (~300 m) + neighborhood text only; map pins use `approx_location`.
- Post-acceptance: exact address + access instructions to assigned workers only.
- Worker home locations are server-side matching inputs only — never exposed to customers or other workers.
- No continuous location tracking in MVP; sparse snapshots (arrival evidence) with 90-day retention.

## Reporting

Both sides can report — workers: unsafe job, dangerous conditions, harassment, threats; customers: unsafe worker behavior; anyone: fraud, message content. Reports feed an admin queue with SLAs. **Cancel for safety** is always available without standard cancellation penalties (abuse of this path is itself a risk signal for review).

## Emergencies

- The app is **not** an emergency service and never claims to guarantee physical safety.
- Serious-situation pathway: prominent guidance to contact local emergency services (e.g., 911 in the US) first, then report to the platform.
- Future (deferred): Safety Check-In ("confirm you arrived safely") — explicitly out of MVP; will not be presented as active protection when built.

## Ratings policy

- Two-sided, per-assignment. Overall (1–5) required; reliability/communication/professionalism/accuracy optional.
- **Double-blind**: ratings invisible until both parties submit or 14 days elapse — prevents retaliatory rating.
- Rating prompts are symmetric and neutral; no incentives for 5-star exchanges.
- Rating anomalies (rings, retaliation attempts after disputes) surface as `risk_flags`.
- Aggregates (avg + count) shown after a minimum count threshold to avoid single-rating character assassination.

## Scope protection

Original job description/photos/pay/duration/requirements are preserved immutably. Changes require the `job_changes` proposal + worker approval flow. "Customer asked for substantially more work on arrival" is a first-class dispute category, adjudicated against the immutable original record.

## Cancellation policy (centralized engine)

All scenarios route through one policy service reading `platform_settings` (thresholds/fees configurable, never hardcoded):

| Scenario | Default consequence (initial config, tunable) |
|---|---|
| Customer cancels before any acceptance | No charge |
| Customer cancels > T1 (e.g. 4 h) before start | No fee, workers notified |
| Customer cancels < T1 before start | Cancellation fee → partial worker compensation |
| Customer cancels after worker en-route/arrived | Callout compensation to worker per policy |
| Worker cancels soon after acceptance (grace window) | Slot reopens, minor reliability note |
| Worker cancels near start / no-show | Reliability metric impact, customer rematch prioritized |
| Safety cancellation (either side) | No standard penalty; safety report opened |
| Job materially different from description | Worker may cancel penalty-free; dispute path offered |

Consequences are always displayed **before** the user confirms. Every cancellation writes job_events + affects reliability metrics via the metrics service (not inline controller math).

## Disputes

- Categories: not completed, incomplete work, scope changed, payment, property damage, worker behavior, customer behavior, cancellation, no-show, safety, fraud.
- Opening a dispute pauses payment release for the affected assignment(s).
- Evidence: photos, auto-attached message history, job description + change history, timeline events, payment records, location/time evidence where appropriate — all references to immutable records.
- Resolution: admin-only, with reason, recorded in `admin_actions`; outcomes: release / partial refund / full refund / other adjustment. Both parties notified.
- Dispute rate is a core trust KPI; repeated disputes raise risk flags.

## Fraud / risk framework

Signals (initial): multiple accounts (device/payment fingerprint overlap), suspicious payment behavior, excessive cancellations, unusual rating patterns, repeated disputes, rapid account creation, payment failures, suspicious job posts (e.g., money-movement "jobs").

Pipeline: signal collectors (background jobs) → `risk_flags` with score + details → admin review queue → human decision (suspend/restrict/dismiss), always audited. **No automated bans on weak signals.** High-confidence hard blocks (e.g., stolen-card webhook from Stripe) pause money movement pending review rather than deleting accounts.

## Moderation & blocking

- Message reporting + user blocking (blocks prevent future matching between the pair).
- Photo uploads pass validation + scanning hooks; reported content is hidden pending review (`hidden_at`), never hard-deleted (evidence preservation).

## Admin accountability

Every enforcement action (suspend, restore, resolve, approve/reject job, settings change) requires a reason and writes append-only `admin_actions`. Support/moderator roles (future) get narrower permission sets via the central permission service.
