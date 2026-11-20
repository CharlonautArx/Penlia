CREATE TABLE privacy_preferences (
  user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  add_policy text NOT NULL DEFAULT 'anyone' CHECK (add_policy IN ('anyone', 'none')),
  phone_search boolean NOT NULL DEFAULT false,
  group_policy text NOT NULL DEFAULT 'friends' CHECK (group_policy IN ('friends', 'none')),
  profile_policy text NOT NULL DEFAULT 'friends' CHECK (profile_policy IN ('friends', 'private')),
  status_policy text NOT NULL DEFAULT 'private' CHECK (status_policy IN ('friends', 'private')),
  moment_scope text NOT NULL DEFAULT 'private' CHECK (moment_scope IN ('private', 'friends', 'circle')),
  zone text NOT NULL DEFAULT 'Asia/Shanghai',
  quiet_hours jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(quiet_hours) = 'object'),
  mute_until timestamptz,
  mute_indefinitely boolean NOT NULL DEFAULT false,
  show_resting boolean NOT NULL DEFAULT false,
  allow_silent boolean NOT NULL DEFAULT true,
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE contact_blocks (
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  other_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, other_id),
  CHECK (user_id <> other_id)
);

CREATE TABLE contact_restrictions (
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  other_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, other_id),
  CHECK (user_id <> other_id)
);

CREATE TABLE friend_notes (
  friendship_id uuid PRIMARY KEY REFERENCES friendships(id) ON DELETE CASCADE ON UPDATE CASCADE,
  note text NOT NULL CHECK (char_length(note) <= 100)
);

CREATE TABLE friend_codes (
  user_id uuid PRIMARY KEY REFERENCES users ON DELETE CASCADE,
  code_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE relationship_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 32),
  circle boolean NOT NULL DEFAULT false
);
CREATE UNIQUE INDEX relationship_groups_circle ON relationship_groups (owner_id) WHERE circle;
CREATE INDEX relationship_groups_owner ON relationship_groups (owner_id);

CREATE TABLE relationship_group_members (
  group_id uuid NOT NULL REFERENCES relationship_groups ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE TABLE priority_contacts (
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  other_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (user_id, other_id),
  CHECK (user_id <> other_id)
);

CREATE TABLE p0_devices (
  token_hash text PRIMARY KEY REFERENCES sessions ON DELETE CASCADE,
  nickname text NOT NULL CHECK (char_length(nickname) <= 40),
  first_seen timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE privacy_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('export', 'delete_account')),
  status text NOT NULL DEFAULT 'requested' CHECK (status IN ('requested', 'processing', 'completed', 'cancelled')),
  requested_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX privacy_requests_open ON privacy_requests (user_id, kind) WHERE status IN ('requested', 'processing');

CREATE TABLE chat_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 32),
  members_can_invite boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE chat_group_members (
  group_id uuid NOT NULL REFERENCES chat_groups ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);
CREATE INDEX chat_group_members_user ON chat_group_members (user_id, group_id);

CREATE TABLE chat_group_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES chat_groups ON DELETE CASCADE,
  inviter_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  invitee_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  code_hash text UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  UNIQUE (group_id, invitee_id),
  CHECK (inviter_id <> invitee_id)
);
CREATE INDEX chat_group_invites_inbox ON chat_group_invites (invitee_id, status, expires_at);

CREATE TABLE chat_group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES chat_groups ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  content text NOT NULL CHECK (char_length(content) <= 1000),
  silent boolean NOT NULL DEFAULT false,
  sent_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (group_id, sender_id, client_id)
);
CREATE INDEX chat_group_messages_page ON chat_group_messages (group_id, sent_at DESC, id DESC);

CREATE TABLE private_moments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  scope text NOT NULL CHECK (scope IN ('private', 'friends', 'circle', 'group', 'selected')),
  audience_group uuid REFERENCES relationship_groups ON DELETE SET NULL,
  revision integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  edited_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (author_id, client_id)
);
CREATE INDEX private_moments_page ON private_moments (created_at DESC, id DESC);
CREATE INDEX private_moments_author ON private_moments (author_id, created_at DESC);

CREATE TABLE private_moment_viewers (
  moment_id uuid NOT NULL REFERENCES private_moments ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (moment_id, user_id)
);

CREATE TABLE private_media (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  moment_id uuid REFERENCES private_moments ON DELETE CASCADE,
  group_message_id uuid REFERENCES chat_group_messages ON DELETE CASCADE,
  mime text NOT NULL CHECK (mime IN ('image/jpeg', 'image/png', 'video/mp4')),
  data bytea NOT NULL CHECK (octet_length(data) BETWEEN 16 AND 4194304),
  position integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (moment_id, position),
  UNIQUE (group_message_id, position),
  UNIQUE (owner_id, client_id),
  CHECK (num_nonnulls(moment_id, group_message_id) <= 1),
  CHECK ((moment_id IS NULL AND group_message_id IS NULL) = (position IS NULL))
);
CREATE INDEX private_media_owner ON private_media (owner_id, created_at);
