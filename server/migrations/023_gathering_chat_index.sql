CREATE INDEX p1_events_gathering_chat ON p1_events (user_id, subject_id, created_at DESC)
  WHERE kind='gathering_invited';
