-- Phases 2–3: customer/worker profiles, saved addresses, agreement acceptances.

CREATE TYPE worker_transport AS ENUM ('NONE','BICYCLE','CAR','TRUCK','VAN');

CREATE TABLE customer_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  business_name text,
  business_info jsonb,
  rating_avg numeric(3,2),
  rating_count int NOT NULL DEFAULT 0,
  jobs_completed int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE worker_profiles (
  user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  bio text,
  experience text,
  transportation worker_transport[] NOT NULL DEFAULT '{}',
  equipment text[] NOT NULL DEFAULT '{}',
  languages text[] NOT NULL DEFAULT '{}',
  -- Service radius is a per-worker preference (never hardcoded): default 10 mi.
  service_radius_m int NOT NULL DEFAULT 16093 CHECK (service_radius_m BETWEEN 500 AND 160934),
  -- Matching input only. NEVER exposed through any API response (SECURITY_MODEL).
  home_location geography(Point, 4326),
  available_now boolean NOT NULL DEFAULT false,
  available_until timestamptz,          -- reserved: "available until 6 PM"
  min_pay_cents bigint,
  currency char(3) NOT NULL DEFAULT 'USD',
  rating_avg numeric(3,2),
  rating_count int NOT NULL DEFAULT 0,
  jobs_completed int NOT NULL DEFAULT 0,
  jobs_cancelled int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX worker_profiles_home_location_gist ON worker_profiles USING GIST (home_location);
CREATE INDEX worker_profiles_available_idx ON worker_profiles (available_now) WHERE available_now;

CREATE TABLE saved_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  label text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  region text NOT NULL,
  postal_code text NOT NULL,
  country char(2) NOT NULL DEFAULT 'US',
  location geography(Point, 4326) NOT NULL,
  access_notes text,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX saved_addresses_user_idx ON saved_addresses (user_id) WHERE deleted_at IS NULL;

-- Versioned records of accepted terms/safety agreements (who, what, when).
CREATE TABLE agreement_acceptances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agreement text NOT NULL,             -- e.g. TERMS_OF_SERVICE, WORKER_SAFETY
  version text NOT NULL,
  accepted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, agreement, version)
);
