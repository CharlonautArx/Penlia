import { HttpError, readId } from '../core.mjs';
import { blocked, idsOf, verifyFriends } from '../p0/access.mjs';

export const missing = () => new HttpError(404, '找不到可访问的记录。');
export const invalid = (message = '请检查提交内容。') => new HttpError(400, message);
export const conflict = (message = '当前状态已变化，请刷新后重试。') => new HttpError(409, message);

export function choose(value, values) {
  if (!values.includes(value)) throw invalid();
  return value;
}
export const categoryOf = (value) =>
  choose(value, ['food', 'film', 'travel', 'sports', 'walk', 'games', 'other']);

export function timeOf(value) {
  if (
    typeof value !== 'string' ||
    !/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d{1,3})?)?(?:Z|[+-]\d\d:\d\d)$/.test(value)
  ) {
    throw invalid('请填写带时区的日期时间。');
  }
  const date = new Date(value);
  if (!Number.isFinite(+date)) throw invalid('日期时间无效。');
  return date;
}

export function dateOf(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\d$/.test(value))
    throw invalid('日期格式须为 YYYY-MM-DD。');
  const date = new Date(value);
  if (!Number.isFinite(+date) || date.toISOString().slice(0, 10) !== value) throw invalid('日期无效。');
  return value;
}

export async function inviteesOf(db, owner, body, maximum = 29) {
  const ids = idsOf(body.memberIds ?? [], maximum);
  if (body.groupId) {
    const id = readId(body.groupId);
    const {
      rows: [group],
    } = await db.query('SELECT id FROM relationship_groups WHERE id=$1 AND owner_id=$2', [id, owner]);
    if (!group) throw missing();
    const { rows } = await db.query(
      'SELECT user_id FROM relationship_group_members WHERE group_id=$1 LIMIT $2',
      [id, maximum + 1],
    );
    ids.push(...rows.map((row) => row.user_id));
  }
  const distinct = [...new Set(ids)];
  if (distinct.includes(owner) || distinct.length > maximum) throw invalid('请选择有效人数的好友。');
  await verifyFriends(db, owner, distinct);
  return distinct;
}

export function notify(db, users, kind, subject) {
  return db.query(
    'INSERT INTO p1_events(user_id,kind,subject_id) SELECT id,$2,$3 FROM unnest($1::uuid[]) AS u(id)',
    [[...new Set(users)], kind, subject],
  );
}

export { assertAllowed } from './enforcement-access.mjs';

export const canParticipate = (owner, user) => `(${owner}=${user} OR NOT ${blocked(owner, user)})`;
