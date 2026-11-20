CREATE TABLE p1_contribution_workspace_readers (
  contribution_id uuid NOT NULL REFERENCES p1_contributions ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  PRIMARY KEY (contribution_id,viewer_id)
);

CREATE TABLE p1_contribution_public_readers (
  contribution_id uuid NOT NULL REFERENCES p1_contributions ON DELETE CASCADE,
  viewer_id uuid NOT NULL REFERENCES users ON DELETE CASCADE,
  moment_id uuid NOT NULL REFERENCES private_moments ON DELETE CASCADE,
  PRIMARY KEY (contribution_id,viewer_id,moment_id)
);

CREATE INDEX p1_contribution_readers_moment ON p1_contribution_public_readers (moment_id,viewer_id);

CREATE TABLE p1_report_media (
  report_id uuid NOT NULL REFERENCES p1_reports ON DELETE CASCADE,
  media_id uuid NOT NULL,
  mime text NOT NULL CHECK(mime IN ('image/jpeg','image/png','video/mp4')),
  bytes integer NOT NULL CHECK(bytes BETWEEN 16 AND 4194304),
  sha256 text NOT NULL CHECK(sha256 ~ '^[0-9a-f]{64}$'),
  sealed_data bytea NOT NULL,
  PRIMARY KEY (report_id,media_id)
);

UPDATE p1_enforcement AS e
SET execute_at=r.decided_at+make_interval(secs=>86400+floor(random()*518401)::integer)
FROM p1_reports r
WHERE r.id=e.report_id AND r.status='confirmed' AND r.kind<>'threat' AND r.decided_at IS NOT NULL
  AND e.applied_at IS NULL AND e.overturned_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM schema_migrations WHERE name='005_p1_privacy_followup.sql');
