ALTER TABLE private_moments ADD COLUMN IF NOT EXISTS allow_forward boolean NOT NULL DEFAULT true;
ALTER TABLE private_moments ADD COLUMN IF NOT EXISTS source_moment_id uuid REFERENCES private_moments(id) ON DELETE CASCADE;
CREATE INDEX private_moments_forward_source ON private_moments(source_moment_id) WHERE source_moment_id IS NOT NULL;

CREATE TABLE moment_forward_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES private_moments(id) ON DELETE CASCADE,
  requester_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending','approved','rejected','published','revoked')),
  published_id uuid UNIQUE REFERENCES private_moments(id) ON DELETE SET NULL,
  UNIQUE(moment_id,requester_id)
);

CREATE TABLE moment_chat_shares (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES private_moments(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(moment_id,sender_id,recipient_id)
);

CREATE TABLE moment_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  moment_id uuid NOT NULL REFERENCES private_moments(id) ON DELETE CASCADE,
  recipient_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('ye','comment','forward_request','forward_result')),
  event_key text NOT NULL,
  comment_id uuid REFERENCES moment_comments(id) ON DELETE CASCADE,
  request_id uuid REFERENCES moment_forward_requests(id) ON DELETE CASCADE,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(recipient_id,kind,event_key)
);
CREATE INDEX moment_notifications_inbox ON moment_notifications(recipient_id,created_at DESC,id DESC);
CREATE INDEX moment_notifications_moment ON moment_notifications(moment_id);
