ALTER TABLE private_media DROP CONSTRAINT private_media_data_check;
ALTER TABLE private_media ADD CONSTRAINT private_media_data_check
  CHECK (octet_length(data) BETWEEN 16 AND CASE WHEN mime='video/mp4' THEN 20971520 ELSE 4194304 END);

ALTER TABLE friendships ADD COLUMN requested_at timestamptz;
UPDATE friendships SET requested_at=updated_at WHERE requested_at IS NULL;
ALTER TABLE friendships ALTER COLUMN requested_at SET DEFAULT now();
ALTER TABLE friendships ALTER COLUMN requested_at SET NOT NULL;
