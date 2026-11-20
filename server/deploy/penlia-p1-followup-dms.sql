BEGIN;

SELECT CASE WHEN current_database() = 'penlia_dev' THEN '1' ELSE 'Select penlia_dev before running this migration' END::integer AS target_database_check;

SET LOCAL penlia.dms_migration = 'active';

SELECT CASE WHEN current_setting('penlia.dms_migration', true) = 'active' THEN '1' ELSE 'Execute the entire script in one database transaction' END::integer AS transaction_check;

SET LOCAL search_path TO public, pg_catalog;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(182129779);

CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY);

SELECT CASE WHEN EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '004_social_p1.sql') THEN '1' ELSE 'Apply the first Penlia P1 migration' END::integer AS p1_check;

CREATE TABLE IF NOT EXISTS p1_contribution_workspace_readers (
  contribution_id uuid NOT NULL REFERENCES p1_contributions ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (contribution_id,viewer_id)
);

CREATE TABLE IF NOT EXISTS p1_contribution_public_readers (
  contribution_id uuid NOT NULL REFERENCES p1_contributions ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  moment_id uuid NOT NULL REFERENCES private_moments ON DELETE CASCADE,
  PRIMARY KEY (contribution_id,viewer_id,moment_id)
);

CREATE INDEX IF NOT EXISTS p1_contribution_readers_moment ON p1_contribution_public_readers (moment_id,viewer_id);

CREATE TABLE IF NOT EXISTS p1_report_media (
  report_id uuid NOT NULL REFERENCES p1_reports ON DELETE CASCADE,
  media_id uuid NOT NULL,
  mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','video/mp4')),
  bytes integer NOT NULL CHECK(bytes BETWEEN 16 AND 4194304),
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  sealed_data bytea NOT NULL,
  PRIMARY KEY (report_id,media_id)
);

UPDATE p1_enforcement AS e
SET execute_at=r.decided_at+make_interval(secs=>86400+floor(random()*518401)::integer)
FROM p1_reports r
WHERE r.id=e.report_id AND r.status='confirmed' AND r.kind<>'threat' AND r.decided_at IS NOT NULL
  AND e.applied_at IS NULL AND e.overturned_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM schema_migrations WHERE name='005_p1_privacy_followup.sql');

GRANT SELECT, INSERT, DELETE ON p1_contribution_workspace_readers, p1_contribution_public_readers TO penlia_app;
GRANT SELECT, INSERT ON p1_report_media TO penlia_app;

INSERT INTO public.schema_migrations (name) VALUES ('005_p1_privacy_followup.sql') ON CONFLICT (name) DO NOTHING;

COMMIT;
