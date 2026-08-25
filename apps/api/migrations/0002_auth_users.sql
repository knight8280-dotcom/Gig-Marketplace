-- Phase 1: users, sessions, verification, audit.
-- Enum values mirror packages/shared (roles.ts) — keep in sync.

CREATE TYPE user_role AS ENUM (
  'CUSTOMER','WORKER','ADMIN',
  'SUPPORT_AGENT','MODERATOR','BUSINESS_CUSTOMER','BUSINESS_WORKER_MANAGER'
);

CREATE TYPE user_status AS ENUM ('ACTIVE','SUSPENDED','DELETION_REQUESTED','DELETED');
CREATE TYPE verification_type AS ENUM ('EMAIL','PHONE','IDENTITY','BACKGROUND');
CREATE TYPE verification_status AS ENUM ('PENDING','PASSED','FAILED','EXPIRED');
CREATE TYPE one_time_token_type AS ENUM ('EMAIL_VERIFY','PASSWORD_RESET','PHONE_CODE');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext UNIQUE NOT NULL,
  email_verified_at timestamptz,
  phone text UNIQUE,
  phone_verified_at timestamptz,
  password_hash text NOT NULL,
  roles user_role[] NOT NULL DEFAULT '{}',
  status user_status NOT NULL DEFAULT 'ACTIVE',
  suspended_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX users_status_idx ON users (status);

-- Rotating single-use refresh tokens; reuse of a rotated token revokes the family.
CREATE TABLE refresh_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  family_id uuid NOT NULL,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);

-- Single-use expiring tokens (email verification, password reset, phone codes).
-- Only hashes are stored.
CREATE TABLE one_time_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type one_time_token_type NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  attempts int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX one_time_tokens_user_type_idx ON one_time_tokens (user_id, type);

-- Source of truth for verification badges: a badge exists only if a PASSED row exists.
CREATE TABLE verification_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type verification_type NOT NULL,
  status verification_status NOT NULL,
  provider text NOT NULL,
  provider_ref text,
  verified_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX verification_records_one_passed
  ON verification_records (user_id, type) WHERE status = 'PASSED';

-- Append-only audit log (security/finance-relevant actions).
CREATE TABLE audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id uuid REFERENCES users(id),
  actor_type text NOT NULL DEFAULT 'USER',
  action text NOT NULL,
  entity_table text,
  entity_id text,
  previous_state jsonb,
  new_state jsonb,
  reason text,
  request_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_entity_idx ON audit_logs (entity_table, entity_id);
