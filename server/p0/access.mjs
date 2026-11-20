import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { cleanText, hash, HttpError, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { keyedDigest } from '../phone/policy.mjs';

export const blocked = (a, b) => `EXISTS (SELECT 1 FROM contact_blocks cb
  WHERE (cb.user_id = ${a} AND cb.other_id = ${b}) OR (cb.user_id = ${b} AND cb.other_id = ${a}))`;
export const friends = (a, b) => `EXISTS (SELECT 1 FROM friendships f
  WHERE f.first_user = least(${a}, ${b}) AND f.second_user = greatest(${a}, ${b}) AND f.status = 'accepted')`;
export const restricted = (owner, viewer) => `EXISTS (SELECT 1 FROM contact_restrictions cr
  WHERE cr.user_id=${owner} AND cr.other_id=${viewer})`;
export const related = (a, b) => `(${friends(a, b)} AND NOT ${blocked(a, b)})`;

export async function lockUsers(db, ...ids) {
  for (const id of [...new Set(ids)].sort()) {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', ['p0-user:' + id]);
  }
}

export async function areFriends(db, first, second) {
  const {
    rows: [row],
  } = await db.query(`SELECT ${related('$1::uuid', '$2::uuid')} AS allowed`, [first, second]);
  return row.allowed;
}

export const defaults = {
  addPolicy: 'anyone',
  phoneSearch: false,
  groupPolicy: 'friends',
  profilePolicy: 'friends',
  statusPolicy: 'private',
  momentScope: 'private',
  zone: 'Asia/Shanghai',
  quietHours: {},
  muteUntil: null,
  muteIndefinitely: false,
  showResting: false,
  allowSilent: true,
  version: 0,
};
const columns = `add_policy AS "addPolicy", phone_search AS "phoneSearch", group_policy AS "groupPolicy",
  profile_policy AS "profilePolicy", status_policy AS "statusPolicy", moment_scope AS "momentScope",
  zone, quiet_hours AS "quietHours", mute_until AS "muteUntil", mute_indefinitely AS "muteIndefinitely",
  show_resting AS "showResting", allow_silent AS "allowSilent", version`;

export async function preferences(db, userId) {
  const {
    rows: [value],
  } = await db.query(`SELECT ${columns} FROM privacy_preferences WHERE user_id=$1`, [userId]);
  return value ?? { ...defaults };
}

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const clock = /^([01]\d|2[0-3]):[0-5]\d$/;
const choice = (value, allowed) => {
  if (!allowed.includes(value)) throw new HttpError(400, '请选择有效的隐私选项。');
  return value;
};
function flag(value) {
  if (typeof value !== 'boolean') throw new HttpError(400, '开关设置无效。');
  return value;
}

export function validateHours(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length > 7) {
    throw new HttpError(400, '请输入有效的每周安静时间。');
  }
  return Object.fromEntries(
    Object.entries(value).map(([day, range]) => {
      if (
        !days.includes(day) ||
        !Array.isArray(range) ||
        range.length !== 2 ||
        range.some((time) => typeof time !== 'string' || !clock.test(time)) ||
        range[0] === range[1]
      ) {
        throw new HttpError(400, '安静时间需要有效且不同的起止时间。');
      }
      return [day, range];
    }),
  );
}

function zoneOf(zone) {
  if (typeof zone !== 'string' || zone.length > 80) throw new HttpError(400, '时区无效。');
  try {
    return new Intl.DateTimeFormat('en', { timeZone: zone }).resolvedOptions().timeZone;
  } catch {
    throw new HttpError(400, '时区无效。');
  }
}

export async function updatePreferences(userId, input) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db, userId);
    const value = await preferences(db, userId);
    if (input.version !== value.version) throw new HttpError(409, '设置已在其他设备更新，请刷新后重试。');
    const field = (name, validate) => (Object.hasOwn(input, name) ? validate(input[name]) : value[name]);
    const temporary = input.temporary === undefined ? undefined : choice(input.temporary, ['off', '30', '60', 'until']);
    const until =
      temporary === undefined
        ? value.muteUntil
        : ['30', '60'].includes(temporary)
          ? new Date(Date.now() + Number(temporary) * 60_000)
          : null;
    const {
      rows: [saved],
    } = await db.query(
      `
      INSERT INTO privacy_preferences AS p (user_id, add_policy, phone_search, group_policy, profile_policy, status_policy,
        moment_scope, zone, quiet_hours, mute_until, mute_indefinitely, show_resting, allow_silent)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (user_id) DO UPDATE SET add_policy=excluded.add_policy, phone_search=excluded.phone_search,
        group_policy=excluded.group_policy, profile_policy=excluded.profile_policy, status_policy=excluded.status_policy,
        moment_scope=excluded.moment_scope, zone=excluded.zone, quiet_hours=excluded.quiet_hours,
        mute_until=excluded.mute_until, mute_indefinitely=excluded.mute_indefinitely, show_resting=excluded.show_resting,
        allow_silent=excluded.allow_silent, version=p.version+1
      RETURNING ${columns}`,
      [
        userId,
        field('addPolicy', (v) => choice(v, ['anyone', 'none'])),
        field('phoneSearch', flag),
        field('groupPolicy', (v) => choice(v, ['friends', 'none'])),
        field('profilePolicy', (v) => choice(v, ['friends', 'private'])),
        field('statusPolicy', (v) => choice(v, ['friends', 'private'])),
        field('momentScope', (v) => choice(v, ['private', 'friends', 'circle'])),
        field('zone', zoneOf),
        field('quietHours', validateHours),
        until,
        temporary === undefined ? value.muteIndefinitely : temporary === 'until',
        field('showResting', flag),
        field('allowSilent', flag),
      ],
    );
    return saved;
  });
}

export function isResting(value, now = new Date()) {
  if (value.muteIndefinitely || (value.muteUntil && new Date(value.muteUntil) > now)) return true;
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: value.zone,
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map(({ type, value: part }) => [type, part]),
  );
  const time = parts.hour + ':' + parts.minute;
  const today = value.quietHours[parts.weekday];
  const yesterday = value.quietHours[days[(days.indexOf(parts.weekday) + 6) % 7]];
  return !!(
    (today && time >= today[0] && (today[0] > today[1] || time < today[1])) ||
    (yesterday && yesterday[0] > yesterday[1] && time < yesterday[1])
  );
}

export async function notificationPolicy(db, sender, recipient, requestedSilent) {
  const [value, priority] = await Promise.all([
    preferences(db, recipient),
    db.query('SELECT 1 FROM priority_contacts WHERE user_id=$1 AND other_id=$2', [recipient, sender]),
  ]);
  const senderSilent = requestedSilent === true && value.allowSilent;
  return { senderSilent, suppress: senderSilent || (isResting(value) && !priority.rowCount) };
}

export async function searchPerson(userId, value, type, secret) {
  // A null result is identical for missing, undiscoverable, blocked and self.
  const base = `SELECT u.id,u.username,u.name,'' AS bio FROM users u
    LEFT JOIN privacy_preferences p ON p.user_id=u.id`;
  const visible = `u.id <> $1 AND coalesce(p.add_policy,'anyone')='anyone' AND NOT ${blocked('$1::uuid', 'u.id')}`;
  let result;
  if (type === 'phone') {
    const phone = typeof value === 'string' ? value.trim().replace(/^(?=1\d{10}$)/, '+86') : '';
    if (!/^\+861[3-9]\d{9}$/.test(phone)) return { person: null };
    if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) throw new HttpError(503, '手机号查找暂不可用。');
    const {
      rows: [schema],
    } = await pool.query("SELECT to_regclass('public.phone_identities') IS NOT NULL AS ready");
    if (!schema.ready) throw new HttpError(503, '手机号查找暂不可用。');
    result = await pool.query(
      `${base} JOIN phone_identities i ON i.user_id=u.id
      WHERE i.phone_key=$2 AND p.phone_search AND ${visible}`,
      [userId, keyedDigest(secret, 'phone', phone)],
    );
  } else if (type === 'code') {
    if (typeof value !== 'string' || !/^penlia:add:[A-Za-z0-9_-]{32}$/.test(value)) return { person: null };
    result = await pool.query(
      `${base} JOIN friend_codes c ON c.user_id=u.id
      WHERE c.code_hash=$2 AND c.expires_at>now() AND ${visible}`,
      [userId, hash(value)],
    );
  } else {
    const username = typeof value === 'string' ? value.trim().toLowerCase() : '';
    result = await pool.query(`${base} WHERE u.username=$2 AND ${visible}`, [userId, username]);
  }
  return { person: result.rows[0] ?? null };
}

export async function newFriendCode(userId) {
  const code = 'penlia:add:' + randomBytes(24).toString('base64url');
  const {
    rows: [row],
  } = await pool.query(
    `INSERT INTO friend_codes (user_id,code_hash,expires_at) VALUES ($1,$2,now()+interval '24 hours')
    ON CONFLICT (user_id) DO UPDATE SET code_hash=excluded.code_hash, expires_at=excluded.expires_at
    RETURNING expires_at AS "expiresAt"`,
    [userId, hash(code)],
  );
  return { code, ...row };
}

export async function manageContact(userId, target, action) {
  readId(target);
  if (target === userId) throw new HttpError(400, '不能操作自己的联系人状态。');
  await inTransaction(pool, async (db) => {
    await lockUsers(db, userId, target);
    if (action === 'restrict') {
      if (!(await areFriends(db, userId, target))) throw new HttpError(404, '找不到这位好友。');
      await db.query('INSERT INTO contact_restrictions (user_id,other_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [
        userId,
        target,
      ]);
      return;
    }
    if (action === 'unrestrict') {
      await db.query('DELETE FROM contact_restrictions WHERE user_id=$1 AND other_id=$2', [userId, target]);
      return;
    }
    if (action === 'unblock') {
      await db.query('DELETE FROM contact_blocks WHERE user_id=$1 AND other_id=$2', [userId, target]);
      return;
    }
    if (action === 'block') {
      const inserted = await db.query(
        `INSERT INTO contact_blocks (user_id,other_id)
        SELECT $1,id FROM users WHERE id=$2 ON CONFLICT DO NOTHING`,
        [userId, target],
      );
      if (!inserted.rowCount) return;
    }
    await db.query(
      `UPDATE friendships SET status='declined', im_synced=false, updated_at=now()
      WHERE first_user=least($1::uuid,$2::uuid) AND second_user=greatest($1::uuid,$2::uuid) AND status<>'declined'`,
      [userId, target],
    );
    await db.query(`DELETE FROM priority_contacts WHERE (user_id=$1 AND other_id=$2) OR (user_id=$2 AND other_id=$1)`, [
      userId,
      target,
    ]);
    await db.query(
      `DELETE FROM relationship_group_members gm USING relationship_groups g
      WHERE gm.group_id=g.id AND ((g.owner_id=$1 AND gm.user_id=$2) OR (g.owner_id=$2 AND gm.user_id=$1))`,
      [userId, target],
    );
    await db.query(
      `UPDATE chat_group_invites SET status='declined',code_hash=NULL
      WHERE status='pending' AND ((inviter_id=$1 AND invitee_id=$2) OR (inviter_id=$2 AND invitee_id=$1))`,
      [userId, target],
    );
  });
  return {};
}

export async function listBlocks(userId) {
  const { rows } = await pool.query(
    `SELECT u.id,u.username,u.name FROM contact_blocks b JOIN users u ON u.id=b.other_id
    WHERE b.user_id=$1 ORDER BY b.created_at DESC LIMIT 200`,
    [userId],
  );
  return { blocks: rows };
}

export async function listRestrictions(userId) {
  const { rows } = await pool.query(
    `SELECT u.id,u.username,u.name FROM contact_restrictions r JOIN users u ON u.id=r.other_id
    WHERE r.user_id=$1 ORDER BY r.created_at DESC LIMIT 200`,
    [userId],
  );
  return { restrictions: rows };
}

export async function listRelationshipGroups(userId) {
  const { rows } = await pool.query(
    `SELECT g.id,g.label,g.circle,
    ARRAY(SELECT gm.user_id FROM relationship_group_members gm WHERE gm.group_id=g.id AND ${related('g.owner_id', 'gm.user_id')}
    ORDER BY gm.user_id) AS "memberIds"
    FROM relationship_groups g WHERE owner_id=$1 ORDER BY circle DESC,label,id LIMIT 30`,
    [userId],
  );
  return { groups: rows };
}

export function idsOf(value, limit = 100) {
  if (!Array.isArray(value) || value.length > limit) throw new HttpError(400, '请选择有效的联系人。');
  return [...new Set(value.map(readId))];
}

export async function verifyFriends(db, userId, ids) {
  const {
    rows: [row],
  } = await db.query(
    `SELECT count(*)::integer AS count FROM unnest($2::uuid[]) AS other(id)
    WHERE ${related('$1::uuid', 'other.id')}`,
    [userId, ids],
  );
  if (row.count !== ids.length) throw new HttpError(403, '只能选择当前好友。');
}

export async function saveRelationshipGroup(userId, input, groupId) {
  const memberIds = idsOf(input.memberIds);
  const circle = input.circle === true;
  const label = circle ? '亲密圈' : cleanText(input.label, 32, true);
  return inTransaction(pool, async (db) => {
    await lockUsers(db, userId);
    await verifyFriends(db, userId, memberIds);
    if (!groupId && !circle) {
      const {
        rows: [row],
      } = await db.query('SELECT count(*)::integer AS count FROM relationship_groups WHERE owner_id=$1', [userId]);
      if (row.count >= 30) throw new HttpError(400, '关系组数量已达上限。');
    }
    const {
      rows: [value],
    } = groupId
      ? await db.query(
          'UPDATE relationship_groups SET label=CASE WHEN circle THEN label ELSE $3 END WHERE owner_id=$1 AND id=$2 RETURNING id,label,circle',
          [userId, groupId, label],
        )
      : await db.query(
          `INSERT INTO relationship_groups(owner_id,label,circle) VALUES ($1,$2,$3)
        ON CONFLICT (owner_id) WHERE circle DO UPDATE SET label=excluded.label RETURNING id,label,circle`,
          [userId, label, circle],
        );
    if (!value) throw new HttpError(404, '找不到这个关系组。');
    await db.query('DELETE FROM relationship_group_members WHERE group_id=$1', [value.id]);
    await db.query('INSERT INTO relationship_group_members SELECT $1,id FROM unnest($2::uuid[]) AS selected(id)', [
      value.id,
      memberIds,
    ]);
    return { ...value, memberIds };
  });
}

export async function savePriority(userId, value) {
  const ids = idsOf(value, 20);
  return inTransaction(pool, async (db) => {
    await lockUsers(db, userId);
    await verifyFriends(db, userId, ids);
    await db.query('DELETE FROM priority_contacts WHERE user_id=$1', [userId]);
    await db.query('INSERT INTO priority_contacts SELECT $1,id FROM unnest($2::uuid[]) AS selected(id)', [userId, ids]);
    return { ids };
  });
}

export async function profile(userId, other) {
  const {
    rows: [row],
  } = await pool.query(
    `SELECT u.id,u.username,u.name,
    CASE WHEN p.profile_policy IS DISTINCT FROM 'private' AND NOT ${restricted('u.id', '$1::uuid')} THEN u.bio ELSE '' END AS bio,
    ${restricted('u.id', '$1::uuid')} AS hide_resting
    FROM users u LEFT JOIN privacy_preferences p ON p.user_id=u.id WHERE u.id=$2 AND ${related('$1::uuid', 'u.id')}`,
    [userId, other],
  );
  if (!row) throw new HttpError(404, '找不到这个好友。');
  const { hide_resting: hideResting, ...visible } = row;
  const value = await preferences(pool, other);
  return {
    user: {
      ...visible,
      resting: !hideResting && value.showResting && value.statusPolicy === 'friends' && isResting(value),
    },
  };
}

function vendorId(text) {
  if (typeof text !== 'string' || !/^penlia_[0-9a-f]{32}$/.test(text)) return undefined;
  return text.slice(7).replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5');
}

export async function beforeImSend(body, pathKey) {
  const secret = process.env.PENLIA_IM_CALLBACK_SECRET;
  const key = process.env.PENLIA_IM_CALLBACK_PATH_KEY;
  const app = process.env.EASEMOB_APP_KEY;
  const { callId, timestamp, security, chat_type: type } = body;
  if (
    !secret ||
    !key ||
    key.length < 32 ||
    !app ||
    !timingSafeEqual(Buffer.from(hash(key)), Buffer.from(hash(pathKey))) ||
    typeof callId !== 'string' ||
    !callId.startsWith(app + '_') ||
    callId.length > 220 ||
    !Number.isSafeInteger(timestamp) ||
    Math.abs(Date.now() - timestamp) > 300_000 ||
    !/^[0-9a-f]{32}$/.test(security ?? '')
  ) {
    return { valid: false };
  }
  const expected = createHash('md5')
    .update(callId + secret + timestamp)
    .digest('hex');
  if (!timingSafeEqual(Buffer.from(expected), Buffer.from(security)) || type !== 'chat') return { valid: false };
  const from = vendorId(body.from);
  const to = vendorId(body.to);
  if (!from || !to || !(await areFriends(pool, from, to))) return { valid: false };
  const payload = body.payload;
  if (
    !payload ||
    !Array.isArray(payload.bodies) ||
    !payload.bodies.length ||
    payload.bodies.some((item) => !['txt', 'img', 'loc', 'audio', 'video', 'file'].includes(item?.type))
  )
    return { valid: false };
  const extras = payload.ext && typeof payload.ext === 'object' && !Array.isArray(payload.ext) ? payload.ext : {};
  if (extras.em_force_notification === true || Array.isArray(extras.em_force_notification)) return { valid: false };
  const configured = await notificationPolicy(pool, from, to, extras.penlia_quiet === true);
  const text = payload.bodies.every((item) => item.type === 'txt');
  const desired = configured.suppress;
  if (desired !== (extras.em_ignore_notification === true) && (text || process.env.PENLIA_IM_REWRITE_MEDIA === '1')) {
    const updated = { valid: true, payload: { ...payload, ext: { ...extras, em_ignore_notification: desired } } };
    if (Buffer.byteLength(JSON.stringify(updated)) <= 980) return updated;
  }
  return { valid: true };
}
