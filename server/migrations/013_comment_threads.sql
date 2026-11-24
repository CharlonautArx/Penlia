ALTER TABLE moment_comments ADD COLUMN reply_to uuid;
ALTER TABLE moment_comments ADD CONSTRAINT comment_in_same_moment UNIQUE (moment_id,id);
ALTER TABLE moment_comments ADD CONSTRAINT reply_in_same_moment FOREIGN KEY (moment_id,reply_to)
  REFERENCES moment_comments(moment_id,id) ON DELETE SET NULL (reply_to);
ALTER TABLE moment_comments DROP CONSTRAINT moment_comments_body_check;
ALTER TABLE moment_comments ADD CHECK (char_length(body) <= 500);
ALTER TABLE private_media ADD COLUMN comment_id uuid REFERENCES moment_comments(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX one_photo_per_comment ON private_media(comment_id) WHERE comment_id IS NOT NULL;

INSERT INTO private_moment_viewers(moment_id,user_id)
SELECT p.id,gm.user_id FROM private_moments p
JOIN relationship_group_members gm ON gm.group_id=p.audience_group
WHERE p.scope='group' ON CONFLICT DO NOTHING;
