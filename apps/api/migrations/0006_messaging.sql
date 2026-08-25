-- Phase 9: job-scoped messaging + blocking.

CREATE TABLE conversations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id),
  customer_user_id uuid NOT NULL REFERENCES users(id),
  worker_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  UNIQUE (job_id, worker_user_id)
);
CREATE INDEX conversations_customer_idx ON conversations (customer_user_id);
CREATE INDEX conversations_worker_idx ON conversations (worker_user_id);

CREATE TABLE messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  seq bigint GENERATED ALWAYS AS IDENTITY,
  conversation_id uuid NOT NULL REFERENCES conversations(id),
  sender_user_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  read_at timestamptz,
  reported_at timestamptz,
  -- Moderation hides content pending review; never hard-deleted (evidence).
  hidden_at timestamptz
);
CREATE INDEX messages_conversation_idx ON messages (conversation_id, seq DESC);

CREATE TABLE user_blocks (
  blocker_user_id uuid NOT NULL REFERENCES users(id),
  blocked_user_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (blocker_user_id, blocked_user_id),
  CHECK (blocker_user_id <> blocked_user_id)
);
