-- Phases 13–14: disputes + notifications.

CREATE TABLE disputes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id),
  assignment_id uuid REFERENCES job_workers(id),
  opened_by uuid NOT NULL REFERENCES users(id),
  category text NOT NULL CHECK (category IN
    ('NOT_COMPLETED','INCOMPLETE_WORK','SCOPE_CHANGED','PAYMENT','PROPERTY_DAMAGE',
     'WORKER_BEHAVIOR','CUSTOMER_BEHAVIOR','CANCELLATION','NO_SHOW','SAFETY','FRAUD')),
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','UNDER_REVIEW','RESOLVED','CLOSED')),
  description text NOT NULL,
  resolution text CHECK (resolution IN ('RELEASE','REFUND_FULL','REFUND_PARTIAL','OTHER')),
  resolution_amount_cents bigint,
  resolution_reason text,
  resolved_by uuid REFERENCES users(id),
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX disputes_status_idx ON disputes (status, created_at);
CREATE INDEX disputes_job_idx ON disputes (job_id);

-- Evidence references immutable records; users cannot edit history.
CREATE TABLE dispute_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id uuid NOT NULL REFERENCES disputes(id),
  created_by uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('TEXT','MESSAGE_REF','EVENT_REF','PAYMENT_REF')),
  note text,
  ref_table text,
  ref_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX dispute_evidence_dispute_idx ON dispute_evidence (dispute_id);

-- Safety/behavior/fraud reports (Phase 16 foundations).
CREATE TABLE reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_user_id uuid NOT NULL REFERENCES users(id),
  reported_user_id uuid REFERENCES users(id),
  job_id uuid REFERENCES jobs(id),
  message_id uuid REFERENCES messages(id),
  category text NOT NULL CHECK (category IN
    ('UNSAFE_JOB','DANGEROUS_CONDITIONS','HARASSMENT','THREAT','UNSAFE_BEHAVIOR','FRAUD','OTHER')),
  description text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','REVIEWED','ACTIONED','DISMISSED')),
  reviewed_by uuid REFERENCES users(id),
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX reports_status_idx ON reports (status, created_at);

CREATE TABLE notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  type text NOT NULL,
  title text NOT NULL,
  body text NOT NULL,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  sent_at timestamptz,
  failed_at timestamptz
);
CREATE INDEX notifications_user_idx ON notifications (user_id, created_at DESC);
CREATE INDEX notifications_unread_idx ON notifications (user_id) WHERE read_at IS NULL;

CREATE TABLE notification_preferences (
  user_id uuid NOT NULL REFERENCES users(id),
  channel text NOT NULL CHECK (channel IN ('PUSH','EMAIL','SMS')),
  category text NOT NULL CHECK (category IN ('TRANSACTIONAL','JOB_ALERTS','MARKETING')),
  enabled boolean NOT NULL DEFAULT true,
  PRIMARY KEY (user_id, channel, category)
);

CREATE TABLE device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  platform text NOT NULL CHECK (platform IN ('ios','android')),
  token text UNIQUE NOT NULL,
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  disabled_at timestamptz
);
CREATE INDEX device_tokens_user_idx ON device_tokens (user_id);
