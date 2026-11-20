BEGIN;

SELECT CASE WHEN current_database() = 'penlia_dev' THEN '1' ELSE 'Select penlia_dev before running this migration' END::integer AS target_database_check;

SET LOCAL penlia.dms_migration = 'active';

SELECT CASE WHEN current_setting('penlia.dms_migration', true) = 'active' THEN '1' ELSE 'Execute the entire script in one database transaction' END::integer AS transaction_check;

SET LOCAL search_path TO public, pg_catalog;

SET LOCAL lock_timeout = '10s';

SELECT pg_advisory_xact_lock(182129779);

CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY);

SELECT CASE WHEN EXISTS (SELECT 1 FROM public.schema_migrations WHERE name = '003_privacy_p0.sql') THEN '1' ELSE 'Apply the Penlia P0 migration first' END::integer AS p0_check;

CREATE TABLE IF NOT EXISTS p1_group_shares (
  message_id uuid PRIMARY KEY REFERENCES chat_group_messages ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS p1_wishes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  category text NOT NULL CHECK (category IN ('food','film','travel','sports','walk','games','other')),
  description text NOT NULL CHECK (char_length(description) BETWEEN 1 AND 200),
  place text NOT NULL DEFAULT '',
  available_at timestamptz,
  budget_cents integer CHECK (budget_cents BETWEEN 0 AND 100000000),
  scope text NOT NULL CHECK (scope IN ('private','friends','selected','group')),
  group_id uuid REFERENCES relationship_groups ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (owner_id,client_id)
);

CREATE INDEX IF NOT EXISTS p1_wishes_match ON p1_wishes (category,updated_at DESC) WHERE active;

CREATE TABLE IF NOT EXISTS p1_wish_audience (
  wish_id uuid NOT NULL REFERENCES p1_wishes ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (wish_id,user_id)
);

CREATE TABLE IF NOT EXISTS p1_wish_matches (
  first_wish uuid NOT NULL REFERENCES p1_wishes ON DELETE CASCADE,
  second_wish uuid NOT NULL REFERENCES p1_wishes ON DELETE CASCADE,
  PRIMARY KEY (first_wish,second_wish),
  CHECK (first_wish < second_wish)
);

CREATE TABLE IF NOT EXISTS p1_gatherings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  category text NOT NULL,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 80),
  mode text NOT NULL CHECK (mode IN ('all','open')),
  minimum integer NOT NULL CHECK (minimum BETWEEN 2 AND 30),
  state text NOT NULL DEFAULT 'interest' CHECK (state IN ('interest','confirming','formed','completed','cancelled')),
  ballot_closed boolean NOT NULL DEFAULT false,
  suggestion_id uuid,
  choice_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,client_id)
);

CREATE TABLE IF NOT EXISTS p1_gathering_members (
  gathering_id uuid NOT NULL REFERENCES p1_gatherings ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  intention text CHECK(intention IN ('interested','undecided','unavailable')),
  votes uuid[] NOT NULL DEFAULT '{}',
  confirmed boolean NOT NULL DEFAULT false,
  PRIMARY KEY(gathering_id,user_id)
);

CREATE INDEX IF NOT EXISTS p1_gathering_member_user ON p1_gathering_members (user_id,gathering_id);

CREATE TABLE IF NOT EXISTS p1_gathering_options (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gathering_id uuid NOT NULL REFERENCES p1_gatherings ON DELETE CASCADE,
  starts_at timestamptz NOT NULL,
  place text NOT NULL CHECK(char_length(place) BETWEEN 1 AND 120)
);

CREATE INDEX IF NOT EXISTS p1_gathering_options_group ON p1_gathering_options (gathering_id,starts_at);

CREATE TABLE IF NOT EXISTS p1_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  kind text NOT NULL,
  subject_id uuid NOT NULL,
  opened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS p1_events_user ON p1_events (user_id,created_at DESC,id DESC);

CREATE TABLE IF NOT EXISTS p1_reviewers (
  user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS p1_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('boundary','harassment','threat')),
  provenance text NOT NULL CHECK (provenance IN ('group','private_pending','private_verified')),
  evidence bytea NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','dismissed','confirmed')),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  decided_at timestamptz,
  UNIQUE (reporter_id,client_id),
  CHECK (reporter_id<>subject_id)
);

CREATE INDEX IF NOT EXISTS p1_reports_queue ON p1_reports(status,submitted_at);

CREATE TABLE IF NOT EXISTS p1_enforcement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL UNIQUE REFERENCES p1_reports ON DELETE CASCADE,
  subject_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  reviewer_id uuid REFERENCES users ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('warning','limit_contact','limit_sending','limit_account')),
  reason text NOT NULL CHECK(char_length(reason) BETWEEN 1 AND 300),
  duration_hours integer NOT NULL CHECK(duration_hours BETWEEN 1 AND 720),
  execute_at timestamptz NOT NULL,
  applied_at timestamptz,
  expires_at timestamptz,
  overturned_at timestamptz
);

CREATE INDEX IF NOT EXISTS p1_enforcement_due ON p1_enforcement(execute_at) WHERE applied_at IS NULL;

CREATE INDEX IF NOT EXISTS p1_enforcement_subject ON p1_enforcement(subject_id,expires_at);

CREATE TABLE IF NOT EXISTS p1_appeals (
  enforcement_id uuid PRIMARY KEY REFERENCES p1_enforcement ON DELETE CASCADE,
  explanation bytea NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','upheld','overturned')),
  resolution text,
  submitted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p1_review_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid NOT NULL REFERENCES p1_reports ON DELETE CASCADE,
  actor_id uuid REFERENCES users ON DELETE SET NULL,
  details bytea,
  action text NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS p1_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES chat_groups ON DELETE CASCADE,
  host_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  ended_at timestamptz
);

CREATE UNIQUE INDEX IF NOT EXISTS p1_one_call_per_group ON p1_calls(group_id) WHERE ended_at IS NULL;

CREATE TABLE IF NOT EXISTS p1_call_participants (
  call_id uuid NOT NULL REFERENCES p1_calls ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  state text NOT NULL CHECK(state IN ('invited','joined','declined','left')),
  PRIMARY KEY(call_id,user_id)
);

CREATE TABLE IF NOT EXISTS p1_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  kind text NOT NULL CHECK(kind IN ('journal','collaboration')),
  title text NOT NULL CHECK(char_length(title) BETWEEN 1 AND 80),
  moment_id uuid UNIQUE REFERENCES private_moments ON DELETE SET NULL,
  gathering_id uuid UNIQUE REFERENCES p1_gatherings ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(owner_id,client_id)
);

CREATE TABLE IF NOT EXISTS p1_collection_members (
  collection_id uuid NOT NULL REFERENCES p1_collections ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  state text NOT NULL CHECK(state IN ('invited','active','declined','left','removed')),
  PRIMARY KEY(collection_id,user_id)
);

CREATE INDEX IF NOT EXISTS p1_collection_member_user ON p1_collection_members(user_id,collection_id);

CREATE TABLE IF NOT EXISTS p1_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collection_id uuid NOT NULL REFERENCES p1_collections ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  title text NOT NULL,
  category text NOT NULL,
  event_date date NOT NULL,
  UNIQUE(collection_id,author_id,client_id)
);

CREATE INDEX IF NOT EXISTS p1_entries_collection ON p1_entries(collection_id,event_date DESC,id);

CREATE TABLE IF NOT EXISTS p1_contributions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES p1_entries ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  body text NOT NULL,
  revision integer NOT NULL DEFAULT 1,
  removed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entry_id,author_id,client_id)
);

CREATE INDEX IF NOT EXISTS p1_contributions_entry ON p1_contributions(entry_id,created_at,id);

CREATE TABLE IF NOT EXISTS p1_contribution_history (
  contribution_id uuid NOT NULL REFERENCES p1_contributions ON DELETE CASCADE,
  revision integer NOT NULL,
  editor_id uuid REFERENCES users ON DELETE SET NULL,
  body text NOT NULL,
  action text NOT NULL CHECK(action IN ('created','edited','withdrawn','removed')),
  edited_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY(contribution_id,revision)
);

CREATE TABLE IF NOT EXISTS p1_contribution_media (
  media_id uuid PRIMARY KEY REFERENCES private_media ON DELETE CASCADE,
  contribution_id uuid NOT NULL REFERENCES p1_contributions ON DELETE CASCADE,
  position integer NOT NULL,
  UNIQUE(contribution_id,position)
);

GRANT SELECT, INSERT ON p1_group_shares TO penlia_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON p1_wishes TO penlia_app;
GRANT SELECT, INSERT, DELETE ON p1_wish_audience, p1_wish_matches TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON p1_gatherings, p1_gathering_members TO penlia_app;
GRANT SELECT, INSERT, DELETE ON p1_gathering_options TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON p1_events TO penlia_app;
GRANT SELECT ON p1_reviewers TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON p1_reports, p1_enforcement, p1_appeals TO penlia_app;
GRANT SELECT, INSERT ON p1_review_audit TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON p1_calls, p1_call_participants, p1_collections, p1_collection_members, p1_contributions TO penlia_app;
GRANT SELECT, INSERT ON p1_entries, p1_contribution_media TO penlia_app;
GRANT SELECT, INSERT, UPDATE ON p1_contribution_history TO penlia_app;

INSERT INTO public.schema_migrations (name) VALUES ('004_social_p1.sql') ON CONFLICT (name) DO NOTHING;

COMMIT;
