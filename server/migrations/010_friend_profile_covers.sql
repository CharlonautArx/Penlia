CREATE TABLE friend_profile_covers (
  owner_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  jpeg bytea NOT NULL CHECK (octet_length(jpeg) BETWEEN 16 AND 524288)
);
