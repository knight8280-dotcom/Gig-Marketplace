-- Phase 10: Stripe Connect marketplace payments (see docs/business/PAYMENT_MODEL.md).

CREATE TABLE payment_customers (
  user_id uuid PRIMARY KEY REFERENCES users(id),
  stripe_customer_id text UNIQUE NOT NULL,
  default_payment_method text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE payout_accounts (
  worker_user_id uuid PRIMARY KEY REFERENCES users(id),
  stripe_account_id text UNIQUE NOT NULL,
  onboarding_status text NOT NULL DEFAULT 'PENDING'
    CHECK (onboarding_status IN ('PENDING','COMPLETE','RESTRICTED')),
  charges_enabled boolean NOT NULL DEFAULT false,
  payouts_enabled boolean NOT NULL DEFAULT false,
  requirements jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Customer-side money ledger. Status changes ONLY from verified webhooks or
-- direct Stripe API responses — never client claims.
CREATE TABLE payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id),
  customer_user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('JOB_PAYMENT','TIP','CANCELLATION_FEE','REFUND','ADJUSTMENT')),
  status text NOT NULL CHECK (status IN
    ('REQUIRES_PAYMENT','PROCESSING','SUCCEEDED','FAILED','REFUNDED','PARTIALLY_REFUNDED','CANCELLED')),
  amount_cents bigint NOT NULL CHECK (amount_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  platform_fee_cents bigint NOT NULL DEFAULT 0 CHECK (platform_fee_cents >= 0),
  platform_fee_id uuid REFERENCES platform_fees(id),
  processor_fee_cents bigint,
  refunded_cents bigint NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0 AND refunded_cents <= amount_cents),
  stripe_payment_intent_id text UNIQUE,
  stripe_charge_id text,
  stripe_refund_id text,
  idempotency_key text UNIQUE NOT NULL,
  failure_code text,
  failure_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX payments_job_idx ON payments (job_id);
CREATE INDEX payments_customer_idx ON payments (customer_user_id, created_at DESC);

-- Worker-side ledger. UNIQUE(assignment_id) per kind makes double payouts
-- structurally impossible.
CREATE TABLE payouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id),
  assignment_id uuid NOT NULL REFERENCES job_workers(id),
  worker_user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL DEFAULT 'JOB_EARNINGS'
    CHECK (kind IN ('JOB_EARNINGS','CANCELLATION_COMPENSATION')),
  status text NOT NULL CHECK (status IN ('PENDING','IN_TRANSIT','PAID','FAILED','REVERSED')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  platform_fee_cents bigint NOT NULL DEFAULT 0,
  stripe_transfer_id text UNIQUE,
  idempotency_key text UNIQUE NOT NULL,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, kind)
);
CREATE INDEX payouts_worker_idx ON payouts (worker_user_id, created_at DESC);
CREATE INDEX payouts_job_idx ON payouts (job_id);

-- Append-only webhook inbox: insert-then-process; duplicate deliveries no-op
-- on the unique constraint.
CREATE TABLE stripe_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text UNIQUE NOT NULL,
  type text NOT NULL,
  payload jsonb NOT NULL,
  signature_verified_at timestamptz NOT NULL,
  processed_at timestamptz,
  processing_error text,
  created_at timestamptz NOT NULL DEFAULT now()
);
