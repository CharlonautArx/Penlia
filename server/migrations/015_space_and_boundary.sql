CREATE TABLE moment_space_preferences (
  owner_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'friends' CHECK(mode IN ('friends','self','allow','deny')),
  viewers uuid[] NOT NULL DEFAULT '{}',
  history text NOT NULL DEFAULT 'all' CHECK(history IN ('all','3d','180d','custom')),
  cutoff timestamptz,
  local_date date,
  zone text,
  CHECK ((history='custom') = (cutoff IS NOT NULL AND local_date IS NOT NULL AND zone IS NOT NULL))
);

ALTER TABLE private_moments ADD COLUMN location text NOT NULL DEFAULT '' CHECK(char_length(location)<=100);
ALTER TABLE private_media ADD COLUMN thumbnail bytea CHECK(octet_length(thumbnail)<=98304);

CREATE TABLE p1_report_history_hidden (
  report_id uuid PRIMARY KEY REFERENCES p1_reports(id) ON DELETE CASCADE,
  hidden_at timestamptz NOT NULL DEFAULT now()
);
