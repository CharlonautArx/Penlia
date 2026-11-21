ALTER TABLE p2_status ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE private_moments ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;
CREATE INDEX private_moments_author_timeline ON private_moments(author_id,pinned DESC,created_at DESC,id DESC);

CREATE TABLE moment_likes (
  moment_id uuid NOT NULL REFERENCES private_moments ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY(moment_id,user_id)
);
CREATE INDEX moment_likes_by_user ON moment_likes(user_id);

CREATE TABLE moment_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES private_moments ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  client_id uuid NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(moment_id,user_id,client_id)
);
CREATE INDEX moment_comments_timeline ON moment_comments(moment_id,created_at DESC,id DESC);
CREATE INDEX moment_comments_by_user ON moment_comments(user_id);
