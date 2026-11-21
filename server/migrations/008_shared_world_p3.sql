CREATE TABLE p3_spaces (
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
CREATE TABLE p3_members (
  space_id uuid NOT NULL REFERENCES p3_spaces ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  state text NOT NULL CHECK (state IN ('invited','active','declined','left','removed')),
  PRIMARY KEY(space_id,user_id)
);
CREATE INDEX p3_members_by_user ON p3_members(user_id,state,space_id);
CREATE TABLE p3_records (
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
CREATE INDEX p3_records_by_space ON p3_records(space_id,created_at DESC,id DESC);
CREATE INDEX p3_records_by_author ON p3_records(author_id,created_at DESC,id DESC);
CREATE INDEX p3_records_by_source ON p3_records(source_kind,source_id) WHERE source_id IS NOT NULL;
CREATE TABLE p3_record_viewers (
  record_id uuid NOT NULL REFERENCES p3_records ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY(record_id,viewer_id)
);
CREATE INDEX p3_viewers_by_user ON p3_record_viewers(viewer_id,record_id);
CREATE TABLE p3_media (
  media_id uuid PRIMARY KEY REFERENCES private_media ON DELETE CASCADE,
  record_id uuid NOT NULL REFERENCES p3_records ON DELETE CASCADE,
  position integer NOT NULL CHECK (position BETWEEN 1 AND 6),
  UNIQUE(record_id,position)
);
ALTER TABLE p2_memories DROP CONSTRAINT IF EXISTS p2_memories_source_kind_check;
ALTER TABLE p2_memories ADD CONSTRAINT p2_memories_source_kind_check
  CHECK (source_kind IN ('gathering','journal','moment','trip','capsule','relay','birthday'));
