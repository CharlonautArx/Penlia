import { cleanText, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { lockUsers } from '../p0/access.mjs';
import { assertAllowed, choose, conflict, dateOf, invalid, inviteesOf, missing, notify } from '../p1/common.mjs';
import { known } from '../p2/access.mjs';
import { revisionOf } from '../p2/common.mjs';
import { member, separated } from './access.mjs';
import { revokeMemberGrants } from './contact-cleanup.mjs';

const kinds = ['relay', 'world'];
const columns = `s.id,s.owner_id AS "ownerId",s.kind,s.title,s.event_day::text AS "eventDay",
  s.scene,s.pet_name AS "petName",s.greeted_at AS "greetedAt",s.revision,s.roster_version AS "rosterVersion"`;

export async function spaceOf(db, user, id, lock = false) {
  const { rows: [space] } = await db.query(
    `SELECT ${columns} FROM p3_spaces s WHERE s.id=$2 AND ${member('s','$1::uuid')} ${lock ? 'FOR UPDATE OF s' : ''}`,
    [user,id],
  );
  if (!space) throw missing();
  return space;
}

export async function listSpaces(user, query) {
  const kind = choose(query.get('kind'), kinds);
  const offset = Number(query.get('offset') ?? 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 5000) throw invalid();
  const { rows } = await pool.query(
    `SELECT s.id,s.title,s.event_day::text AS "eventDay",u.name AS owner, s.kind,
      CASE WHEN s.owner_id=$1 THEN 'active' ELSE m.state END AS state
    FROM p3_spaces s JOIN users u ON u.id=s.owner_id
    LEFT JOIN p3_members m ON m.space_id=s.id AND m.user_id=$1
    WHERE s.kind=$2 AND (${member('s','$1::uuid')} OR
      (m.state='invited' AND ${known('s.owner_id','$1::uuid')}))
    ORDER BY (m.state IS NOT DISTINCT FROM 'invited') DESC,s.created_at DESC,s.id DESC LIMIT 31 OFFSET $3`,
    [user,kind,offset],
  );
  return { spaces: rows.slice(0,30), next: rows.length > 30 ? offset+30 : null };
}

export async function getSpace(user, id) {
  return inTransaction(pool, async (db) => {
    const space = await spaceOf(db, user, id, true);
    const { rows: members } = await db.query(
      `SELECT u.id,u.name,CASE WHEN u.id=s.owner_id THEN 'active' ELSE m.state END AS state
      FROM p3_spaces s JOIN users u ON u.id=s.owner_id OR EXISTS(
        SELECT 1 FROM p3_members p WHERE p.space_id=s.id AND p.user_id=u.id)
      LEFT JOIN p3_members m ON m.space_id=s.id AND m.user_id=u.id
      WHERE s.id=$2 AND ${member('s','$1::uuid')} AND NOT ${separated('$1::uuid','u.id')}
        AND (u.id=s.owner_id OR m.state='active' OR (s.owner_id=$1 AND m.state='invited'))
      ORDER BY (u.id=s.owner_id) DESC,u.name,u.id`, [user,id],
    );
    return { space, members };
  });
}

async function addInvites(db, space, ids) {
  if (!ids.length) return;
  const { rows: [count] } = await db.query(
    `SELECT count(*)::int AS n FROM p3_members WHERE space_id=$1
      AND state IN ('active','invited') AND NOT(user_id=ANY($2::uuid[]))`, [space.id,ids],
  );
  if (count.n + ids.length > 15) throw invalid('最多邀请 15 位成员。');
  const { rows } = await db.query(
    `INSERT INTO p3_members AS m(space_id,user_id,state)
    SELECT $1,x.id,'invited' FROM unnest($2::uuid[]) x(id) WHERE ${known('$3::uuid','x.id')}
    ON CONFLICT(space_id,user_id) DO UPDATE SET state='invited' WHERE m.state IN ('left','removed')
    RETURNING user_id`,
    [space.id,ids,space.ownerId],
  );
  if (rows.length) await notify(db,rows.map((row) => row.user_id),'p3_'+space.kind+'_invited',space.id);
}

export async function createSpace(user, body) {
  const kind = choose(body.kind,kinds), client = readId(body.clientId);
  const title = cleanText(body.title,80,true);
  const day = kind === 'relay' ? dateOf(body.eventDay) : null;
  return inTransaction(pool, async (db) => {
    await lockUsers(db,user);
    const { rows: [existing] } = await db.query(
      'SELECT id,kind FROM p3_spaces WHERE owner_id=$1 AND client_id=$2', [user,client],
    );
    if (existing) {
      if (existing.kind !== kind) throw conflict();
      return { id: existing.id };
    }
    await assertAllowed(db,user,['limit_account']);
    const ids = await inviteesOf(db,user,body,15);
    if (ids.length) await assertAllowed(db,user,['limit_contact']);
    const { rows: [count] } = await db.query(
      'SELECT count(*)::int AS n FROM p3_spaces WHERE owner_id=$1 AND kind=$2', [user,kind],
    );
    if (count.n >= 100) throw invalid('空间数量已达上限。');
    const { rows: [space] } = await db.query(
      'INSERT INTO p3_spaces(owner_id,client_id,kind,title,event_day) VALUES($1,$2,$3,$4,$5) RETURNING id',
      [user,client,kind,title,day],
    );
    await addInvites(db,{ ...space,kind,ownerId:user },ids);
    return space;
  });
}

export async function invite(user, id, body) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db,user);
    const space = await spaceOf(db,user,id,true);
    if (space.ownerId !== user) throw missing();
    await assertAllowed(db,user,['limit_contact','limit_account']);
    await addInvites(db,space,await inviteesOf(db,user,body,15));
    return {};
  });
}

export async function membership(user,id,body) {
  const action = choose(body.action,['accept','decline','leave','remove']);
  const target = action === 'remove' ? readId(body.userId) : user;
  const [before, after] = {
    accept:[['invited'],'active'], decline:[['invited'],'declined'],
    leave:[['active'],'left'], remove:[['invited','active'],'removed'],
  }[action];
  return inTransaction(pool, async (db) => {
    await lockUsers(db,user,target);
    const { rows: [space] } = await db.query('SELECT owner_id FROM p3_spaces WHERE id=$1 FOR UPDATE',[id]);
    if (!space || target === space.owner_id || (action === 'remove' && user !== space.owner_id)) throw missing();
    const changed = await db.query(
      `UPDATE p3_members m SET state=$3 FROM p3_spaces s
      WHERE s.id=$1 AND m.space_id=s.id AND m.user_id=$2 AND m.state=ANY($4::text[])
      AND ($3<>'active' OR ${known('s.owner_id','m.user_id')})`, [id,target,after,before],
    );
    if (!changed.rowCount) throw missing();
    if (action !== 'decline') await db.query('UPDATE p3_spaces SET roster_version=roster_version+1 WHERE id=$1',[id]);
    if (action === 'leave' || action === 'remove') await revokeMemberGrants(db,id,target);
    return {};
  });
}

export async function updateWorld(user,id,body) {
  if (body.action === 'greet') {
    return inTransaction(pool, async (db) => {
      const space = await spaceOf(db,user,id,true);
      if (space.kind !== 'world') throw missing();
      const { rows: [world] } = await db.query(
        `UPDATE p3_spaces SET greeted_at=now() WHERE id=$1
         AND (greeted_at IS NULL OR greeted_at<=now()-interval '2 seconds') RETURNING greeted_at AS "greetedAt"`, [id],
      );
      return world ?? { greetedAt:space.greetedAt };
    });
  }
  if (body.action !== 'arrange') throw invalid();
  const scene = choose(body.scene,['garden','coast','night']);
  const name = cleanText(body.petName,16,true);
  const revision = revisionOf(body.revision);
  return inTransaction(pool, async (db) => {
    await lockUsers(db,user);
    const space = await spaceOf(db,user,id,true);
    if (space.kind !== 'world') throw missing();
    await assertAllowed(db,user,['limit_account']);
    if (space.revision !== revision) throw conflict();
    await db.query('UPDATE p3_spaces SET scene=$2,pet_name=$3,revision=revision+1 WHERE id=$1',[id,scene,name]);
    return {};
  });
}
