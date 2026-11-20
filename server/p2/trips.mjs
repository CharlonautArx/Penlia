import { cleanText, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { blocked, idsOf, lockUsers } from '../p0/access.mjs';
import { choose, conflict, dateOf, invalid, missing, notify } from '../p1/common.mjs';
import { createCollection, createEntry } from '../p1/collections.mjs';
import { itemVisible } from './access.mjs';
import {
  assetList,
  dayMs,
  deleteAssets,
  linkOf,
  membersOf,
  replaceAssets,
  revisionOf,
  spaceOf,
  textOf,
} from './common.mjs';

const projection = `t.destination,t.start_day::text AS "startDay",t.end_day::text AS "endDay",t.gathering_id AS "gatheringId",
  t.journal_id AS "journalId",t.completed_at AS "completedAt",t.revision`;
async function tripOf(db, id, user, lock = false) {
  const space = await spaceOf(db, id, user, 'trip', lock);
  const {
    rows: [trip],
  } = await db.query('SELECT ' + projection + ' FROM p2_trips t WHERE t.space_id=$1', [id]);
  return { ...space, ...trip };
}
const editable = (trip) => {
  if (trip.completedAt) throw conflict('这段旅行已经完成。');
};

export async function updateTrip(user, id, body) {
  const title = cleanText(body.title, 80, true),
    destination = cleanText(body.destination, 120, true);
  const start = dateOf(body.startDay),
    end = dateOf(body.endDay),
    revision = revisionOf(body.revision);
  if (start > end || new Date(end) - new Date(start) > 180 * dayMs) throw invalid('旅行日期范围无效。');
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const trip = await tripOf(db, id, user, true);
    if (trip.ownerId !== user) throw missing();
    editable(trip);
    if (trip.revision !== revision) throw conflict();
    if (
      (
        await db.query(
          'SELECT 1 FROM p2_itinerary WHERE space_id=$1 AND (event_day<$2 OR event_day>$3) LIMIT 1',
          [id, start, end],
        )
      ).rowCount
    )
      throw conflict('调整日期前，请先移动超出新日期范围的行程。');
    await db.query('UPDATE p2_spaces SET title=$2 WHERE id=$1', [id, title]);
    await db.query(
      'UPDATE p2_trips SET destination=$2,start_day=$3,end_day=$4,revision=revision+1 WHERE space_id=$1',
      [id, destination, start, end],
    );
    await db.query('DELETE FROM p2_trip_agreements WHERE space_id=$1', [id]);
    return {};
  });
}

export async function tripDetail(user, id) {
  return inTransaction(pool, async (db) => {
    const trip = await tripOf(db, id, user, true);
    const { rows: items } = await db.query(
      `SELECT i.id,i.title,i.category,i.details,i.source_url AS "sourceUrl",i.position,u.name author,
      i.author_id AS "authorId",i.event_day::text AS "eventDay",i.revision,${assetList('itinerary', 'i.id')} AS media,
      (SELECT prefer FROM p2_itinerary_votes v WHERE v.item_id=i.id AND v.voter_id=$2) AS "myVote",
      CASE WHEN EXISTS(SELECT 1 FROM p2_items p WHERE p.id=i.saved_item_id AND ${itemVisible('p', '$2::uuid')}) THEN i.saved_item_id END AS "savedItemId",
      (SELECT count(*)::int FROM p2_itinerary_votes v JOIN p2_spaces s ON s.id=i.space_id
        LEFT JOIN p2_members m ON m.space_id=i.space_id AND m.user_id=v.voter_id
        WHERE v.item_id=i.id AND v.prefer AND (s.owner_id=v.voter_id OR m.state='active' AND NOT ${blocked('s.owner_id', 'v.voter_id')})
        AND NOT ${blocked('$2::uuid', 'v.voter_id')}) AS support
      FROM p2_itinerary i JOIN users u ON u.id=i.author_id WHERE i.space_id=$1 AND NOT ${blocked('$2::uuid', 'i.author_id')}
      ORDER BY i.event_day,i.position,i.id LIMIT 250`,
      [id, user],
    );
    const members = (await membersOf(db, id, user)).filter(
      (m) => trip.ownerId === user || m.state === 'active',
    );
    const { rows } = await db.query(
      `SELECT user_id FROM p2_trip_agreements a WHERE space_id=$1
      AND NOT ${blocked('$2::uuid', 'user_id')}`,
      [id, user],
    );
    return { trip, items, members, myAgreement: rows.some((r) => r.user_id === user) };
  });
}
export async function saveItinerary(user, tripId, body, id) {
  const day = dateOf(body.eventDay),
    title = cleanText(body.title, 120, true),
    category = choose(body.category, ['sight', 'food', 'stay', 'transit', 'other']);
  const details = textOf(body.details, 800),
    url = linkOf(body.sourceUrl);
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const trip = await tripOf(db, tripId, user, true);
    editable(trip);
    if (day < trip.startDay || day > trip.endDay) throw invalid('行程日期须在旅行日期内。');
    const savedId = body.savedItemId ? readId(body.savedItemId) : null;
    if (
      savedId &&
      !(
        await db.query(`SELECT 1 FROM p2_items p WHERE p.id=$1 AND ${itemVisible('p', '$2::uuid')}`, [
          savedId,
          user,
        ])
      ).rowCount
    )
      throw missing();
    let saved;
    if (id) {
      ({
        rows: [saved],
      } = await db.query(
        `UPDATE p2_itinerary i SET title=$3,category=$4,details=$5,source_url=$6,
        position=CASE WHEN event_day=$7::date THEN position ELSE (SELECT coalesce(max(position),0)+1
          FROM p2_itinerary WHERE space_id=$1 AND event_day=$7) END,
        event_day=$7,saved_item_id=$8,revision=revision+1
        WHERE space_id=$1 AND id=$2 AND revision=$9 AND NOT ${blocked('$10::uuid', 'i.author_id')} RETURNING id`,
        [tripId, id, title, category, details, url, day, savedId, revisionOf(body.revision), user],
      ));
      if (!saved) throw conflict();
    } else {
      const client = readId(body.clientId);
      const {
        rows: [old],
      } = await db.query('SELECT id FROM p2_itinerary WHERE space_id=$1 AND author_id=$2 AND client_id=$3', [
        tripId,
        user,
        client,
      ]);
      if (old) return old;
      const {
        rows: [count],
      } = await db.query('SELECT count(*)::int AS n FROM p2_itinerary WHERE space_id=$1', [tripId]);
      if (count.n >= 250) throw invalid('行程条目已达上限。');
      ({
        rows: [saved],
      } = await db.query(
        `INSERT INTO p2_itinerary(space_id,author_id,client_id,title,category,details,source_url,event_day,saved_item_id,position)
        SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,coalesce(max(position),0)+1 FROM p2_itinerary WHERE space_id=$1 AND event_day=$8 RETURNING id`,
        [tripId, user, client, title, category, details, url, day, savedId],
      ));
    }
    if (body.mediaIds !== undefined)
      await replaceAssets(db, 'itinerary', saved.id, user, idsOf(body.mediaIds, 4));
    await db.query('DELETE FROM p2_trip_agreements WHERE space_id=$1', [tripId]);
    return saved;
  });
}
export async function tripAction(user, id, body) {
  const action = choose(body.action, ['reorder', 'vote', 'delete', 'agree', 'journal']);
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const trip = await tripOf(db, id, user, true);
    if (action === 'journal') {
      if (trip.ownerId !== user) throw missing();
      if (trip.journalId) return { id: trip.journalId };
      if (trip.completedAt) throw conflict('这段旅行已转换过日记。');
      const {
        rows: [time],
      } = await db.query(
        `SELECT t.end_day<=(now() AT TIME ZONE coalesce(
        (SELECT zone FROM privacy_preferences WHERE user_id=$2),'Asia/Shanghai'))::date AS ready FROM p2_trips t WHERE t.space_id=$1`,
        [id, user],
      );
      if (!time.ready) throw conflict('旅行结束后才能转为共同日记。');
      if (body.confirmed !== true) throw invalid('请确认将这段旅行关联到共同日记。');
      const { rows } = await db.query(
        `SELECT user_id FROM p2_members WHERE space_id=$1 AND state='active'
        AND NOT ${blocked('$2::uuid', 'user_id')} ORDER BY user_id`,
        [id, user],
      );
      const active = [user, ...rows.map((p) => p.user_id)];
      const {
        rows: [count],
      } = await db.query(
        'SELECT count(*)::int n FROM p2_trip_agreements WHERE space_id=$1 AND user_id=ANY($2::uuid[])',
        [id, active],
      );
      if (count.n !== active.length) throw conflict('需全部现有成员同意后才能转为共同日记。');
      const diary = await createCollection(
        user,
        { clientId: id, kind: 'journal', title: trip.title, memberIds: active.slice(1) },
        db,
      );
      await createEntry(
        user,
        diary.id,
        { clientId: id, title: trip.title, category: 'travel', eventDate: trip.endDay },
        db,
      );
      await db.query('UPDATE p2_trips SET completed_at=now(),journal_id=$2 WHERE space_id=$1', [
        id,
        diary.id,
      ]);
      await notify(db, active.slice(1), 'p2_trip_journal', id);
      return diary;
    }
    editable(trip);
    if (action === 'agree') {
      const value = choose(body.agree, [true, false]);
      if (value)
        await db.query('INSERT INTO p2_trip_agreements VALUES($1,$2) ON CONFLICT DO NOTHING', [id, user]);
      else await db.query('DELETE FROM p2_trip_agreements WHERE space_id=$1 AND user_id=$2', [id, user]);
      return {};
    }
    if (action === 'reorder') {
      const order = idsOf(body.itemIds, 250),
        day = dateOf(body.eventDay);
      const { rows } = await db.query(
        `SELECT i.id,${blocked('$3::uuid', 'i.author_id')} AS blocked FROM p2_itinerary i WHERE i.space_id=$1 AND i.event_day=$2`,
        [id, day, user],
      );
      if (
        rows.some((r) => r.blocked) ||
        rows.length !== order.length ||
        rows.some((r) => !order.includes(r.id))
      )
        throw conflict('行程已更新，请刷新后再排序。');
      await db.query(
        `UPDATE p2_itinerary i SET position=o.position FROM unnest($1::uuid[]) WITH ORDINALITY AS o(id,position)
        WHERE i.id=o.id`,
        [order],
      );
      await db.query('DELETE FROM p2_trip_agreements WHERE space_id=$1', [id]);
      return {};
    }
    const item = readId(body.itemId);
    const {
      rows: [line],
    } = await db.query(
      `SELECT i.author_id FROM p2_itinerary i WHERE i.space_id=$1 AND i.id=$2
      AND NOT ${blocked('$3::uuid', 'i.author_id')}`,
      [id, item, user],
    );
    if (!line) throw missing();
    if (action === 'vote')
      await db.query(
        `INSERT INTO p2_itinerary_votes VALUES($1,$2,$3)
      ON CONFLICT(item_id,voter_id) DO UPDATE SET prefer=excluded.prefer`,
        [item, user, choose(body.prefer, [true, false])],
      );
    if (action === 'delete') {
      if (line.author_id !== user && trip.ownerId !== user) throw missing();
      await deleteAssets(db, 'itinerary', item);
      await db.query('DELETE FROM p2_itinerary WHERE id=$1', [item]);
      await db.query('DELETE FROM p2_trip_agreements WHERE space_id=$1', [id]);
    }
    return {};
  });
}
