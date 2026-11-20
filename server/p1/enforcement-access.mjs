import { HttpError } from '../core.mjs';

export const activePenalty = (
  user,
  kinds,
) => `EXISTS (SELECT 1 FROM p1_enforcement e WHERE e.subject_id=${user}
  AND e.kind IN (${kinds.map((kind) => "'" + kind + "'").join(',')}) AND e.applied_at IS NOT NULL
  AND e.overturned_at IS NULL AND e.expires_at>now())`;

export async function assertAllowed(db, user, kinds) {
  const {
    rows: [row],
  } = await db.query(`SELECT ${activePenalty('$1', kinds)} AS restricted`, [user]);
  if (row.restricted) throw new HttpError(403, '此操作暂时受限。可在生活边界保护中查看处置或申诉。');
}
