BEGIN;
SELECT CASE WHEN current_database() IN ('penlia_dev', 'penlia_phone_test')
  THEN '1' ELSE 'Select the approved Penlia database' END::integer AS target_database_check;
SET LOCAL penlia.phone_migration = 'active';
SELECT CASE WHEN current_setting('penlia.phone_migration', true) = 'active'
  THEN '1' ELSE 'Execute in a single transaction' END::integer AS transaction_check;
SET LOCAL lock_timeout = '10s';
SET LOCAL search_path TO public, pg_catalog;
SELECT pg_advisory_xact_lock(182129779);

CREATE TABLE IF NOT EXISTS phone_auth_control (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  daily_count integer NOT NULL DEFAULT 60 CHECK (daily_count > 0),
  daily_micros bigint NOT NULL DEFAULT 3000000 CHECK (daily_micros > 0),
  unit_floor_micros bigint NOT NULL DEFAULT 50000 CHECK (unit_floor_micros > 0),
  captcha_checks integer NOT NULL DEFAULT 100 CHECK (captcha_checks > 0),
  challenge_count integer NOT NULL DEFAULT 150 CHECK (challenge_count > 0),
  monthly_warning_micros bigint NOT NULL DEFAULT 30000000 CHECK (monthly_warning_micros > 0)
);

INSERT INTO phone_auth_control (id, enabled) VALUES (true, false) ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS phone_identities (
  phone_key text PRIMARY KEY,
  user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  verified_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS phone_challenges (
  id uuid PRIMARY KEY,
  phone_key text NOT NULL,
  context_key text NOT NULL,
  ip_key text NOT NULL,
  device_key text NOT NULL,
  created_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz
);
CREATE INDEX IF NOT EXISTS phone_challenges_created ON phone_challenges (created_at);

CREATE TABLE IF NOT EXISTS phone_captcha_checks (
  proof_key text PRIMARY KEY,
  attested_key text UNIQUE,
  created_at timestamptz NOT NULL,
  outcome text NOT NULL DEFAULT 'requested' CHECK (outcome IN ('requested', 'failed', 'verified'))
);
CREATE INDEX IF NOT EXISTS phone_captcha_created ON phone_captcha_checks (created_at);

CREATE TABLE IF NOT EXISTS phone_sms_attempts (
  id uuid PRIMARY KEY,
  phone_key text NOT NULL,
  context_key text NOT NULL,
  ip_key text NOT NULL,
  device_key text NOT NULL,
  created_at timestamptz NOT NULL,
  send_status text NOT NULL DEFAULT 'reserved' CHECK (send_status IN ('reserved', 'accepted', 'rejected', 'unknown')),
  delivery_status text NOT NULL DEFAULT 'unreported' CHECK (delivery_status IN ('unreported', 'delivered', 'failed')),
  provider_ref text,
  reserved_micros bigint NOT NULL CHECK (reserved_micros > 0),
  billed_micros bigint CHECK (billed_micros >= 0),
  code_mac text,
  expires_at timestamptz NOT NULL,
  failures integer NOT NULL DEFAULT 0 CHECK (failures BETWEEN 0 AND 5),
  verified_at timestamptz
);
CREATE INDEX IF NOT EXISTS phone_sms_created ON phone_sms_attempts (created_at);
CREATE INDEX IF NOT EXISTS phone_sms_phone_created ON phone_sms_attempts (phone_key, created_at);

CREATE TABLE IF NOT EXISTS phone_onboarding (
  token_key text PRIMARY KEY,
  phone_key text NOT NULL,
  context_key text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz
);
CREATE INDEX IF NOT EXISTS phone_onboarding_phone ON phone_onboarding (phone_key);

CREATE TABLE IF NOT EXISTS phone_budget_alerts (
  month_start date PRIMARY KEY,
  created_at timestamptz NOT NULL,
  reserved_micros bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS phone_risk_windows (
  action_key text PRIMARY KEY,
  started_at timestamptz NOT NULL,
  attempts integer NOT NULL CHECK (attempts > 0)
);
CREATE INDEX IF NOT EXISTS phone_risk_started ON phone_risk_windows (started_at);

COMMIT;
