import { cleanText, HttpError, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { unusedMedia } from '../p1/collection-access.mjs';
import { assertAllowed } from '../p1/enforcement-access.mjs';
import { areFriends, blocked, lockUsers, related } from './access.mjs';

const missing = () => new HttpError(404, '找不到可查看的聊天记录。');
const kind = ['text', 'image', 'video', 'location'];
export const recordReadable = (r, user) => `(${r}.owner_id=${user}
  OR (${r}.peer_id=${user} AND ${related(user, r + '.owner_id')})
  OR (${r}.group_id IS NOT NULL AND NOT ${blocked(user, r + '.owner_id')} AND EXISTS(
    SELECT 1 FROM chat_group_members m WHERE m.group_id=${r}.group_id AND m.user_id=${user} AND m.joined_at<=${r}.created_at
  )))`;

function recordLines(input) {
  if (!Array.isArray(input) || !input.length || input.length > 30) throw new HttpError(400, '请选择 1 至 30 条消息。');
  return input.map((line) => {
    if (!line || !kind.includes(line.kind) || !Number.isFinite(line.time) || line.time < 0 || line.time > 8.64e15)
      throw new HttpError(400, '消息格式无效。');
    const assets = line.mediaIds ?? [];
    if (!Array.isArray(assets) || assets.length > 6) throw new HttpError(400, '附件数量超出限制。');
    return {
      kind: line.kind, time: line.time, author: cleanText(line.author, 80, true),
      authorId: line.authorId ? readId(line.authorId) : undefined,
      body: cleanText(line.body ?? '', 1000),
      quote: line.quote ? cleanText(line.quote, 180) : undefined,
      mediaIds: [...new Set(assets.map(readId))],
    };
  });
}

export async function saveChatRecord(user, body) {
  const client = readId(body.clientId);
  const peer = body.peerId ? readId(body.peerId) : null;
  const group = body.groupId ? readId(body.groupId) : null;
  if ((peer && group) || peer === user) throw missing();
  const lines = recordLines(body.lines);
  const ids = [...new Set(lines.flatMap((line) => line.mediaIds))];
  if (ids.length > 20) throw new HttpError(400, '一次最多转发 20 个附件。');
  return inTransaction(pool, async (db) => {
    await lockUsers(db, ...[user, peer].filter(Boolean));
    if (peer && !await areFriends(db, user, peer)) throw missing();
    if (group && !(await db.query('SELECT 1 FROM chat_group_members WHERE group_id=$1 AND user_id=$2', [group, user])).rowCount) throw missing();
    if (peer || group) await assertAllowed(db, user, ['limit_sending','limit_account']);
    const prev = await db.query('SELECT id FROM chat_records WHERE owner_id=$1 AND client_id=$2 AND peer_id IS NOT DISTINCT FROM $3::uuid AND group_id IS NOT DISTINCT FROM $4::uuid',
      [user, client, peer, group]);
    if (prev.rowCount) return prev.rows[0];
    const { rows: [saved] } = await db.query(
      'INSERT INTO chat_records(owner_id,client_id,peer_id,group_id,lines) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [user, client, peer, group, JSON.stringify(lines)]);
    const attached = await db.query(`UPDATE private_media b SET chat_record_id=$3 WHERE b.owner_id=$1 AND b.id=ANY($2::uuid[])
      AND ${unusedMedia('b')} AND b.created_at>now()-interval '1 day'`, [user, ids, saved.id]);
    if (attached.rowCount !== ids.length) throw missing();
    return saved;
  });
}

export async function getChatRecord(user, id) {
  const { rows: [row] } = await pool.query(`SELECT r.lines, (SELECT max(i.created_at) FROM p2_items i WHERE i.chat_record_id=r.id AND i.owner_id=$1) AS "savedAt",
    coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'mime',b.mime))
    FROM private_media b WHERE b.chat_record_id=r.id),'[]'::jsonb) AS media FROM chat_records r WHERE r.id=$2 AND ${recordReadable('r','$1::uuid')}`,
    [user, readId(id)]);
  if (!row) throw missing();
  const { lines, media } = row;
  const assets = new Map(media.map((item) => [item.id, item]));
  return { savedAt: row.savedAt, lines: lines.map(({ mediaIds, ...line }) => ({ ...line, media: mediaIds.flatMap((asset) => assets.get(asset) ?? []) })) };
}

export async function saveChatFavorite(user, body) {
  const id = readId(body.recordId);
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const found = await db.query('SELECT 1 FROM chat_records WHERE id=$2 AND owner_id=$1 AND peer_id IS NULL AND group_id IS NULL', [user, id]);
    if (!found.rowCount) throw missing();
    const { rows: [item] } = await db.query(`INSERT INTO p2_items(owner_id,client_id,kind,title,category,notes,state,scope,chat_record_id)
      VALUES($1,$2,'saved',$3,'other','','done','private',$2)
      ON CONFLICT(owner_id,client_id) DO NOTHING RETURNING id`, [user, id, cleanText(body.title, 120, true)]);
    return item ?? {};
  });
}
