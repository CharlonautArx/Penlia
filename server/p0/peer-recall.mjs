import { HttpError, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { recallDirectMessage } from '../im.mjs';
import { areFriends, vendorId, verifiedImCallback } from './access.mjs';

const enabled = () => process.env.PENLIA_IM_RECALL_READY === '1';
const messageId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const projection = 'sequence::text AS cursor,message_id AS id,sender_id AS "senderId",peer_id AS "peerId",extract(epoch from sent_at)*1000 AS timestamp';
const lockStream = (db) => db.query('SELECT pg_advisory_xact_lock(898271205)');
const missing = () => new HttpError(404, '找不到可以撤回的已发送消息。');

export async function afterImSend(body, pathKey) {
  if (!enabled() || !verifiedImCallback(body, pathKey)) throw new HttpError(404, '接口不存在。');
  if (!['chat','chat_offline'].includes(body.eventType) || body.group_id) return;
  const sender = vendorId(body.from), peer = vendorId(body.to);
  if (!sender || !peer || sender === peer || !messageId(body.msg_id)
    || body.callId !== process.env.EASEMOB_APP_KEY + '_' + body.msg_id) return;
  if (body.chat_type === 'recall' && messageId(body.recall_id) && body.recall_id === body.payload?.ack_message_id) {
    await inTransaction(pool, async (db) => {
      await lockStream(db);
      await db.query(`INSERT INTO peer_recalls(message_id,sender_id,peer_id,sent_at)
      SELECT message_id,sender_id,peer_id,sent_at FROM peer_send_receipts
      WHERE message_id=$1 AND sender_id=$2 AND peer_id=$3
      ON CONFLICT(message_id) DO NOTHING`, [body.recall_id,sender,peer]);
    });
  } else if (body.chat_type === 'chat') {
    await pool.query(`WITH cleanup AS (
      DELETE FROM peer_send_receipts WHERE message_id IN
        (SELECT message_id FROM peer_send_receipts WHERE sent_at < now()-interval '15 minutes'
          ORDER BY sent_at LIMIT 50 FOR UPDATE SKIP LOCKED)
    ) INSERT INTO peer_send_receipts(message_id,sender_id,peer_id,sent_at)
      SELECT $1,s.id,p.id,to_timestamp($4::double precision / 1000)
      FROM users s,users p WHERE s.id=$2 AND p.id=$3
      ON CONFLICT(message_id) DO NOTHING`, [body.msg_id,sender,peer,body.timestamp]);
  }
}

export async function listRecalls(user, after) {
  if (!enabled()) return { enabled: false, messages: [], next: null };
  if (after !== null && (!/^\d{1,18}$/.test(after))) throw new HttpError(400, '分页参数无效。');
  const { rows } = await pool.query(`SELECT ${projection} FROM peer_recalls WHERE sequence>$2 AND (sender_id=$1 OR peer_id=$1)
    ORDER BY sequence LIMIT 201`, [user,after ?? '0']);
  const page = rows.slice(0,200);
  return { enabled: true, messages: page.map(row => ({ ...row, timestamp: Number(row.timestamp) })),
    next: page.at(-1)?.cursor ?? null, more: rows.length > 200 };
}

export async function recallPeerMessage(sender, body, transport = recallDirectMessage) {
  if (!enabled()) throw new HttpError(503, '聊天撤回服务暂未启用。');
  const peer = readId(body.peerId);
  if (!messageId(body.id) || sender === peer || !await areFriends(pool,sender,peer)) throw missing();
  return inTransaction(pool, async (db) => {
    // Serialize concurrent requests and use provider-confirmed metadata instead of request timestamps.
    const { rows: [receipt] } = await db.query(`SELECT sent_at, clock_timestamp()>=sent_at
      AND clock_timestamp()<sent_at+interval '120 seconds' AS eligible
      FROM peer_send_receipts WHERE message_id=$1 AND sender_id=$2 AND peer_id=$3 FOR UPDATE`, [body.id,sender,peer]);
    const { rows: [existing] } = await db.query(`SELECT ${projection} FROM peer_recalls
      WHERE message_id=$1 AND sender_id=$2 AND peer_id=$3`, [body.id,sender,peer]);
    if (existing) return { message: { ...existing, timestamp: Number(existing.timestamp) } };
    if (!receipt) throw missing();
    if (!receipt.eligible) throw new HttpError(409, '这条消息已超过两分钟，无法撤回。');
    try {
      if (!await transport(sender,peer,body.id)) throw new Error();
    } catch {
      throw new HttpError(502, '通信服务未确认撤回，请稍后重试。');
    }
    await lockStream(db);
    await db.query(`INSERT INTO peer_recalls(message_id,sender_id,peer_id,sent_at)
      VALUES($1,$2,$3,$4) ON CONFLICT(message_id) DO NOTHING`, [body.id,sender,peer,receipt.sent_at]);
    const { rows: [saved] } = await db.query(`SELECT ${projection} FROM peer_recalls
      WHERE message_id=$1 AND sender_id=$2 AND peer_id=$3`, [body.id,sender,peer]);
    if (!saved) throw missing();
    return { message: { ...saved, timestamp: Number(saved.timestamp) } };
  });
}
