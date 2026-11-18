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
