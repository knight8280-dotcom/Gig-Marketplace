-- Phase 11: two-sided double-blind ratings.

CREATE TABLE ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL REFERENCES jobs(id),
  assignment_id uuid NOT NULL REFERENCES job_workers(id),
  rater_user_id uuid NOT NULL REFERENCES users(id),
  ratee_user_id uuid NOT NULL REFERENCES users(id),
  direction text NOT NULL CHECK (direction IN ('CUSTOMER_TO_WORKER','WORKER_TO_CUSTOMER')),
  overall smallint NOT NULL CHECK (overall BETWEEN 1 AND 5),
  reliability smallint CHECK (reliability BETWEEN 1 AND 5),
  communication smallint CHECK (communication BETWEEN 1 AND 5),
  professionalism smallint CHECK (professionalism BETWEEN 1 AND 5),
  accuracy smallint CHECK (accuracy BETWEEN 1 AND 5),
  comment text CHECK (comment IS NULL OR length(comment) <= 2000),
  -- Double-blind: set when both directions exist; otherwise ratings become
  -- visible after the configured blind window (checked at read time).
  visible_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (assignment_id, direction)
);
CREATE INDEX ratings_ratee_idx ON ratings (ratee_user_id);
