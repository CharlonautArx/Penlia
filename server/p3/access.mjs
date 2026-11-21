import { blocked, restricted } from '../p0/access.mjs';

export const member = (s, viewer) => `(${s}.owner_id=${viewer} OR (NOT ${blocked(s + '.owner_id', viewer)}
  AND EXISTS(SELECT 1 FROM p3_members pm WHERE pm.space_id=${s}.id AND pm.user_id=${viewer} AND pm.state='active')))`;

export const separated = (author, viewer) =>
  `(${blocked(author, viewer)} OR ${restricted(author, viewer)} OR ${restricted(viewer, author)})`;

export const recordVisible = (r, s, viewer) => `(${r}.removed_at IS NULL AND ${member(s, viewer)} AND (
  ${r}.author_id=${viewer} OR (${member(s, r + '.author_id')} AND NOT ${separated(r + '.author_id', viewer)}
    AND EXISTS(SELECT 1 FROM p3_record_viewers granted WHERE granted.record_id=${r}.id AND granted.viewer_id=${viewer}))
))`;

export const p3MediaVisible = (m, viewer) => `EXISTS(SELECT 1 FROM p3_media px
  JOIN p3_records pr ON pr.id=px.record_id JOIN p3_spaces ps ON ps.id=pr.space_id
  WHERE px.media_id=${m}.id AND pr.kind='contribution' AND ${recordVisible('pr', 'ps', viewer)})`;
