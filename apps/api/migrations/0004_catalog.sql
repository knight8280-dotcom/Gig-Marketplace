-- Phase 4: skills, categories, worker selections, availability windows,
-- platform settings, restricted-term screening, fee configuration.

CREATE TABLE skills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  icon text,
  -- Categories are reviewed before enablement (TRUST_AND_SAFETY).
  enabled boolean NOT NULL DEFAULT false,
  min_worker_age smallint,
  requires_identity_verification boolean NOT NULL DEFAULT false,
  requires_background_check boolean NOT NULL DEFAULT false,
  requires_insurance boolean NOT NULL DEFAULT false,
  requires_disclosures boolean NOT NULL DEFAULT false,
  disclosure_text text,
  max_duration_minutes int,
  safety_notes text,
  required_equipment text[] NOT NULL DEFAULT '{}',
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE worker_skills (
  worker_user_id uuid NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,
  skill_id uuid NOT NULL REFERENCES skills(id) ON DELETE CASCADE,
  PRIMARY KEY (worker_user_id, skill_id)
);

CREATE TABLE worker_categories (
  worker_user_id uuid NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  PRIMARY KEY (worker_user_id, category_id)
);

-- Weekly availability windows (minutes from local midnight, IANA timezone).
CREATE TABLE worker_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  worker_user_id uuid NOT NULL REFERENCES worker_profiles(user_id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6),
  start_minute smallint NOT NULL CHECK (start_minute BETWEEN 0 AND 1439),
  end_minute smallint NOT NULL CHECK (end_minute BETWEEN 1 AND 1440),
  timezone text NOT NULL,
  CHECK (end_minute > start_minute)
);
CREATE INDEX worker_availability_worker_idx ON worker_availability (worker_user_id);

-- Configurable platform settings — no business constants hardcoded in code.
CREATE TABLE platform_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL,
  updated_by uuid REFERENCES users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Restricted-work screening patterns: BLOCK stops posting, REVIEW routes to admin queue.
CREATE TABLE restricted_terms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pattern text NOT NULL,               -- case-insensitive regex
  kind text NOT NULL CHECK (kind IN ('BLOCK','REVIEW')),
  reason text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Fee configuration history; every payment references the row it used.
CREATE TABLE platform_fees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  percent_bps int NOT NULL CHECK (percent_bps BETWEEN 0 AND 10000),
  fixed_cents bigint NOT NULL DEFAULT 0 CHECK (fixed_cents >= 0),
  currency char(3) NOT NULL DEFAULT 'USD',
  category_id uuid REFERENCES categories(id),
  active_from timestamptz NOT NULL DEFAULT now(),
  active_to timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_fees_active_idx ON platform_fees (category_id, active_from);
