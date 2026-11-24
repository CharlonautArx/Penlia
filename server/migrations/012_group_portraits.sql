ALTER TABLE chat_groups ADD COLUMN avatar bytea CHECK (octet_length(avatar) <= 24576);
