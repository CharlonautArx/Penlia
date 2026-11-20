import { cleanText, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { blocked, lockUsers } from '../p0/access.mjs';
import {
  assertAllowed,
  choose,
  conflict,
  dateOf,
  invalid,
  inviteesOf,
  missing,
  notify,
  timeOf,
} from '../p1/common.mjs';
import { known } from './access.mjs';
import { dayMs, membersOf, spaceOf } from './common.mjs';

export const kindOf = (value) => choose(value, ['trip', 'list', 'map', 'capsule']);

export async function spaces(user, query) {
  const kind = kindOf(query.get('kind'));
  const { rows } = await pool.query(
    `SELECT s.id,s.title,s.kind,o.name AS owner,s.owner_id AS "ownerId", CASE WHEN s.owner_id=$1 THEN 'active' ELSE m.state END state
    FROM p2_spaces s JOIN users o ON o.id=s.owner_id LEFT JOIN p2_members m ON m.space_id=s.id AND m.user_id=$1
    WHERE s.kind=$2 AND (s.owner_id=$1 OR m.state IN ('active','invited') AND NOT ${blocked('s.owner_id', '$1::uuid')})
    ORDER BY s.created_at DESC,s.id LIMIT 100`,
    [user, kind],
  );
  return { spaces: rows };
}

async function addMembers(db, space, ids) {
  if (!ids.length) return;
  const {
    rows: [count],
  } = await db.query(
    `SELECT count(*)::int n FROM p2_members
    WHERE space_id=$1 AND state IN ('invited','active') AND NOT user_id=ANY($2::uuid[])`,
    [space.id, ids],
  );
  if (count.n + ids.length > 29) throw invalid('此项目最多邀请 29 位成员。');
  const { rows } = await db.query(
    `INSERT INTO p2_members AS m(space_id,user_id,state) SELECT $1,id,'invited'
    FROM unnest($2::uuid[]) AS u(id) ON CONFLICT(space_id,user_id) DO UPDATE SET state='invited'
    WHERE m.state IN ('left','removed') RETURNING user_id`,
    [space.id, ids],
  );
  await notify(
    db,
    rows.map((r) => r.user_id),
    'p2_' + space.kind + '_invited',
    space.id,
  );
}

function tripDates(body) {
  const first = dateOf(body.startDay),
    last = dateOf(body.endDay);
  if (first > last || new Date(last) - new Date(first) > 180 * dayMs) throw invalid('旅行日期范围无效。');
  return [first, last];
}

export async function createSpace(user, body) {
  const client = readId(body.clientId),
    kind = kindOf(body.kind);
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const {
      rows: [existing],
    } = await db.query('SELECT id,kind FROM p2_spaces WHERE owner_id=$1 AND client_id=$2', [user, client]);
    if (existing) {
      if (existing.kind !== kind) throw conflict();
      return { id: existing.id };
    }
    const source = kind === 'trip' && body.gatheringId ? readId(body.gatheringId) : null;
    let gathered;
    let ids = await inviteesOf(db, user, body);
    if (source) {
      ({
        rows: [gathered],
      } = await db.query(
        `SELECT g.id,g.title FROM p1_gatherings g WHERE g.id=$1 AND g.owner_id=$2
        AND g.category='travel' AND g.state IN ('formed','completed') FOR UPDATE`,
        [source, user],
      ));
      if (!gathered) throw missing();
      const {
        rows: [old],
      } = await db.query('SELECT space_id AS id FROM p2_trips WHERE gathering_id=$1', [source]);
      if (old) return old;
      const { rows } = await db.query(
        `SELECT m.user_id AS id FROM p1_gathering_members m WHERE m.gathering_id=$1
        AND m.confirmed AND m.user_id<>$2 AND ${known('$2::uuid', 'm.user_id')}`,
        [source, user],
      );
      ids = rows.map((r) => r.id);
    }
    if (ids.length) await assertAllowed(db, user, ['limit_contact', 'limit_account']);
    const {
      rows: [space],
    } = await db.query(
      'INSERT INTO p2_spaces(owner_id,client_id,kind,title) VALUES($1,$2,$3,$4) RETURNING id,kind',
      [user, client, kind, cleanText(body.title ?? gathered?.title, 80, true)],
    );
    if (kind === 'trip') {
      await db.query(
        'INSERT INTO p2_trips(space_id,destination,start_day,end_day,gathering_id) VALUES($1,$2,$3,$4,$5)',
        [space.id, cleanText(body.destination, 120, true), ...tripDates(body), source],
      );
    }
    if (kind === 'capsule') {
      const opens = timeOf(body.opensAt);
      if (+opens <= Date.now()) throw invalid('开启时间须在未来。');
      await db.query('INSERT INTO p2_capsules(space_id,opens_at) VALUES($1,$2)', [space.id, opens]);
    }
    await addMembers(db, space, ids);
    return { id: space.id };
  });
}

export async function getSpace(user, id) {
  return inTransaction(pool, async (db) => {
    const space = await spaceOf(db, id, user, undefined, true);
    const members = (await membersOf(db, id, user)).filter(
      (p) => space.ownerId === user || p.state === 'active',
    );
    return { space, members };
  });
}

export async function inviteSpace(user, id, body) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const space = await spaceOf(db, id, user, undefined, true);
    if (space.ownerId !== user) throw missing();
    await assertAllowed(db, user, ['limit_contact', 'limit_account']);
    if (
      (await db.query('SELECT 1 FROM p2_capsules WHERE space_id=$1 AND sealed_at IS NOT NULL', [id])).rowCount
    )
      throw conflict('胶囊已封存，成员名单已锁定。');
    if (
      (await db.query('SELECT 1 FROM p2_trips WHERE space_id=$1 AND completed_at IS NOT NULL', [id])).rowCount
    )
      throw conflict('旅行已完成。');
    await addMembers(db, space, await inviteesOf(db, user, body));
    return {};
  });
}

export async function spaceMembership(user, id, body) {
  const action = choose(body.action, ['accept', 'decline', 'leave', 'remove']);
  const target = action === 'remove' ? readId(body.userId) : user;
  return inTransaction(pool, async (db) => {
    const {
      rows: [s],
    } = await db.query('SELECT s.owner_id,s.kind FROM p2_spaces s WHERE s.id=$1 FOR UPDATE', [id]);
    if (!s || target === s.owner_id || (action === 'remove' && s.owner_id !== user)) throw missing();
    if (action === 'accept') {
      const {
        rows: [eligible],
      } = await db.query(`SELECT ${known('$1::uuid', '$2::uuid')} AS allowed`, [s.owner_id, user]);
      if (!eligible.allowed) throw missing();
    }
    const before = {
      accept: ['invited'],
      decline: ['invited'],
      leave: ['active'],
      remove: ['active', 'invited'],
    }[action];
    const next = { accept: 'active', decline: 'declined', leave: 'left', remove: 'removed' }[action];
    if (
      !(
        await db.query(
          'UPDATE p2_members SET state=$3 WHERE space_id=$1 AND user_id=$2 AND state=ANY($4::text[])',
          [id, target, next, before],
        )
      ).rowCount
    )
      throw missing();
    if (s.kind === 'trip' && action !== 'decline')
      await db.query('DELETE FROM p2_trip_agreements WHERE space_id=$1', [id]);
    return {};
  });
}
