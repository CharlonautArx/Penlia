ALTER TABLE p1_gatherings
  ADD COLUMN description text NOT NULL DEFAULT '' CHECK (length(description)<=800),
  ADD COLUMN meeting_note text NOT NULL DEFAULT '' CHECK (length(meeting_note)<=240),
  ADD COLUMN cover bytea CHECK (octet_length(cover)<=98304),
  ADD COLUMN capacity integer CHECK (capacity BETWEEN minimum AND 30);
ALTER TABLE p1_gathering_members ADD COLUMN can_view_cover boolean NOT NULL DEFAULT false;
ALTER TABLE p1_gathering_options
  ADD COLUMN ends_at timestamptz CHECK (ends_at>starts_at),
  DROP CONSTRAINT p1_gathering_options_place_check,
  ADD CHECK (char_length(place)<=120);
ALTER TABLE p2_calendar_events ADD COLUMN gathering_id uuid REFERENCES p1_gatherings ON DELETE CASCADE,
  ADD UNIQUE(owner_id,gathering_id),
  ADD FOREIGN KEY(gathering_id,owner_id) REFERENCES p1_gathering_members(gathering_id,user_id) ON DELETE CASCADE;
GRANT DELETE ON p1_gathering_members TO penlia_app;
ALTER TABLE p1_gatherings ADD COLUMN source_item_id uuid REFERENCES p2_items ON DELETE SET NULL,
  ADD COLUMN decision text NOT NULL DEFAULT '', ADD COLUMN choices text[] NOT NULL DEFAULT '{}',
  ADD COLUMN allow_companion boolean NOT NULL DEFAULT false;
ALTER TABLE p1_gathering_members ADD COLUMN reminder_minutes integer CHECK (reminder_minutes IN (15,60,1440)),
  ADD COLUMN preparation text CHECK (preparation IN ('invited','accepted')),
  ADD COLUMN private_note text NOT NULL DEFAULT '' CHECK (length(private_note)<=240),
  ADD COLUMN answer text, ADD COLUMN waiting_at timestamptz, ADD COLUMN offered boolean NOT NULL DEFAULT false,
  ADD COLUMN companion boolean NOT NULL DEFAULT false;
ALTER TABLE p2_items ADD COLUMN quantity integer CHECK (quantity BETWEEN 1 AND 9999),
  ADD COLUMN claimed_by uuid REFERENCES users ON DELETE SET NULL;

ALTER TABLE p1_collections ADD COLUMN activity_journal boolean NOT NULL DEFAULT false;
ALTER TABLE p1_gatherings ADD COLUMN invitation boolean NOT NULL DEFAULT false;
ALTER TABLE p1_gatherings ADD COLUMN checklist_id uuid REFERENCES p2_spaces ON DELETE SET NULL;
ALTER TABLE p1_gatherings ADD COLUMN agreed_choice text;
ALTER TABLE p1_gatherings ADD COLUMN revision integer NOT NULL DEFAULT 1;
