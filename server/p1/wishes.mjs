import { cleanText, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { idsOf, lockUsers, related, restricted, verifyFriends } from '../p0/access.mjs';
import { categoryOf, choose, invalid, missing, notify, timeOf } from './common.mjs';

const fields =
  'id, category, description, place, available_at AS "availableAt", budget_cents AS "budgetCents", scope, group_id AS "groupId", active';
const shares = (wish, viewer) => `(${wish}.scope='friends' OR
  (${wish}.scope='selected' AND EXISTS(SELECT 1 FROM p1_wish_audience wa WHERE wa.wish_id=${wish}.id AND wa.user_id=${viewer})) OR
  (${wish}.scope='group' AND EXISTS(SELECT 1 FROM relationship_group_members gm JOIN relationship_groups g ON g.id=gm.group_id
     WHERE g.id=${wish}.group_id AND g.owner_id=${wish}.owner_id AND gm.user_id=${viewer})))`;

const compatible = `a.active AND b.active AND a.owner_id<>b.owner_id AND a.category=b.category
  AND (a.category<>'other' OR lower(a.description)=lower(b.description))
  AND (a.place='' OR b.place='' OR lower(a.place)=lower(b.place))
  AND (a.available_at IS NULL OR b.available_at IS NULL OR abs(extract(epoch FROM (a.available_at-b.available_at)))<=86400)
  AND (a.available_at IS NULL OR a.available_at>now()) AND (b.available_at IS NULL OR b.available_at>now())
  AND ${related('a.owner_id', 'b.owner_id')} AND NOT ${restricted('a.owner_id', 'b.owner_id')} AND NOT ${restricted('b.owner_id', 'a.owner_id')}
  AND ${shares('a', 'b.owner_id')} AND ${shares('b', 'a.owner_id')}`;

export async function listWishes(user) {
  const own = await pool.query(
    `SELECT ${fields},ARRAY(SELECT u.user_id FROM p1_wish_audience u WHERE u.wish_id=w.id) AS "memberIds"
    FROM p1_wishes w WHERE owner_id=$1 ORDER BY updated_at DESC,id LIMIT 30`,
    [user],
  );
  const matches = await pool.query(
    `SELECT a.id AS "wishId",a.category,a.description,a.place,a.available_at AS "availableAt",
    u.id AS "friendId",u.name AS "friendName"
    FROM p1_wishes a JOIN p1_wishes b ON a.category=b.category JOIN users u ON u.id=b.owner_id
    WHERE a.owner_id=$1 AND ${compatible}
    GROUP BY a.id,u.id,u.name ORDER BY a.updated_at DESC,a.id,u.id LIMIT 60`,
    [user],
  );
  return { wishes: own.rows, matches: matches.rows };
}

async function recordPairs(db, wish) {
  const { rows } = await db.query(
    `WITH candidates AS (
    SELECT b.id FROM p1_wishes a JOIN p1_wishes b ON a.category=b.category WHERE a.id=$1 AND ${compatible}
    ORDER BY b.updated_at DESC,b.id LIMIT 60
  ), added AS (
    INSERT INTO p1_wish_matches(first_wish,second_wish)
    SELECT least($1::uuid,id),greatest($1::uuid,id) FROM candidates ON CONFLICT DO NOTHING
    RETURNING first_wish,second_wish
  ) SELECT a.id AS "first",a.owner_id AS owner1,b.id AS "second",b.owner_id AS owner2
    FROM added JOIN p1_wishes a ON a.id=first_wish JOIN p1_wishes b ON b.id=second_wish`,
    [wish],
  );
  for (const pair of rows) {
    await notify(db, [pair.owner1], 'wish_match', pair.first);
    await notify(db, [pair.owner2], 'wish_match', pair.second);
  }
}

export async function saveWish(user, body, id) {
  const category = categoryOf(body.category);
  const description = cleanText(body.description, 200, true);
  const place = cleanText(body.place ?? '', 120);
  const at = body.availableAt ? timeOf(body.availableAt) : null;
  const budget = body.budgetCents ?? null;
  if (budget !== null && (!Number.isInteger(budget) || budget < 0 || budget > 100000000))
    throw invalid('预算金额无效。');
  const scope = choose(body.scope, ['private', 'friends', 'selected', 'group']);
  const chosen = scope === 'selected' ? idsOf(body.memberIds ?? [], 29) : [];
  if (scope === 'selected' && !chosen.length) throw invalid('请选择可参与匹配的好友。');
  const group = scope === 'group' ? readId(body.groupId) : null;
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    if (
      group &&
      !(await db.query('SELECT 1 FROM relationship_groups WHERE id=$1 AND owner_id=$2', [group, user]))
        .rowCount
    )
      throw missing();
    await verifyFriends(db, user, chosen);
    const fields = [category, description, place, at, budget, scope, group, body.active !== false];
    let saved;
    if (id) {
      ({
        rows: [saved],
      } = await db.query(
        `UPDATE p1_wishes SET category=$3,description=$4,place=$5,available_at=$6,
        budget_cents=$7,scope=$8,group_id=$9,active=$10,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING id`,
        [id, user, ...fields],
      ));
    } else {
      const clientId = readId(body.clientId);
      const {
        rows: [existing],
      } = await db.query('SELECT id FROM p1_wishes WHERE owner_id=$1 AND client_id=$2', [user, clientId]);
      if (existing) return existing;
      const {
        rows: [count],
      } = await db.query('SELECT count(*)::int AS n FROM p1_wishes WHERE owner_id=$1', [user]);
      if (count.n >= 30) throw invalid('心愿数量已达上限。');
      ({
        rows: [saved],
      } = await db.query(
        `INSERT INTO p1_wishes(owner_id,client_id,category,description,place,available_at,budget_cents,scope,group_id,active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
        [user, clientId, ...fields],
      ));
    }
    if (!saved) throw missing();
    await db.query('DELETE FROM p1_wish_audience WHERE wish_id=$1', [saved.id]);
    await db.query(
      'INSERT INTO p1_wish_audience(wish_id,user_id) SELECT $1,id FROM unnest($2::uuid[]) AS selected(id)',
      [saved.id, chosen],
    );
    await recordPairs(db, saved.id);
    return saved;
  });
}

export async function removeWish(user, id) {
  const result = await pool.query('DELETE FROM p1_wishes WHERE id=$1 AND owner_id=$2', [id, user]);
  if (!result.rowCount) throw missing();
  return {};
}

export async function pauseWish(user, id, active) {
  if (typeof active !== 'boolean') throw invalid();
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const changed = await db.query(
      'UPDATE p1_wishes SET active=$3,updated_at=now() WHERE id=$1 AND owner_id=$2 RETURNING id',
      [id, user, active],
    );
    if (!changed.rowCount) throw missing();
    if (active) await recordPairs(db, id);
    return changed.rows[0];
  });
}
