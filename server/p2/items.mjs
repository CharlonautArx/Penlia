import { cleanText, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { idsOf, lockUsers, verifyFriends } from '../p0/access.mjs';
import { assertAllowed, choose, conflict, invalid, missing } from '../p1/common.mjs';
import { itemVisible, known, member } from './access.mjs';
import { memoryVisible } from './memories.mjs';
import { assetList, deleteAssets, linkOf, replaceAssets, revisionOf, spaceOf, textOf } from './common.mjs';

const kinds = ['saved', 'place'];
const categories = ['food', 'film', 'music', 'travel', 'leisure', 'other'];
const fields = `i.id,i.owner_id AS "ownerId",i.kind,i.title,i.category,i.notes,i.city,i.location,i.tags,i.state,i.latitude,i.longitude,
  i.source_url AS "sourceUrl",i.revision,
  CASE WHEN i.owner_id=$1 OR EXISTS(SELECT 1 FROM p2_spaces ps WHERE ps.id=i.space_id AND ${member('ps', '$1::uuid')})
    THEN i.space_id END AS "spaceId",u.name AS author,${assetList('item', 'i.id')} AS media,
  CASE WHEN i.owner_id=$1 THEN i.scope END AS scope,
  CASE WHEN i.owner_id=$1 THEN i.audience_group END AS "groupId",
  CASE WHEN i.owner_id=$1 THEN ARRAY(SELECT viewer_id FROM p2_item_viewers v WHERE v.item_id=i.id ORDER BY viewer_id) END AS "memberIds",
  CASE WHEN i.owner_id=$1 THEN i.wish_id END AS "wishId",
  CASE WHEN i.trip_id IS NOT NULL AND EXISTS(SELECT 1 FROM p2_spaces ts WHERE ts.id=i.trip_id AND ${member('ts', '$1::uuid')}) THEN i.trip_id END AS "tripId",
  CASE WHEN i.memory_id IS NOT NULL AND EXISTS(SELECT 1 FROM p2_memories rm WHERE rm.id=i.memory_id
    AND ${memoryVisible('rm', '$1::uuid')}) THEN i.memory_id END AS "memoryId"`;

function coordinates(body, kind) {
  if (kind === 'saved' || (body.latitude == null && body.longitude == null)) return [null, null];
  if (
    typeof body.latitude !== 'number' ||
    typeof body.longitude !== 'number' ||
    !Number.isFinite(body.latitude) ||
    !Number.isFinite(body.longitude) ||
    Math.abs(body.latitude) > 90 ||
    Math.abs(body.longitude) > 180
  )
    throw invalid('请同时填写有效的纬度和经度，或将两项留空。');
  return [body.latitude, body.longitude];
}
function tagsOf(value) {
  if (!Array.isArray(value ?? []) || value?.length > 8) throw invalid('最多添加 8 个标签。');
  return [...new Set((value ?? []).map((tag) => cleanText(tag, 24, true)))];
}

export async function listItems(user, query) {
  const kind = choose(query.get('kind'), kinds);
  const tab = choose(query.get('tab') ?? 'mine', ['mine', 'friends', 'space']);
  const category = query.get('category') ? choose(query.get('category'), categories) : null;
  const space = tab === 'space' ? readId(query.get('space')) : null;
  const accessCondition =
    tab === 'mine'
      ? 'i.owner_id=$1'
      : tab === 'friends'
        ? `i.owner_id<>$1 AND ${known('i.owner_id', '$1::uuid')}`
        : 'i.space_id=$4';
  const offset = Number(query.get('offset') ?? 0);
  if (!Number.isInteger(offset) || offset < 0 || offset > 5000) throw invalid('无效的列表页码。');
  if (space) await spaceOf(pool, space, user, kind === 'place' ? 'map' : 'list');
  const { rows } = await pool.query(
    `SELECT ${fields} FROM p2_items i JOIN users u ON u.id=i.owner_id
    WHERE i.kind=$2 AND ($3::text IS NULL OR i.category=$3) AND ($4::uuid IS NULL OR i.space_id=$4)
      AND ${accessCondition} AND ${itemVisible('i', '$1::uuid')}
    ORDER BY i.created_at DESC,i.id DESC LIMIT 31 OFFSET $5`,
    [user, kind, category, space, offset],
  );
  return { items: rows.slice(0, 30), next: rows.length > 30 ? offset + 30 : null };
}

export async function itemDetail(user, id) {
  const {
    rows: [item],
  } = await pool.query(
    `SELECT ${fields} FROM p2_items i JOIN users u ON u.id=i.owner_id
    WHERE i.id=$2 AND ${itemVisible('i', '$1::uuid')}`,
    [user, id],
  );
  if (!item) throw missing();
  return { item };
}

export async function saveItem(user, body, id) {
  const kind = choose(body.kind, kinds),
    title = cleanText(body.title, 120, true),
    category = choose(body.category ?? 'other', categories);
  const scope = choose(body.scope ?? 'private', ['private', 'selected', 'group', 'space']);
  const space = body.spaceId ? readId(body.spaceId) : null;
  const group = scope === 'group' ? readId(body.groupId) : null;
  const wish = body.wishId ? readId(body.wishId) : null;
  const trip = body.tripId ? readId(body.tripId) : null;
  const memory = body.memoryId ? readId(body.memoryId) : null;
  if (scope === 'space' && !space) throw invalid('请先选择共同清单或地图。');
  const viewers = scope === 'selected' ? idsOf(body.memberIds ?? []) : [];
  if (scope === 'selected' && !viewers.length) throw invalid('请选择可见好友。');
  const values = [
    kind,
    space,
    title,
    category,
    textOf(body.notes, 800),
    textOf(body.location, 180),
    tagsOf(body.tags),
    choose(body.state ?? 'want', ['want', 'visited', 'done', 'recommended']),
    scope,
    group,
    linkOf(body.sourceUrl),
    ...coordinates(body, kind),
    wish,
    trip,
    memory,
    body.city === undefined ? null : textOf(body.city, 80),
  ];
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    if (space) await spaceOf(db, space, user, kind === 'place' ? 'map' : 'list', true);
    if (trip) await spaceOf(db, trip, user, 'trip');
    if (
      memory &&
      !(
        await db.query(
          `SELECT 1 FROM p2_memories m WHERE m.id=$1 AND m.owner_id=$2 AND ${memoryVisible('m', '$2::uuid')}`,
          [memory, user],
        )
      ).rowCount
    )
      throw missing();
    if (
      wish &&
      !(await db.query('SELECT 1 FROM p1_wishes WHERE id=$1 AND owner_id=$2', [wish, user])).rowCount
    )
      throw missing();
    if (
      group &&
      !(await db.query('SELECT 1 FROM relationship_groups WHERE id=$1 AND owner_id=$2', [group, user]))
        .rowCount
    )
      throw missing();
    await verifyFriends(db, user, viewers);
    if (scope !== 'private') await assertAllowed(db, user, ['limit_contact', 'limit_account']);
    let saved;
    if (id) {
      ({
        rows: [saved],
      } = await db.query(
        `UPDATE p2_items SET space_id=$4,title=$5,category=$6,notes=$7,location=$8,tags=$9,
        state=$10,scope=$11,audience_group=$12,source_url=$13,
        latitude=CASE WHEN $21 THEN $14 ELSE latitude END,longitude=CASE WHEN $21 THEN $15 ELSE longitude END,
        wish_id=$16,trip_id=$17,memory_id=$18,city=coalesce($19,city),revision=revision+1
        WHERE id=$1 AND owner_id=$2 AND kind=$3 AND revision=$20 RETURNING id`,
        [id, user, ...values, revisionOf(body.revision), body.latitude !== undefined || body.longitude !== undefined],
      ));
      if (!saved) throw conflict();
    } else {
      const client = readId(body.clientId);
      const {
        rows: [old],
      } = await db.query('SELECT id FROM p2_items WHERE owner_id=$1 AND client_id=$2', [user, client]);
      if (old) return old;
      ({
        rows: [saved],
      } = await db.query(
        `INSERT INTO p2_items(owner_id,client_id,kind,space_id,title,category,notes,location,tags,
        state,scope,audience_group,source_url,latitude,longitude,wish_id,trip_id,memory_id,city)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,coalesce($19,'')) RETURNING id`,
        [user, client, ...values],
      ));
    }
    await db.query('DELETE FROM p2_item_viewers WHERE item_id=$1', [saved.id]);
    await db.query('INSERT INTO p2_item_viewers SELECT $1,id FROM unnest($2::uuid[]) AS viewer(id)', [
      saved.id,
      viewers,
    ]);
    if (body.mediaIds !== undefined) await replaceAssets(db, 'item', saved.id, user, idsOf(body.mediaIds, 1));
    return saved;
  });
}

export async function copyItem(user, id, body) {
  const client = readId(body.clientId);
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const {
      rows: [old],
    } = await db.query('SELECT id FROM p2_items WHERE owner_id=$1 AND client_id=$2', [user, client]);
    if (old) return old;
    const {
      rows: [copy],
    } = await db.query(
      `INSERT INTO p2_items(owner_id,client_id,kind,title,category,notes,city,location,tags,state,scope,source_url,latitude,longitude)
      SELECT $1,$2,i.kind,i.title,i.category,i.notes,i.city,i.location,i.tags,i.state,'private',i.source_url,i.latitude,i.longitude FROM p2_items i
      WHERE i.id=$3 AND ${itemVisible('i', '$1::uuid')} RETURNING id`,
      [user, client, id],
    );
    if (!copy) throw missing();
    return copy;
  });
}

export async function removeItem(user, id) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    if (
      !(await db.query('SELECT 1 FROM p2_items WHERE id=$1 AND owner_id=$2 FOR UPDATE', [id, user])).rowCount
    )
      throw missing();
    await deleteAssets(db, 'item', id);
    await db.query('DELETE FROM p2_items WHERE id=$1', [id]);
    return {};
  });
}

export async function placeResonance(user) {
  const { rows } = await pool.query(
    `SELECT a.id,a.title,u.name AS friend,b.owner_id AS "friendId"
    FROM p2_items a JOIN p2_items b ON b.kind='place' AND b.state='want' AND lower(a.title)=lower(b.title)
      AND abs(a.latitude-b.latitude)<=0.01 AND least(abs(a.longitude-b.longitude),360-abs(a.longitude-b.longitude))<=0.01
    JOIN users u ON u.id=b.owner_id
    WHERE a.owner_id=$1 AND b.owner_id<>$1 AND a.kind='place' AND a.state='want'
      AND ${known('$1::uuid', 'b.owner_id')} AND ${itemVisible('a', 'b.owner_id')} AND ${itemVisible('b', '$1::uuid')}
    GROUP BY a.id,u.name,b.owner_id ORDER BY a.id,b.owner_id LIMIT 50`,
    [user],
  );
  return { matches: rows };
}
