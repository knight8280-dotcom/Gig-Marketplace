-- Files/photos, TOTP 2FA, tip payouts.

-- Binary content lives in object/disk storage — never in Postgres.
CREATE TABLE files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES users(id),
  kind text NOT NULL CHECK (kind IN ('JOB_PHOTO','PROFILE_PHOTO','MESSAGE_IMAGE','EVIDENCE')),
  storage_key text UNIQUE NOT NULL,
  content_type text NOT NULL,
  byte_size int NOT NULL CHECK (byte_size > 0),
  sha256 text NOT NULL,
  status text NOT NULL DEFAULT 'UPLOADED' CHECK (status IN ('UPLOADED','QUARANTINED','DELETED')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX files_owner_idx ON files (owner_user_id);

CREATE TABLE job_photos (
  job_id uuid NOT NULL REFERENCES jobs(id),
  file_id uuid NOT NULL REFERENCES files(id),
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, file_id)
);

ALTER TABLE customer_profiles ADD COLUMN photo_file_id uuid REFERENCES files(id);
ALTER TABLE worker_profiles ADD COLUMN photo_file_id uuid REFERENCES files(id);

-- TOTP 2FA (mandatory for admin sign-in once enrolled; available to all users).
ALTER TABLE users ADD COLUMN totp_secret text;
ALTER TABLE users ADD COLUMN totp_enabled_at timestamptz;

-- Tips are a payout kind (no platform fee on tips — PAYMENT_MODEL).
ALTER TABLE payouts DROP CONSTRAINT payouts_kind_check;
ALTER TABLE payouts ADD CONSTRAINT payouts_kind_check
  CHECK (kind IN ('JOB_EARNINGS','CANCELLATION_COMPENSATION','TIP'));
-- One tip payout per assignment is enforced by the existing UNIQUE (assignment_id, kind).
