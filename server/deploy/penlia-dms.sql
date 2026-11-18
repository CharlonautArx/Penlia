BEGIN;

SET LOCAL search_path TO public, pg_catalog;

SELECT pg_advisory_xact_lock(182129779);

CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY);

DO $penlia_migration$
BEGIN
  IF NOT EXISTS (SELECT FROM schema_migrations WHERE name = '001_initial.sql') THEN
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username text NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9_]{3,24}$'),
      password_hash text NOT NULL,
      name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 16),
      bio text NOT NULL DEFAULT '' CHECK (char_length(bio) <= 60),
      created_at timestamptz NOT NULL DEFAULT now()
    );

    CREATE TABLE sessions (
      token_hash text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      expires_at timestamptz NOT NULL
    );
    CREATE INDEX sessions_expiry ON sessions (expires_at);

    CREATE TABLE friendships (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      first_user uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      second_user uuid NOT NULL REFERENCES users ON DELETE CASCADE,
      requested_by uuid NOT NULL,
      status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
      im_synced boolean NOT NULL DEFAULT false CHECK (NOT im_synced OR status = 'accepted'),
      updated_at timestamptz NOT NULL DEFAULT now(),
      UNIQUE (first_user, second_user),
      CHECK (first_user < second_user),
      CHECK (requested_by IN (first_user, second_user))
    );
    CREATE INDEX friendships_second_user ON friendships (second_user);

    CREATE TABLE rate_limits (
      key text PRIMARY KEY,
      window_start timestamptz NOT NULL,
      attempts integer NOT NULL
    );
    CREATE INDEX rate_limits_expiry ON rate_limits (window_start);
    INSERT INTO schema_migrations (name) VALUES ('001_initial.sql');
  END IF;
END;
$penlia_migration$;

GRANT CONNECT ON DATABASE penlia_dev TO penlia_app;
GRANT USAGE ON SCHEMA public TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON public.users TO penlia_app;
GRANT SELECT, INSERT, DELETE ON public.sessions TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON public.friendships TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON public.rate_limits TO penlia_app;

COMMIT;
