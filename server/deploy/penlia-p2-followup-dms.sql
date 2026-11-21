BEGIN;

SELECT CASE WHEN current_database() = 'penlia_dev' THEN '1' ELSE 'Select penlia_dev before running this migration' END::integer AS target_database_check;

SET LOCAL penlia.dms_migration = 'active';

SELECT CASE WHEN current_setting('penlia.dms_migration', true) = 'active' THEN '1' ELSE 'Execute the entire script in one database transaction' END::integer AS transaction_check;

SET LOCAL search_path TO public, pg_catalog;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(182129779);

CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY);

SELECT CASE WHEN EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '006_life_p2.sql') THEN '1' ELSE 'Apply the Penlia P2 migration first' END::integer AS p2_check;

ALTER TABLE p2_items ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '';

ALTER TABLE p2_items DROP CONSTRAINT IF EXISTS p2_items_check;

ALTER TABLE p2_items DROP CONSTRAINT IF EXISTS p2_items_coordinates;

ALTER TABLE p2_items ADD CONSTRAINT p2_items_coordinates CHECK (
  (latitude IS NULL AND longitude IS NULL) OR
  (kind='place' AND latitude IS NOT NULL AND longitude IS NOT NULL
    AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)
);

INSERT INTO public.schema_migrations (name) VALUES ('007_p2_life_followup.sql') ON CONFLICT (name) DO NOTHING;

COMMIT;
