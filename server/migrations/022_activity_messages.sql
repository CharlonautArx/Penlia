ALTER TABLE p1_gathering_members ADD COLUMN discussion boolean NOT NULL DEFAULT false;
CREATE TABLE p1_activity_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gathering_id uuid NOT NULL,
  author_id uuid NOT NULL,
  client_id uuid NOT NULL,
  body text NOT NULL CHECK (length(body) BETWEEN 1 AND 240),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (gathering_id,author_id,client_id),
  FOREIGN KEY (gathering_id,author_id) REFERENCES p1_gathering_members(gathering_id,user_id) ON DELETE CASCADE
);
CREATE INDEX p1_activity_messages_recent ON p1_activity_messages (gathering_id,created_at DESC,id DESC);
CREATE TABLE p1_activity_message_readers (
  message_id uuid NOT NULL REFERENCES p1_activity_messages ON DELETE CASCADE,
  gathering_id uuid NOT NULL,
  viewer_id uuid NOT NULL,
  PRIMARY KEY (message_id,viewer_id),
  FOREIGN KEY (gathering_id,viewer_id) REFERENCES p1_gathering_members(gathering_id,user_id) ON DELETE CASCADE
);
GRANT SELECT,INSERT,DELETE ON p1_activity_messages,p1_activity_message_readers TO penlia_app;
