BEGIN;
ALTER TABLE users
  ADD COLUMN profile_handle text CHECK (profile_handle ~ '^[a-z0-9_]{3,24}$'),
  ADD COLUMN handle_updated_at timestamptz,
  ADD COLUMN profile_region text CHECK (char_length(profile_region) <= 24),
  ADD COLUMN profile_avatar bytea CHECK (octet_length(profile_avatar) <= 32768),
  ADD COLUMN avatar_updated_at timestamptz;
CREATE UNIQUE INDEX users_profile_handle ON users(profile_handle) WHERE profile_handle IS NOT NULL;
UPDATE users SET profile_avatar=public_intro_avatar WHERE public_intro_avatar IS NOT NULL;
COMMIT;
