CREATE TABLE peer_send_receipts (
  message_id text PRIMARY KEY CHECK (length(message_id) BETWEEN 1 AND 128),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL,
  CHECK (sender_id<>peer_id)
);
CREATE INDEX peer_send_receipts_expiry ON peer_send_receipts(sent_at);
CREATE TABLE peer_recalls (
  sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  message_id text NOT NULL UNIQUE CHECK (length(message_id) BETWEEN 1 AND 128),
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  peer_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL,
  CHECK (sender_id<>peer_id)
);
CREATE INDEX peer_recalls_sender ON peer_recalls(sender_id,sequence);
CREATE INDEX peer_recalls_recipient ON peer_recalls(peer_id,sequence);
ALTER TABLE chat_group_messages ADD COLUMN recalled_at timestamptz;
