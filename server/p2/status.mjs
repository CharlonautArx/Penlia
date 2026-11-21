import { cleanText, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { idsOf, lockUsers, verifyFriends } from '../p0/access.mjs';
import { choose, invalid, timeOf, conflict } from '../p1/common.mjs';
import { statusVisible } from './access.mjs';
import { assetList, dayMs, deleteAssets, replaceAssets } from './common.mjs';

export async function getStatus(user, id, explicitLifetime = false) {
  const {
    rows: [status],
  } = await pool.query(
    `SELECT st.caption,st.emoji,st.expires_at AS "expiresAt",${assetList('status', 'st.user_id')} AS media,
    CASE WHEN st.user_id=$1 THEN st.scope END AS scope,CASE WHEN st.user_id=$1 THEN st.revision END AS revision,
    CASE WHEN st.user_id=$1 THEN ARRAY(SELECT viewer_id FROM p2_status_viewers WHERE user_id=$1) END AS "memberIds"
    FROM p2_status st WHERE st.user_id=$2 AND ${statusVisible('st', '$1::uuid')}`,
    [user, id],
  );
  if (!status) return { status: null };
  if (status.expiresAt === null && !explicitLifetime) {
    // Old clients format this field as a date. The placeholder is never persisted.
    return { status: { ...status, expiresAt: '9999-12-31T00:00:00.000Z', persistent: true } };
  }
  return { status };
}
export async function saveStatus(user, body) {
  const caption = cleanText(body.caption ?? '', 64),
    emoji = cleanText(body.emoji ?? '', 8);
  const media = idsOf(body.mediaIds ?? [], 1);
  const scope = choose(body.scope ?? 'private', ['private', 'selected', 'friends']);
  const targets = scope === 'selected' ? idsOf(body.memberIds ?? []) : [];
  if (!caption && !emoji && !media.length) throw invalid('请选择图片、表情或填写状态。');
  if (scope === 'selected' && !targets.length) throw invalid('请选择可见好友。');
  const end = body.expiresAt === null ? null : timeOf(body.expiresAt);
  if (end && (+end <= Date.now() || +end > Date.now() + 7 * dayMs)) throw invalid('状态有效期须在未来七天内。');
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    await verifyFriends(db, user, targets);
    const {
      rows: [previous],
    } = await db.query('SELECT revision,expires_at FROM p2_status WHERE user_id=$1 FOR UPDATE', [user]);
    const active = previous && (previous.expires_at === null || +previous.expires_at > Date.now());
    if (previous?.expires_at === null && end !== null)
      throw conflict('请更新朋聊后编辑这个长期状态。');
    if ((active && body.revision !== previous.revision) || (!active && body.revision !== undefined))
      throw conflict();
    await db.query(
      `INSERT INTO p2_status AS st(user_id,caption,emoji,scope,expires_at)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(user_id) DO UPDATE SET caption=excluded.caption,emoji=excluded.emoji,
      scope=excluded.scope,expires_at=excluded.expires_at,revision=st.revision+1`,
      [user, caption, emoji, scope, end],
    );
    await replaceAssets(db, 'status', user, user, media);
    await db.query('DELETE FROM p2_status_viewers WHERE user_id=$1', [user]);
    await db.query('INSERT INTO p2_status_viewers SELECT $1,id FROM unnest($2::uuid[]) AS v(id)', [
      user,
      targets,
    ]);
    return {};
  });
}
export async function clearStatus(user) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    await deleteAssets(db, 'status', user);
    await db.query('DELETE FROM p2_status WHERE user_id=$1', [user]);
    return {};
  });
}
