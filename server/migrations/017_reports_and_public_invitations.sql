ALTER TABLE p1_reports DROP CONSTRAINT p1_reports_kind_check;
ALTER TABLE p1_reports ADD CONSTRAINT p1_reports_kind_check
  CHECK (kind IN ('boundary','harassment','threat','sexual','rumor','advertising','fraud','violence','illegal','self_harm','spam'));

ALTER TABLE users
  ADD COLUMN public_intro_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN public_intro_region text NOT NULL DEFAULT '' CHECK (char_length(public_intro_region) <= 30),
  ADD COLUMN public_intro_avatar bytea CHECK (octet_length(public_intro_avatar) <= 24576);
