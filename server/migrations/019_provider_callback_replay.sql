CREATE TABLE IF NOT EXISTS provider_callback_checks (
  call_hash text PRIMARY KEY,
  fingerprint text NOT NULL,
  expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS provider_callback_checks_expiry ON provider_callback_checks (expires_at);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE provider_callback_checks TO penlia_app;
