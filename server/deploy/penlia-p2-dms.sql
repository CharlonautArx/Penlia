BEGIN;

SELECT CASE WHEN current_database() = 'penlia_dev' THEN '1' ELSE 'Select penlia_dev before running this migration' END::integer AS target_database_check;

SET LOCAL penlia.dms_migration = 'active';

SELECT CASE WHEN current_setting('penlia.dms_migration', true) = 'active' THEN '1' ELSE 'Execute the entire script in one database transaction' END::integer AS transaction_check;

SET LOCAL search_path TO public, pg_catalog;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(182129779);

CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY);

SELECT CASE WHEN EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '005_p1_privacy_followup.sql') THEN '1' ELSE 'Apply the Penlia P1 privacy followup' END::integer AS p1_followup_check;

CREATE TABLE IF NOT EXISTS p2_calendar_shares (
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  access text NOT NULL CHECK (access IN ('busy','detail')),
  accepted boolean NOT NULL DEFAULT false,
  PRIMARY KEY (owner_id,viewer_id),
  CHECK (owner_id<>viewer_id)
);

CREATE INDEX IF NOT EXISTS p2_calendar_by_viewer ON p2_calendar_shares (viewer_id,owner_id);

CREATE TABLE IF NOT EXISTS p2_calendar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  title text NOT NULL,
  details text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  visibility text NOT NULL CHECK (visibility IN ('private','busy','detail')),
  revision integer NOT NULL DEFAULT 1,
  UNIQUE (owner_id,client_id),
  CHECK (ends_at>starts_at)
);

CREATE INDEX IF NOT EXISTS p2_calendar_slots ON p2_calendar_events (owner_id,starts_at,ends_at);

CREATE TABLE IF NOT EXISTS p2_spaces (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('trip','list','map','capsule')),
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id,client_id)
);

CREATE TABLE IF NOT EXISTS p2_members (
  space_id uuid NOT NULL REFERENCES p2_spaces ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('invited','active','declined','left','removed')),
  PRIMARY KEY (space_id,user_id)
);

CREATE INDEX IF NOT EXISTS p2_member_spaces ON p2_members (user_id,space_id);

CREATE TABLE IF NOT EXISTS p2_trips (
  space_id uuid PRIMARY KEY REFERENCES p2_spaces ON DELETE CASCADE,
  gathering_id uuid UNIQUE REFERENCES p1_gatherings ON DELETE SET NULL,
  destination text NOT NULL,
  start_day date NOT NULL,
  end_day date NOT NULL,
  journal_id uuid REFERENCES p1_collections ON DELETE SET NULL,
  completed_at timestamptz,
  revision integer NOT NULL DEFAULT 1,
  CHECK (end_day>=start_day)
);

CREATE TABLE IF NOT EXISTS p2_trip_agreements (
  space_id uuid NOT NULL REFERENCES p2_trips ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (space_id,user_id)
);

CREATE TABLE IF NOT EXISTS p2_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  title text NOT NULL,
  event_day date NOT NULL,
  source_kind text NOT NULL CHECK (source_kind IN ('gathering','journal','moment','trip','capsule','birthday')),
  source_id uuid,
  UNIQUE (owner_id,client_id),
  CHECK ((source_id IS NULL)=(source_kind='birthday'))
);

CREATE INDEX IF NOT EXISTS p2_memory_by_owner ON p2_memories (owner_id,event_day);

CREATE TABLE IF NOT EXISTS p2_memory_viewers (
  memory_id uuid NOT NULL REFERENCES p2_memories ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (memory_id,viewer_id)
);

CREATE INDEX IF NOT EXISTS p2_memory_by_viewer ON p2_memory_viewers (viewer_id,memory_id);

CREATE TABLE IF NOT EXISTS p2_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('saved','place')),
  space_id uuid REFERENCES p2_spaces ON DELETE CASCADE,
  title text NOT NULL,
  category text NOT NULL,
  notes text NOT NULL DEFAULT '',
  location text NOT NULL DEFAULT '',
  tags text[] NOT NULL DEFAULT '{}',
  state text NOT NULL CHECK (state IN ('want','visited','done','recommended')),
  scope text NOT NULL CHECK (scope IN ('private','space','selected','group')),
  audience_group uuid REFERENCES relationship_groups ON DELETE SET NULL,
  source_url text,
  external_provider text,
  external_item_id text,
  latitude double precision,
  longitude double precision,
  wish_id uuid REFERENCES p1_wishes ON DELETE SET NULL,
  trip_id uuid REFERENCES p2_trips ON DELETE SET NULL,
  memory_id uuid REFERENCES p2_memories ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,client_id),
  CHECK ((latitude IS NOT NULL AND longitude IS NOT NULL)=(kind='place')),
  CHECK (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180 OR latitude IS NULL AND longitude IS NULL)
);

CREATE INDEX IF NOT EXISTS p2_items_space ON p2_items (space_id,created_at DESC,id);

CREATE INDEX IF NOT EXISTS p2_items_owner ON p2_items (owner_id,kind,created_at DESC,id);

CREATE TABLE IF NOT EXISTS p2_item_viewers (
  item_id uuid NOT NULL REFERENCES p2_items ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (item_id,viewer_id)
);

CREATE INDEX IF NOT EXISTS p2_item_by_viewer ON p2_item_viewers (viewer_id,item_id);

CREATE TABLE IF NOT EXISTS p2_itinerary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES p2_trips ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  title text NOT NULL,
  category text NOT NULL CHECK (category IN ('sight','food','stay','transit','other')),
  details text NOT NULL DEFAULT '',
  source_url text,
  saved_item_id uuid REFERENCES p2_items ON DELETE SET NULL,
  event_day date NOT NULL,
  position integer NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  UNIQUE (space_id,author_id,client_id)
);

CREATE INDEX IF NOT EXISTS p2_itinerary_order ON p2_itinerary (space_id,event_day,position,id);

CREATE TABLE IF NOT EXISTS p2_itinerary_votes (
  item_id uuid NOT NULL REFERENCES p2_itinerary ON DELETE CASCADE,
  voter_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  prefer boolean NOT NULL,
  PRIMARY KEY (item_id,voter_id)
);

CREATE TABLE IF NOT EXISTS p2_capsules (
  space_id uuid PRIMARY KEY REFERENCES p2_spaces ON DELETE CASCADE,
  opens_at timestamptz NOT NULL,
  sealed_at timestamptz
);

CREATE TABLE IF NOT EXISTS p2_capsule_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES p2_capsules ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  body text NOT NULL DEFAULT '',
  revision integer NOT NULL DEFAULT 1,
  UNIQUE (space_id,author_id)
);

CREATE INDEX IF NOT EXISTS p2_capsule_by_author ON p2_capsule_entries (author_id,space_id);

CREATE TABLE IF NOT EXISTS p2_capsule_audio (
  entry_id uuid PRIMARY KEY REFERENCES p2_capsule_entries ON DELETE CASCADE,
  mime text NOT NULL CHECK (mime IN ('audio/mp4','audio/mpeg','audio/wav')),
  data bytea NOT NULL CHECK (octet_length(data) BETWEEN 16 AND 2097152)
);

CREATE TABLE IF NOT EXISTS p2_status (
  user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  caption text NOT NULL,
  emoji text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('private','selected','friends')),
  expires_at timestamptz NOT NULL,
  revision integer NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS p2_status_viewers (
  user_id uuid NOT NULL REFERENCES p2_status ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (user_id,viewer_id)
);

CREATE TABLE IF NOT EXISTS p2_assets (
  media_id uuid PRIMARY KEY REFERENCES private_media ON DELETE CASCADE,
  item_id uuid REFERENCES p2_items ON DELETE CASCADE,
  itinerary_id uuid REFERENCES p2_itinerary ON DELETE CASCADE,
  entry_id uuid REFERENCES p2_capsule_entries ON DELETE CASCADE,
  status_id uuid REFERENCES p2_status ON DELETE CASCADE,
  position integer NOT NULL,
  CHECK (num_nonnulls(item_id,itinerary_id,entry_id,status_id)=1),
  UNIQUE (item_id,position),
  UNIQUE (itinerary_id,position),
  UNIQUE (entry_id,position),
  UNIQUE (status_id,position)
);

CREATE TABLE IF NOT EXISTS p2_memory_settings (
  user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  frequency text NOT NULL CHECK (frequency IN ('off','monthly','anniversary','standard'))
);

CREATE TABLE IF NOT EXISTS p2_reminders (
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('memory','capsule')),
  subject_id uuid NOT NULL,
  due_day date NOT NULL,
  read_at timestamptz,
  month_bucket date,
  UNIQUE (user_id,month_bucket),
  PRIMARY KEY (user_id,kind,subject_id,due_day)
);

CREATE INDEX IF NOT EXISTS p2_reminders_user_day ON p2_reminders (user_id,due_day DESC);

GRANT SELECT,INSERT,UPDATE,DELETE ON p2_calendar_shares,p2_calendar_events,p2_spaces,p2_members,p2_trips,p2_trip_agreements,p2_itinerary,p2_itinerary_votes,p2_items,p2_item_viewers,p2_capsules,p2_capsule_entries,p2_capsule_audio,p2_status,p2_status_viewers,p2_assets,p2_memories,p2_memory_viewers,p2_memory_settings,p2_reminders TO penlia_app;

INSERT INTO public.schema_migrations (name) VALUES ('006_life_p2.sql') ON CONFLICT (name) DO NOTHING;

COMMIT;
