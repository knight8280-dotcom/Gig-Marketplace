# Payment Model — Local Gig Marketplace

> **Status:** Draft v0.1 — Phase 0 design. Implementation (Phase 10) **must** follow current official Stripe documentation at build time — this document defines our flow and invariants, not Stripe API call signatures.

## Architecture (ADR-004)

- **Processor:** Stripe. **Marketplace model:** Stripe Connect with **Express connected accounts** for workers (hosted onboarding = Stripe handles KYC + payout details; we never store bank/card data).
- **Charge pattern:** separate charges and transfers — the platform charges the customer, holds funds at the platform, and transfers each worker's share to their connected account only after completion is confirmed. This matches confirm-then-release and multi-worker splits (one charge → N transfers).

## Money representation

- Integer minor units (`bigint` cents) + explicit ISO 4217 currency on every monetary column and API payload. **No floating point anywhere in money paths.**
- Launch scope: single country, single currency (USD assumed pending product-owner confirmation). Multi-currency is explicitly out of MVP.
- All fee math in one pricing service; rounding rules documented in code and tested (banker's vs floor decisions recorded there).

## Fee model (configurable — never hardcoded)

```
customer_total   = job_pay (+ future: tips, adjustments)
platform_fee     = round(job_pay × percent_bps / 10000) + fixed_cents   ← platform_fees config row
processor_fee    = Stripe's fee (recorded when known)
worker_earnings  = job_pay − platform_fee            (per worker for multi-worker splits)
platform_revenue = platform_fee − processor_fee
```

- `platform_fees` rows: percentage (basis points) + fixed component, optional per-category override, `active_from/active_to` windows → promotional pricing later without schema change.
- Every payment snapshots the fee amount **and** references the fee config row used (auditability when config changes).
- Customer-facing screens clearly separate: job pay, any customer-side fee, total charged. Worker screens separate: gross, platform fee, net earnings.

## Lifecycle (happy path, per job)

```
1. Customer adds card (SetupIntent; card data never touches our servers)
2. Job POSTED               → payment method verified on file
3. Job FILLED               → PaymentIntent created + confirmed (charge customer)
                              payments row: CAPTURED/SUCCEEDED via webhook
4. Work performed           → funds held at platform
5. Customer confirms (or 72h auto-confirm) → per-assignment Transfer to worker's
                              connected account; payouts row per assignment
6. Stripe pays out to worker bank on their payout schedule
   payouts.status: PENDING → IN_TRANSIT → PAID (webhook-driven)
```

Worker earnings display: **pending** (transfer not yet created / job not confirmed) vs **available/in transit** vs **paid** — never conflated.

## Cancellation & refund mapping

Cancellation policy engine (TRUST_AND_SAFETY) produces a money outcome; payments module executes it:

| Outcome | Mechanism |
|---|---|
| Full refund | Refund on the PaymentIntent |
| Partial refund + worker callout compensation | Partial refund; transfer of compensation share to worker |
| Cancellation fee | Retained from charge or separate small charge per config |
| Dispute pending | Transfers paused for affected assignments until resolution |

Every refund/adjustment is a `payments` ledger row (kind `REFUND`/`ADJUSTMENT`) — the ledger never loses history.

## Failure handling

| Failure | Behavior |
|---|---|
| Charge fails at fill | Job does not proceed to worker-visible "filled/confirmed" money state; customer prompted to fix payment method; retried idempotently; job returns to MATCHING if unresolved within window |
| Transfer/payout fails | payouts.status FAILED + failure_code; worker notified with remediation (usually Stripe onboarding requirement); retried after fix; admin visibility |
| Card dispute (chargeback) | Stripe webhook → payment marked disputed → internal dispute opened → evidence submitted from immutable job records |
| Webhook outage | Stripe retries; our processing is idempotent; reconciliation job compares ledger vs Stripe objects |

## Idempotency invariants (structural, not best-effort)

1. Every Stripe call carries an idempotency key **derived from our ledger row id** (create ledger row first, then call).
2. `payments.stripe_payment_intent_id` UNIQUE, `payments.idempotency_key` UNIQUE.
3. `payouts.assignment_id` UNIQUE — one payout per assignment, double-payout impossible.
4. `stripe_events.stripe_event_id` UNIQUE — duplicate webhook deliveries no-op (insert-then-process).
5. Client retries of pay/confirm endpoints replay stored responses via `Idempotency-Key` header.

## Webhooks

- Signature verified (current Stripe signing scheme) before parsing; unverifiable → 400, logged.
- Insert into `stripe_events`, ack 2xx fast, process asynchronously (BullMQ) with retries.
- Backend state transitions **only** from verified webhooks/API responses. Client "payment succeeded" messages are never trusted.
- Events consumed (initial set): payment_intent lifecycle, charge.refunded, charge.dispute.*, transfer/payout lifecycle, account.updated (Connect onboarding status).

## Taxes & reporting (design-for, defer implementation)

- Ledger retains everything needed for reporting: gross, fees, net, parties, timestamps, currency, fee-config reference.
- Worker earnings reports derivable per period. Potential future: 1099-K/1099-NEC-style documentation (Stripe offers tax-form tooling for Connect) — **requires professional tax/legal review before launch**; tracked in LEGAL_COMPLIANCE.md.
- No tax advice or tax math is implemented without that review.

## Open questions (product owner / legal input needed)

| # | Question | Default until decided |
|---|---|---|
| P-1 | **Charge timing**: charge at fill vs authorize-then-capture vs charge at job start. Card auth holds expire (~7 days), so far-future scheduled jobs cannot hold an auth until start. | Charge at fill for jobs starting ≤ X days out; for far-future jobs, charge at T-24h before start (config) |
| P-2 | Hourly jobs: charge estimate then adjust, or charge actuals at completion? Overtime requires customer approval (scope-change flow) | Charge estimate at fill; customer-approved additional time charged as incremental payment |
| P-3 | Launch platform fee level (config value, not code) | Placeholder 15% + $0 fixed in seed config — pure config, changeable anytime |
| P-4 | Who absorbs processor fees (platform vs surfaced to customer) | Platform absorbs from platform fee |
| P-5 | Payout speed: standard schedule vs instant payout (fee-bearing) option later | Standard Stripe payout schedule |
| P-6 | Tips fast-follow timing | Ledger + UI hooks reserved; not built |
