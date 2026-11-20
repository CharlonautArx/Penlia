import { HttpError, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { blocked } from '../p0/access.mjs';
import { groupMember } from '../p0/groups.mjs';
import { assertAllowed, conflict, missing, notify } from './common.mjs';

const unavailable = () => new HttpError(503, '多人音视频服务尚未配置。');

export function rtcConfigured(adapter) {
  return typeof adapter?.mintRoomToken === 'function' && typeof adapter?.closeRoom === 'function';
}

export async function currentGroupCall(user, group, adapter) {
  await groupMember(pool, group, user);
  const available = rtcConfigured(adapter);
  if (!available) return { available, call: null };
  const {
    rows: [call],
  } = await pool.query(
    `SELECT c.id,c.host_id AS "hostId",c.expires_at AS "expiresAt",p.state
    FROM p1_calls c JOIN p1_call_participants p ON p.call_id=c.id
    WHERE c.group_id=$1 AND p.user_id=$2 AND c.ended_at IS NULL AND c.expires_at>now()
    AND NOT ${blocked('c.host_id', '$2::uuid')}`,
    [group, user],
  );
  return { available, call: call ?? null };
}

export async function startGroupCall(user, group, adapter) {
  if (!rtcConfigured(adapter)) throw unavailable();
  return inTransaction(pool, async (db) => {
    await groupMember(db, group, user, true);
    await assertAllowed(db, user, ['limit_contact', 'limit_sending', 'limit_account']);
    await db.query(
      'UPDATE p1_calls SET ended_at=now() WHERE group_id=$1 AND ended_at IS NULL AND expires_at<=now()',
      [group],
    );
    const {
      rows: [active],
    } = await db.query('SELECT id,host_id FROM p1_calls WHERE group_id=$1 AND ended_at IS NULL', [group]);
    if (active) {
      if (active.host_id !== user) throw conflict('群里已有通话。');
      return { id: active.id };
    }
    const {
      rows: [call],
    } = await db.query(
      `INSERT INTO p1_calls(group_id,host_id,expires_at)
      VALUES($1,$2,now()+interval '90 minutes') RETURNING id`,
      [group, user],
    );
    const { rows: mates } = await db.query(
      `INSERT INTO p1_call_participants(call_id,user_id,state)
      SELECT $1,m.user_id,'invited' FROM chat_group_members m WHERE m.group_id=$2 AND NOT ${blocked('$3::uuid', 'm.user_id')}
      RETURNING user_id`,
      [call.id, group, user],
    );
    await notify(
      db,
      mates.map((mate) => mate.user_id).filter((id) => id !== user),
      'group_call',
      call.id,
    );
    return call;
  });
}

async function lockedCall(db, user, id) {
  const {
    rows: [known],
  } = await db.query('SELECT group_id FROM p1_calls WHERE id=$1', [id]);
  if (!known) throw missing();
  await groupMember(db, known.group_id, user, true);
  const {
    rows: [call],
  } = await db.query(
    `SELECT c.id,c.host_id,c.group_id,c.expires_at,p.state
    FROM p1_calls c JOIN p1_call_participants p ON p.call_id=c.id
    WHERE c.id=$1 AND p.user_id=$2 AND c.ended_at IS NULL AND c.expires_at>now()
    AND NOT ${blocked('c.host_id', '$2::uuid')} FOR UPDATE OF c,p`,
    [id, user],
  );
  if (!call) throw missing();
  return call;
}

export async function callToken(user, id, renew, adapter) {
  readId(id);
  if (!rtcConfigured(adapter)) throw unavailable();
  return inTransaction(pool, async (db) => {
    const call = await lockedCall(db, user, id);
    await assertAllowed(db, user, ['limit_sending', 'limit_account']);
    if (renew && call.state !== 'joined') throw conflict('请先加入通话。');
    if (call.state === 'declined') throw conflict('你已拒绝此次通话。');
    const {
      rows: [people],
    } = await db.query(
      `SELECT count(*)::int AS joined,
        coalesce(bool_or(${blocked('$3::uuid', 'p.user_id')}),false) AS conflict
        FROM p1_call_participants p JOIN chat_group_members m ON m.group_id=$2 AND m.user_id=p.user_id
        WHERE p.call_id=$1 AND p.state='joined'`,
      [id, call.group_id, user],
    );
    if (people.conflict) throw new HttpError(403, '当前通话暂不可加入。');
    if (call.state !== 'joined' && people.joined >= 8) throw conflict('通话人数已满。');
    const expiresAt = Math.min(+call.expires_at, Date.now() + 60_000);
    let token;
    try {
      token = await adapter.mintRoomToken({
        roomId: id,
        participantId: user,
        expiresAt,
        signal: AbortSignal.timeout(4000),
      });
    } catch {
      throw unavailable();
    }
    if (typeof token !== 'string' || !token || token.length > 4096) throw unavailable();
    await db.query("UPDATE p1_call_participants SET state='joined' WHERE call_id=$1 AND user_id=$2", [
      id,
      user,
    ]);
    return { callId: id, roomId: id, participantId: user, token, expiresAt };
  });
}

export async function changeCall(user, id, action, adapter) {
  if (!rtcConfigured(adapter)) throw unavailable();
  return inTransaction(pool, async (db) => {
    const call = await lockedCall(db, user, id);
    if (action === 'end') {
      if (call.host_id !== user) throw missing();
      try {
        await adapter.closeRoom({ roomId: id, signal: AbortSignal.timeout(4000) });
      } catch {
        throw unavailable();
      }
      await db.query('UPDATE p1_calls SET ended_at=now() WHERE id=$1', [id]);
    } else {
      if (action === 'decline' && call.state === 'joined') throw conflict();
      if (action === 'leave' && call.state !== 'joined') throw conflict();
      if (action === 'leave' && typeof adapter.removeParticipant === 'function') {
        try {
          await adapter.removeParticipant({
            roomId: id,
            participantId: user,
            signal: AbortSignal.timeout(4000),
          });
        } catch {
          throw unavailable();
        }
      }
      await db.query('UPDATE p1_call_participants SET state=$3 WHERE call_id=$1 AND user_id=$2', [
        id,
        user,
        action === 'decline' ? 'declined' : 'left',
      ]);
    }
    return {};
  });
}
