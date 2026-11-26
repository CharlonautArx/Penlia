import { pool } from '../db.mjs';
import { related } from '../p0/access.mjs';
import { invalid, missing } from './common.mjs';

export async function gatheringChat(user, peer, rawLimit) {
  if (user === peer) throw missing();
  const limit = rawLimit ? Number(rawLimit) : 40;
  if (!Number.isInteger(limit) || limit < 1 || limit > 400) throw invalid();
  const { rows } = await pool.query(
    `SELECT recent.id, recent."gatheringId", recent.title, recent.mine, recent."sentAt",
       recent.state, option.starts_at AS "startsAt", coalesce(nullif(option.place, ''), recent.meeting_note) AS place,
       (SELECT count(*)::int FROM p1_gathering_options o WHERE o.gathering_id=recent."gatheringId") AS "optionCount",
       recent."hasCover"
     FROM (
       SELECT DISTINCT ON (g.id) e.id, g.id AS "gatheringId", g.title, g.owner_id=$1 AS mine,
         e.created_at AS "sentAt", g.state, g.choice_id, g.meeting_note, (g.cover IS NOT NULL AND guest.can_view_cover) AS "hasCover"
       FROM p1_events e
       JOIN p1_gatherings g ON g.id=e.subject_id
       JOIN p1_gathering_members guest ON guest.gathering_id=g.id AND guest.user_id=e.user_id
       WHERE e.kind='gathering_invited' AND ((e.user_id=$1 AND g.owner_id=$2) OR (e.user_id=$2 AND g.owner_id=$1))
         AND ${related('$1::uuid', '$2::uuid')}
       ORDER BY g.id,e.created_at DESC,e.id DESC
     ) recent
     LEFT JOIN LATERAL (
       SELECT o.starts_at,o.place FROM p1_gathering_options o WHERE o.gathering_id=recent."gatheringId"
       ORDER BY (o.id=recent.choice_id) DESC NULLS LAST,o.starts_at,o.id LIMIT 1
     ) option ON true
     ORDER BY recent."sentAt" DESC,recent.id DESC LIMIT $3`,
    [user, peer, limit + 1],
  );
  return { invitations: rows.slice(0, limit), more: rows.length > limit && limit < 400 };
}
