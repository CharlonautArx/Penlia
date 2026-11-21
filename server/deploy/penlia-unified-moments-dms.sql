BEGIN;

SELECT CASE WHEN current_database() = 'penlia_dev' THEN '1' ELSE 'Select penlia_dev before running this migration' END::integer AS target_database_check;

SET LOCAL penlia.dms_migration = 'active';

SELECT CASE WHEN current_setting('penlia.dms_migration', true) = 'active' THEN '1' ELSE 'Execute the entire script in one database transaction' END::integer AS transaction_check;

SET LOCAL search_path TO public, pg_catalog;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(182129779);

CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY);

SELECT CASE WHEN EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '008_shared_world_p3.sql') THEN '1' ELSE 'Apply the Penlia P3 migration first' END::integer AS p3_check;

ALTER TABLE p2_status ALTER COLUMN expires_at DROP NOT NULL;

ALTER TABLE private_moments ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS private_moments_author_timeline ON private_moments(author_id,pinned DESC,created_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS moment_likes (
  moment_id uuid NOT NULL REFERENCES private_moments ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY(moment_id,user_id)
);

CREATE INDEX IF NOT EXISTS moment_likes_by_user ON moment_likes(user_id);

CREATE TABLE IF NOT EXISTS moment_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES private_moments ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(moment_id,user_id,client_id)
);

CREATE INDEX IF NOT EXISTS moment_comments_timeline ON moment_comments(moment_id,created_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS moment_comments_by_user ON moment_comments(user_id);

GRANT SELECT, INSERT, DELETE ON public.moment_likes TO penlia_app;
GRANT SELECT, INSERT ON public.moment_comments TO penlia_app;

INSERT INTO public.schema_migrations (name) VALUES ('009_unified_moments.sql') ON CONFLICT (name) DO NOTHING;

COMMIT;
