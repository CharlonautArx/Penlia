import { cleanText, HttpError, inTransaction } from '../core.mjs';
import { pool } from '../db.mjs';
import { decodeJpeg } from './profile-cover.mjs';

export const avatarOf = (user) => `replace(encode(${user}.profile_avatar,'base64'), E'\\n','')`;
export const handleOf = (user) => `coalesce(${user}.profile_handle,${user}.username)`;
export const identityFields = (user) => `${user}.id, ${handleOf(user)} AS username, ${user}.name, ${user}.bio,
  ${user}.profile_region AS region, ${avatarOf(user)} AS avatar, ${user}.avatar_updated_at AS "avatarUpdatedAt",
  (CASE WHEN ${user}.handle_updated_at IS NOT NULL
    THEN ((${user}.handle_updated_at AT TIME ZONE 'UTC') + interval '1 year') AT TIME ZONE 'UTC'
  END) AS "nextHandleChangeAt"`;

export async function handleAvailable(db, handle, owner = null) {
  await db.query("SELECT pg_advisory_xact_lock(hashtextextended('penlia-handle:' || $1,0))", [handle]);
  const found = await db.query('SELECT 1 FROM users WHERE (username=$1 OR profile_handle=$1) AND id IS DISTINCT FROM $2::uuid',
    [handle, owner]);
  return !found.rowCount;
}

export async function editProfile(id, body) {
  const allowed = ['name', 'bio', 'region', 'avatar', 'username'];
  if (!allowed.some((key) => Object.hasOwn(body, key))) throw new HttpError(400, '没有可保存的资料。');
  return inTransaction(pool, async (db) => {
    const { rows: [user] } = await db.query(`SELECT ${identityFields('u')},clock_timestamp() AS now FROM users u WHERE u.id=$1 FOR UPDATE`, [id]);
    if (!user) throw new HttpError(404, '找不到这个账号。');
    const patch = [];
    const values = [id];
    const assign = (key, value) => { values.push(value); patch.push(key + '=$' + values.length); };
    if (Object.hasOwn(body, 'name')) assign('name', cleanText(body.name, 16, true));
    if (Object.hasOwn(body, 'bio')) assign('bio', cleanText(body.bio, 60));
    if (Object.hasOwn(body, 'region') && (body.importRegion !== true || user.region === null)) assign('profile_region', cleanText(body.region, 24));
    if (Object.hasOwn(body, 'avatar') && (body.importAvatar !== true || !user.avatarUpdatedAt)) {
      assign('profile_avatar', body.avatar === null ? null : decodeJpeg(body.avatar, 32768));
      patch.push('avatar_updated_at=clock_timestamp()');
    }
    if (Object.hasOwn(body, 'username')) {
      const handle = typeof body.username === 'string' ? body.username.trim().toLowerCase() : '';
      if (!/^[a-z0-9_]{3,24}$/.test(handle)) throw new HttpError(400, '朋聊号须为 3–24 位字母、数字或下划线。');
      if (handle !== user.username) {
        if (user.nextHandleChangeAt && user.nextHandleChangeAt > user.now)
          throw new HttpError(409, '上次修改满一年后才能更换朋聊号。');
        if (!await handleAvailable(db, handle, id)) throw new HttpError(409, '该朋聊号已被使用。');
        assign('profile_handle', handle);
        patch.push('handle_updated_at=clock_timestamp()');
      }
    }
    if (!patch.length) {
      const { now, ...unchanged } = user;
      return unchanged;
    }
    const { rows: [saved] } = await db.query(`UPDATE users SET ${patch.join(',')} WHERE id=$1 RETURNING ${identityFields('users')}`, values);
    return saved;
  });
}
