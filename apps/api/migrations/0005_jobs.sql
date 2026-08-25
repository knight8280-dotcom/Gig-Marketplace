-- Phases 5–8: jobs, assignments, immutable events, scope changes.
-- Enum values mirror packages/shared/src/job-states.ts (ADR-006) — keep in sync.

CREATE TYPE job_state AS ENUM (
  'DRAFT','PENDING_REVIEW','POSTED','MATCHING','PARTIALLY_FILLED','FILLED',
  'IN_PROGRESS','COMPLETION_PENDING','COMPLETED','PAYMENT_PENDING','PAID',
  'CANCELLED','DISPUTED','CLOSED'
);

CREATE TYPE assignment_state AS ENUM (
  'ACCEPTED','CONFIRMED','EN_ROUTE','ARRIVED','STARTED','COMPLETED',
  'CANCELLED_BY_WORKER','CANCELLED_BY_CUSTOMER','NO_SHOW','REMOVED'
);

CREATE TYPE pay_type AS ENUM ('FLAT','HOURLY');
CREATE TYPE job_urgency AS ENUM ('SCHEDULED','SAME_DAY','ASAP');
CREATE TYPE assignment_source AS ENUM ('DIRECT_ACCEPT','INVITATION','APPLICATION','ADMIN');
CREATE TYPE job_review_status AS ENUM ('NONE','PENDING_REVIEW','APPROVED','REJECTED');

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id uuid NOT NULL REFERENCES users(id),
  category_id uuid NOT NULL REFERENCES categories(id),
  title text NOT NULL,
  description text NOT NULL,
  state job_state NOT NULL DEFAULT 'DRAFT',
  -- Exact location: exposed only to the owner and accepted workers.
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  region text NOT NULL,
  postal_code text NOT NULL,
  country char(2) NOT NULL DEFAULT 'US',
  location geography(Point, 4326) NOT NULL,
  -- Obfuscated (~150–350 m) location: the ONLY coordinate exposed pre-acceptance.
  approx_location geography(Point, 4326) NOT NULL,
  timezone text NOT NULL,
  urgency job_urgency NOT NULL DEFAULT 'SCHEDULED',
  scheduled_start_at timestamptz,
  estimated_duration_minutes int NOT NULL CHECK (estimated_duration_minutes BETWEEN 15 AND 1440),
  workers_needed smallint NOT NULL DEFAULT 1 CHECK (workers_needed BETWEEN 1 AND 20),
  workers_filled smallint NOT NULL DEFAULT 0 CHECK (workers_filled >= 0 AND workers_filled <= workers_needed),
  pay_type pay_type NOT NULL,
  -- FLAT: total per worker. HOURLY: rate per hour per worker. Integer minor units.
  pay_cents bigint NOT NULL CHECK (pay_cents > 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  required_equipment text[] NOT NULL DEFAULT '{}',
  physical_requirements text,
  special_instructions text,
  -- Revealed to accepted workers only.
  access_instructions text,
  review_status job_review_status NOT NULL DEFAULT 'NONE',
  review_reasons text[],
  -- Reserved for repeats/recurrence (unused in MVP):
  recurrence_rule text,
  parent_job_id uuid REFERENCES jobs(id),
  posted_at timestamptz,
  filled_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Drafts may be schedule-less; posting validates the start time in code.
  CHECK (state = 'DRAFT' OR urgency <> 'SCHEDULED' OR scheduled_start_at IS NOT NULL)
);
CREATE INDEX jobs_location_gist ON jobs USING GIST (location);
CREATE INDEX jobs_open_partial ON jobs (state, scheduled_start_at)
  WHERE state IN ('POSTED','MATCHING','PARTIALLY_FILLED');
CREATE INDEX jobs_customer_idx ON jobs (customer_user_id, created_at DESC);
CREATE INDEX jobs_category_idx ON jobs (category_id);

-- Per-worker assignments — the heart of multi-worker jobs (one row per worker).
CREATE TABLE job_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id),
  worker_user_id uuid NOT NULL REFERENCES users(id),
  state assignment_state NOT NULL DEFAULT 'ACCEPTED',
  source assignment_source NOT NULL DEFAULT 'DIRECT_ACCEPT',
  accepted_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  en_route_at timestamptz,
  arrived_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  -- Evidence, not proof (GPS is never sole source of truth).
  arrival_location geography(Point, 4326),
  earnings_cents bigint,
  currency char(3) NOT NULL DEFAULT 'USD',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (job_id, worker_user_id)
);
CREATE INDEX job_workers_worker_idx ON job_workers (worker_user_id, state);
CREATE INDEX job_workers_job_idx ON job_workers (job_id);

-- Append-only lifecycle events: the job timeline, dispute evidence, analytics feed.
CREATE TABLE job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Monotonic sequence: stable timeline ordering even within one transaction.
  seq bigint GENERATED ALWAYS AS IDENTITY,
  job_id uuid NOT NULL REFERENCES jobs(id),
  assignment_id uuid REFERENCES job_workers(id),
  actor_user_id uuid REFERENCES users(id),   -- NULL = system
  event_type text NOT NULL,
  from_state text,
  to_state text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_events_job_idx ON job_events (job_id, seq);

-- Scope protection: original job fields are immutable after posting; changes
-- are proposed, approved by every active worker, then applied + event-logged.
CREATE TABLE job_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id),
  proposed_by uuid NOT NULL REFERENCES users(id),
  -- { field: { old: ..., new: ... } }
  changes jsonb NOT NULL,
  status text NOT NULL DEFAULT 'PROPOSED'
    CHECK (status IN ('PROPOSED','APPROVED','DECLINED','CANCELLED')),
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX job_changes_job_idx ON job_changes (job_id);

CREATE TABLE job_change_approvals (
  job_change_id uuid NOT NULL REFERENCES job_changes(id),
  assignment_id uuid NOT NULL REFERENCES job_workers(id),
  decision text CHECK (decision IN ('APPROVED','DECLINED')),
  decided_at timestamptz,
  PRIMARY KEY (job_change_id, assignment_id)
);
