import { HttpError, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { blocked, related, restricted } from './access.mjs';
import { forwardableMoment, momentVisible } from '../p1/collection-access.mjs';

const missing = () => new HttpError(404, '这条动态或授权当前不可用。');
const forbid = () => new HttpError(403, '这条动态当前无法转发。');

export async function notifyMoment(db, { moment, actor, recipient, kind, key, comment = null, request = null }) {
  if (actor === recipient) return;
  await db.query(`INSERT INTO moment_notifications(moment_id,actor_id,recipient_id,kind,event_key,comment_id,request_id)
    VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(recipient_id,kind,event_key) DO NOTHING`,
  [moment, actor, recipient, kind, key, comment, request]);
}

export async function revokeMomentSharing(db, moment, author) {
  const { rows } = await db.query(`UPDATE moment_forward_requests SET status='revoked'
    WHERE moment_id=$1 AND status IN ('pending','approved','published') RETURNING id,requester_id`, [moment]);
  for (const item of rows) await notifyMoment(db, { moment, actor: author, recipient: item.requester_id,
    kind: 'forward_result', key: item.id + ':revoked', request: item.id });
  await db.query('DELETE FROM moment_chat_shares WHERE moment_id=$1', [moment]);
}

export async function setMomentSharePermission(user, id, allowed) {
  if (typeof allowed !== 'boolean') throw new HttpError(400, '请选择转发权限。');
  return inTransaction(pool, async (db) => {
    const result = await db.query(`UPDATE private_moments SET allow_forward=$3
      WHERE id=$2 AND author_id=$1 AND source_moment_id IS NULL`, [user, id, allowed]);
    if (!result.rowCount) throw missing();
    if (!allowed) await revokeMomentSharing(db, id, user);
    return { canForward: allowed };
  });
}

export async function createMomentChatShare(user, moment, receiver) {
  readId(receiver);
  if (receiver === user) throw forbid();
  return inTransaction(pool, async (db) => {
    const { rowCount } = await db.query(`SELECT p.id FROM private_moments p WHERE p.id=$2
      AND ${forwardableMoment('p')} AND ${momentVisible('p', '$1::uuid')}
      AND ${momentVisible('p', '$3::uuid')} AND ${related('$1::uuid', '$3::uuid')}
      FOR UPDATE OF p`, [user, moment, receiver]);
    if (!rowCount) throw new HttpError(403, '这位好友当前没有查看这条动态的权限。');
    const { rows: [share] } = await db.query(`INSERT INTO moment_chat_shares(moment_id,sender_id,recipient_id)
      VALUES($2,$1,$3) ON CONFLICT(moment_id,sender_id,recipient_id)
      DO UPDATE SET moment_id=excluded.moment_id RETURNING id`, [user, moment, receiver]);
    return share;
  });
}

export async function requestMomentForward(user, moment) {
  return inTransaction(pool, async (db) => {
    const { rows: [post] } = await db.query(`SELECT p.author_id FROM private_moments p WHERE p.id=$2
      AND ${forwardableMoment('p')} AND ${momentVisible('p', '$1::uuid')} FOR UPDATE OF p`, [user, moment]);
    if (!post) throw forbid();
    const { rows: [previous] } = await db.query(`SELECT id,status,published_id AS "publishedId" FROM moment_forward_requests
      WHERE moment_id=$2 AND requester_id=$1`, [user, moment]);
    if (previous) return previous;
    const { rows: [request] } = await db.query(`INSERT INTO moment_forward_requests(moment_id,requester_id,status)
      VALUES($2,$1,$3) RETURNING id,status`, [user, moment, post.author_id === user ? 'approved' : 'pending']);
    await notifyMoment(db, { moment, actor: user, recipient: post.author_id,
      kind: 'forward_request', key: request.id, request: request.id });
    return request;
  });
}

export async function manageMomentForward(user, requestId, action) {
  if (!['approve','reject','revoke','publish'].includes(action)) throw new HttpError(400, '无效的转发操作。');
  return inTransaction(pool, async (db) => {
    // All transitions serialize on the original post, including privacy edits and source deletion.
    const { rows: [post] } = await db.query(`SELECT p.id,p.author_id FROM private_moments p
      JOIN moment_forward_requests r ON r.moment_id=p.id WHERE r.id=$1 FOR UPDATE OF p`, [requestId]);
    if (!post) throw missing();
    const { rows: [request] } = await db.query(`SELECT r.requester_id,r.status,r.published_id AS "publishedId",
      ${forwardableMoment('p')} AND ${momentVisible('p','r.requester_id')} AS allowed
      FROM moment_forward_requests r JOIN private_moments p ON p.id=r.moment_id WHERE r.id=$1`, [requestId]);

    if (action === 'publish') {
      if (request.requester_id !== user || !request.allowed) throw forbid();
      if (request.status === 'published' && request.publishedId) return { status: request.status, publishedId: request.publishedId };
      if (request.status !== 'approved') throw new HttpError(409, '需要原作者同意后才能转发。');
      const { rows: [forward] } = await db.query(`INSERT INTO private_moments(author_id,client_id,scope,source_moment_id)
        VALUES($1,gen_random_uuid(),'friends',$2) RETURNING id`, [user, post.id]);
      await db.query(`UPDATE moment_forward_requests SET status='published',published_id=$2 WHERE id=$1`, [requestId, forward.id]);
      return { status: 'published', publishedId: forward.id };
    }

    if (post.author_id !== user) throw missing();
    const status = { approve: 'approved', reject: 'rejected', revoke: 'revoked' }[action];
    if (request.status === status) return { status };
    if (action === 'revoke' ? !['approved','published'].includes(request.status) :
        request.status !== 'pending' || (action === 'approve' && !request.allowed))
      throw new HttpError(409, '这项请求已经处理或当前不可用。');
    await db.query('UPDATE moment_forward_requests SET status=$2 WHERE id=$1', [requestId, status]);
    await notifyMoment(db, { moment: post.id, actor: user, recipient: request.requester_id,
      kind: 'forward_result', key: requestId + ':' + status, request: requestId });
    return { status };
  });
}

export async function momentInbox(user, query) {
  const cursor = query.get('before');
  if (cursor !== null) readId(cursor);
  const visible = `FROM moment_notifications n JOIN private_moments p ON p.id=n.moment_id JOIN users actor ON actor.id=n.actor_id
    LEFT JOIN moment_comments c ON c.id=n.comment_id LEFT JOIN moment_forward_requests req ON req.id=n.request_id
    WHERE n.recipient_id=$1 AND ${momentVisible('p','$1::uuid')} AND ${momentVisible('p','n.actor_id')}
    AND NOT ${blocked('$1::uuid','n.actor_id')} AND NOT ${restricted('n.actor_id','$1::uuid')}`;
  if (query.get('badge') === '1') {
    const { rows: [row] } = await pool.query('SELECT EXISTS(SELECT 1 ' + visible + ' AND n.read_at IS NULL) AS unread', [user]);
    return row;
  }
  const { rows } = await pool.query(`SELECT n.id,n.moment_id AS "momentId", n.actor_id AS "actorId",actor.name AS actor,
    n.kind,n.created_at AS "createdAt", (n.read_at IS NULL) AS unread,CASE WHEN c.body='' AND EXISTS(SELECT 1 FROM private_media b WHERE b.comment_id=c.id)
      THEN '［图片］' ELSE c.body END AS comment,
    req.id AS "requestId",req.status,
    CASE WHEN n.kind='forward_result' THEN split_part(n.event_key,':',2) END AS decision
    ${visible} AND ($2::uuid IS NULL OR (n.created_at,n.id)<(
      SELECT created_at,id FROM moment_notifications WHERE id=$2 AND recipient_id=$1))
    ORDER BY n.created_at DESC,n.id DESC LIMIT 31`, [user, cursor]);
  return { notifications: rows.slice(0,30), next: rows.length > 30 ? rows[29].id : null };
}

export async function markMomentNotificationsRead(user, ids) {
  if (!Array.isArray(ids) || ids.length > 100) throw new HttpError(400, '请选择有效的消息。');
  await pool.query(`UPDATE moment_notifications SET read_at=now() WHERE recipient_id=$1
    AND id=ANY($2::uuid[]) AND read_at IS NULL`, [user, ids.map(readId)]);
  return {};
}
