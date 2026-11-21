BEGIN;

SELECT CASE WHEN current_database() = 'penlia_dev' THEN '1' ELSE 'Select penlia_dev before running this migration' END::integer AS target_database_check;

SET LOCAL penlia.dms_migration = 'active';

SELECT CASE WHEN current_setting('penlia.dms_migration', true) = 'active' THEN '1' ELSE 'Execute the entire script in one database transaction' END::integer AS transaction_check;

SET LOCAL search_path TO public, pg_catalog;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(182129779);

CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY);

SELECT CASE WHEN EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '007_p2_life_followup.sql') THEN '1' ELSE 'Apply the Penlia P2 followup first' END::integer AS p2_followup_check;

CREATE TABLE IF NOT EXISTS p3_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('relay','world')),
  title text NOT NULL,
  event_day date,
  scene text NOT NULL DEFAULT 'garden' CHECK (scene IN ('garden','coast','night')),
  pet_name text NOT NULL DEFAULT '小光',
  greeted_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  roster_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,client_id),
  CHECK ((kind='relay')=(event_day IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS p3_members (
  space_id uuid NOT NULL REFERENCES p3_spaces ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('invited','active','declined','left','removed')),
  PRIMARY KEY(space_id,user_id)
);

CREATE INDEX IF NOT EXISTS p3_members_by_user ON p3_members(user_id,state,space_id);

CREATE TABLE IF NOT EXISTS p3_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES p3_spaces ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('contribution','link','decoration')),
  body text NOT NULL DEFAULT '',
  icon text CHECK (icon IN ('flower','lamp','cushion','frame','shell','star')),
  x integer CHECK (x BETWEEN 0 AND 3),
  y integer CHECK (y BETWEEN 0 AND 2),
  source_kind text CHECK (source_kind IN ('journal','collaboration','album','trip','capsule','memory','relay','world')),
  source_id uuid,
  removed_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(author_id,client_id),
  CHECK ((source_id IS NULL)=(source_kind IS NULL)),
  CHECK (kind<>'link' OR removed_at IS NOT NULL OR source_id IS NOT NULL),
  CHECK (kind<>'contribution' OR source_id IS NULL),
  CHECK (removed_at IS NOT NULL OR (kind='decoration' AND icon IS NOT NULL AND x IS NOT NULL AND y IS NOT NULL)
    OR (kind<>'decoration' AND icon IS NULL AND x IS NULL AND y IS NULL))
);

CREATE INDEX IF NOT EXISTS p3_records_by_space ON p3_records(space_id,created_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS p3_records_by_author ON p3_records(author_id,created_at DESC,id DESC);

CREATE INDEX IF NOT EXISTS p3_records_by_source ON p3_records(source_kind,source_id) WHERE source_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS p3_record_viewers (
  record_id uuid NOT NULL REFERENCES p3_records ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY(record_id,viewer_id)
);

CREATE INDEX IF NOT EXISTS p3_viewers_by_user ON p3_record_viewers(viewer_id,record_id);

CREATE TABLE IF NOT EXISTS p3_media (
  media_id uuid PRIMARY KEY REFERENCES private_media ON DELETE CASCADE,
  record_id uuid NOT NULL REFERENCES p3_records ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 6),
  UNIQUE(record_id,position)
);

ALTER TABLE p2_memories DROP CONSTRAINT IF EXISTS p2_memories_source_kind_check;

ALTER TABLE p2_memories ADD CONSTRAINT p2_memories_source_kind_check
  CHECK (source_kind IN ('gathering','journal','moment','trip','capsule','relay','birthday'));

GRANT SELECT, INSERT, UPDATE ON p3_spaces, p3_members TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON p3_records TO penlia_app;
GRANT SELECT, INSERT, DELETE ON p3_record_viewers, p3_media TO penlia_app;

INSERT INTO public.schema_migrations (name) VALUES ('008_shared_world_p3.sql') ON CONFLICT (name) DO NOTHING;

COMMIT;
