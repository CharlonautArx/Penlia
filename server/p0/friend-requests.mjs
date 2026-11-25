import { cleanText, hash, HttpError, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { blocked, lockUsers, related } from './access.mjs';

import { avatarOf } from './profile.mjs';

const publicAvatar = avatarOf('u') + ' AS avatar';
const publicProfile = `u.id,u.name,u.bio,coalesce(u.profile_region,'') AS region,${publicAvatar}`;
const codePattern = /^penlia:add:[A-Za-z0-9_-]{32}$/;

export async function codeOwner(db, code) {
  if (typeof code !== 'string' || !codePattern.test(code)) return undefined;
  const { rows: [row] } = await db.query(
    'SELECT user_id AS id FROM friend_codes WHERE code_hash=$1 AND expires_at>clock_timestamp()', [hash(code)]);
  return row?.id;
}

export async function resolveFriendCode(viewer, code) {
  if (typeof code !== 'string' || !codePattern.test(code)) return { person: null };
  const { rows: [person] } = await pool.query(
    `SELECT ${publicProfile}, ${related('$1::uuid', 'u.id')} AS "isFriend"
     FROM friend_codes c JOIN users u ON u.id=c.user_id LEFT JOIN privacy_preferences p ON p.user_id=u.id
     WHERE c.code_hash=$2 AND c.expires_at>clock_timestamp() AND u.id<>$1
       AND coalesce(p.add_policy,'anyone')='anyone' AND NOT ${blocked('$1::uuid', 'u.id')}`, [viewer, hash(code)]);
  return { person: person ?? null };
}

export async function findFriendRequests(viewer) {
  const { rows } = await pool.query(
    `SELECT f.id, f.status, (f.requested_by=$1) AS outgoing, u.name, ${publicAvatar},
       CASE WHEN f.status='accepted' THEN u.id ELSE NULL END AS "friendId",
       coalesce(n.note,'') AS "verificationMessage", f.updated_at AS "updatedAt"
     FROM friendships f JOIN users u ON u.id=CASE WHEN f.first_user=$1 THEN f.second_user ELSE f.first_user END
     LEFT JOIN friend_notes n ON n.friendship_id=f.id
     WHERE $1 IN (f.first_user,f.second_user) AND NOT ${blocked('$1::uuid', 'u.id')}
     ORDER BY f.updated_at DESC,f.id DESC`, [viewer]);
  return { requests: rows };
}

export async function findApplicant(viewer, id) {
  readId(id);
  const { rows: [record] } = await pool.query(
    `SELECT ${publicProfile}, f.status, coalesce(n.note,'') AS "verificationMessage"
     FROM friendships f JOIN users u ON u.id=f.requested_by
     LEFT JOIN friend_notes n ON n.friendship_id=f.id
     WHERE f.id=$2 AND $1 IN (f.first_user,f.second_user) AND f.requested_by<>$1
       AND NOT ${blocked('$1::uuid', 'u.id')}`, [viewer, id]);
  if (!record) throw new HttpError(404, '这条好友申请已不可访问。');
  const { status, verificationMessage, ...person } = record;
  return { person: { ...person, isFriend: status === 'accepted' }, status, verificationMessage };
}

export async function friendCodeStatus(user, code) {
  if (typeof code !== 'string' || !codePattern.test(code)) return { expiresAt: null };
  const { rows: [record] } = await pool.query(
    `SELECT expires_at AS "expiresAt" FROM friend_codes
     WHERE user_id=$1 AND code_hash=$2 AND expires_at>clock_timestamp()`, [user, hash(code)]);
  return { expiresAt: record?.expiresAt ?? null };
}

export async function revokeFriendCode(user) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    await db.query('UPDATE friend_codes SET expires_at=clock_timestamp() WHERE user_id=$1', [user]);
    return {};
  });
}
