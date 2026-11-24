CREATE TABLE chat_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peer_id uuid REFERENCES users(id) ON DELETE CASCADE,
  group_id uuid REFERENCES chat_groups(id) ON DELETE CASCADE,
  client_id uuid NOT NULL,
  lines jsonb NOT NULL CHECK (jsonb_typeof(lines) = 'array' AND jsonb_array_length(lines) BETWEEN 1 AND 30),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (peer_id IS NULL OR group_id IS NULL),
  UNIQUE(owner_id,client_id)
);
ALTER TABLE private_media ADD COLUMN chat_record_id uuid REFERENCES chat_records(id) ON DELETE CASCADE;
CREATE INDEX private_media_chat_record ON private_media(chat_record_id) WHERE chat_record_id IS NOT NULL;
ALTER TABLE p2_items ADD COLUMN chat_record_id uuid REFERENCES chat_records(id) ON DELETE SET NULL;
ALTER TABLE chat_group_messages ADD COLUMN reply_to uuid REFERENCES chat_group_messages(id) ON DELETE SET NULL;
ALTER TABLE chat_group_messages ADD COLUMN chat_record_id uuid REFERENCES chat_records(id) ON DELETE SET NULL;
