import { cleanText, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { blocked, lockUsers } from '../p0/access.mjs';
import { assertAllowed, choose, conflict, invalid, missing, notify, timeOf } from '../p1/common.mjs';
import { known } from './access.mjs';
import { dayMs, revisionOf, textOf } from './common.mjs';

const fields = 'id,title,details,starts_at AS "startsAt",ends_at AS "endsAt",visibility,revision';
const activeLink = `(e.gathering_id IS NULL OR EXISTS(
  SELECT 1 FROM p1_gathering_members m JOIN p1_gatherings g ON g.id=m.gathering_id
  WHERE m.gathering_id=e.gathering_id AND m.user_id=e.owner_id AND m.confirmed
  AND g.state IN ('confirming','formed','completed') AND NOT ${blocked('g.owner_id', 'm.user_id')}))`;
const estimateBasis = 'authorized_calendar_estimate';

function interval(from, to, max = 62) {
  const start = timeOf(from),
    end = timeOf(to);
  if (end <= start || end - start > max * dayMs) throw invalid('请选取有效时间范围。');
  return [start, end];
}

export function sharedFreeWindows(rangeStart, rangeEnd, events) {
  const min = 30 * 60 * 1000;
  const limits = events
    .map((event) => [
      Math.max(+rangeStart, +new Date(event.startsAt)),
      Math.min(+rangeEnd, +new Date(event.endsAt)),
    ])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  const windows = [];
  let edge = +rangeStart;
  for (const [start, end] of limits) {
    if (start - edge >= min) windows.push({ startsAt: new Date(edge), endsAt: new Date(start) });
    edge = Math.max(edge, end);
  }
  if (+rangeEnd - edge >= min) windows.push({ startsAt: new Date(edge), endsAt: new Date(rangeEnd) });
  return windows;
}

export async function calendarView(user, query) {
  const [start, end] = interval(query.get('from'), query.get('until'));
  const all = await pool.query(
    `SELECT u.id,u.name, CASE WHEN u.id=$1 THEN 'detail' ELSE grant_row.access END AS access
    FROM users u LEFT JOIN p2_calendar_shares grant_row ON grant_row.owner_id=u.id AND grant_row.viewer_id=$1
    WHERE u.id=$1 OR grant_row.accepted AND ${known('u.id', '$1::uuid')} ORDER BY (u.id=$1) DESC,u.name,u.id LIMIT 30`,
    [user],
  );
  const { rows: own } = await pool.query(
    `SELECT ${fields},owner_id AS "ownerId" FROM p2_calendar_events e
    WHERE owner_id=$1 AND ${activeLink} AND starts_at<$3 AND ends_at>$2 ORDER BY starts_at,id LIMIT 501`,
    [user, start, end],
  );
  const { rows: shared } = await pool.query(
    `SELECT e.id,e.owner_id AS "ownerId",
    CASE WHEN g.access='detail' AND e.visibility='detail' THEN e.title ELSE '忙碌' END AS title,
    CASE WHEN g.access='detail' AND e.visibility='detail' THEN e.details END AS details,
    e.starts_at AS "startsAt",e.ends_at AS "endsAt"
    FROM p2_calendar_events e JOIN p2_calendar_shares g ON g.owner_id=e.owner_id AND g.viewer_id=$1
    WHERE g.accepted AND ${known('e.owner_id', '$1::uuid')} AND e.owner_id=ANY($4::uuid[])
    AND ${activeLink} AND e.visibility<>'private' AND e.starts_at<$3 AND e.ends_at>$2 ORDER BY e.starts_at,e.id LIMIT 501`,
    [user, start, end, all.rows.map((p) => p.id)],
  );
  const events = [...own.slice(0, 500), ...shared.slice(0, 500)];
  const truncated = own.length > 500 || shared.length > 500;
  const windows = all.rows.length > 1 && !truncated ? sharedFreeWindows(start, end, events).slice(0, 16) : [];
  return { calendars: all.rows, events, truncated, windows, basis: estimateBasis };
}

export async function saveCalendarEvent(user, body, id) {
  const [start, end] = interval(body.startsAt, body.endsAt, 31);
  const visibility = choose(body.visibility ?? 'private', ['private', 'busy', 'detail']);
  const values = [
    visibility === 'busy' ? textOf(body.title, 80) || '忙碌' : cleanText(body.title, 80, true),
    textOf(body.details, 400),
    start,
    end,
    visibility,
  ];
  if (id) {
    const {
      rows: [entry],
    } = await pool.query(
      `UPDATE p2_calendar_events SET title=$3,details=$4,starts_at=$5,ends_at=$6,
      visibility=$7,revision=revision+1 WHERE id=$1 AND owner_id=$2 AND revision=$8 RETURNING ${fields}`,
      [id, user, ...values, revisionOf(body.revision)],
    );
    if (!entry) throw conflict();
    return entry;
  }
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const client = readId(body.clientId);
    const {
      rows: [saved],
    } = await db.query('SELECT id FROM p2_calendar_events WHERE owner_id=$1 AND client_id=$2', [
      user,
      client,
    ]);
    if (saved) return saved;
    const {
      rows: [entry],
    } = await db.query(
      `INSERT INTO p2_calendar_events(owner_id,client_id,title,details,starts_at,ends_at,visibility)
      VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [user, client, ...values],
    );
    return entry;
  });
}
export async function removeCalendarEvent(user, id) {
  if (!(await pool.query('DELETE FROM p2_calendar_events WHERE id=$1 AND owner_id=$2', [id, user])).rowCount)
    throw missing();
  return {};
}

export async function calendarShares(user) {
  const { rows } = await pool.query(
    `SELECT owner_id AS "ownerId",viewer_id AS "viewerId",u.name,access,accepted
    FROM p2_calendar_shares g JOIN users u ON u.id=CASE WHEN g.owner_id=$1 THEN g.viewer_id ELSE g.owner_id END
    WHERE (g.owner_id=$1 OR g.viewer_id=$1) AND ${known('g.owner_id', 'g.viewer_id')} ORDER BY u.name,u.id LIMIT 120`,
    [user],
  );
  return { shares: rows };
}
export async function manageCalendarShare(user, body) {
  const target = readId(body.userId);
  const action = choose(body.action, ['share', 'accept', 'revoke', 'decline']);
  if (target === user) throw invalid();
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user, target);
    if (action === 'share') {
      const {
        rows: [can],
      } = await db.query(`SELECT ${known('$1::uuid', '$2::uuid')} AS allowed`, [user, target]);
      if (!can.allowed) throw missing();
      await assertAllowed(db, user, ['limit_contact', 'limit_account']);
      const access = choose(body.access, ['busy', 'detail']);
      const result = await db.query(
        `INSERT INTO p2_calendar_shares AS g(owner_id,viewer_id,access) VALUES($1,$2,$3)
        ON CONFLICT(owner_id,viewer_id) DO UPDATE SET access=excluded.access,accepted=false WHERE g.access<>excluded.access`,
        [user, target, access],
      );
      if (result.rowCount) await notify(db, [target], 'p2_calendar_invited', user);
    }
    if (action === 'accept') {
      const result = await db.query(
        `UPDATE p2_calendar_shares g SET accepted=true WHERE g.owner_id=$2 AND g.viewer_id=$1
        AND ${known('g.owner_id', 'g.viewer_id')}`,
        [user, target],
      );
      if (!result.rowCount) throw missing();
    }
    if (action === 'revoke')
      await db.query('DELETE FROM p2_calendar_shares WHERE owner_id=$1 AND viewer_id=$2', [user, target]);
    if (action === 'decline')
      await db.query('DELETE FROM p2_calendar_shares WHERE owner_id=$2 AND viewer_id=$1', [user, target]);
    return {};
  });
}

export async function gatheringAvailability(user, id) {
  const {
    rows: [allowed],
  } = await pool.query(
    `SELECT g.id FROM p1_gatherings g JOIN p1_gathering_members m ON m.gathering_id=g.id
    WHERE g.id=$1 AND m.user_id=$2 AND NOT ${blocked('g.owner_id', '$2::uuid')}`,
    [id, user],
  );
  if (!allowed) throw missing();
  const { rows } = await pool.query(
    `WITH known_people AS (
    SELECT m.user_id FROM p1_gathering_members m JOIN p1_gatherings event ON event.id=m.gathering_id
    JOIN p2_calendar_shares g ON g.owner_id=m.user_id AND g.viewer_id=$2
    WHERE m.gathering_id=$1 AND g.accepted AND ${known('m.user_id', '$2::uuid')}
      AND NOT ${blocked('event.owner_id', 'm.user_id')}
    UNION ALL SELECT $2::uuid)
    SELECT o.id,o.ends_at IS NOT NULL AS "durationKnown",(SELECT count(*)::int FROM known_people) AS "includedCalendars",
      EXISTS(SELECT 1 FROM known_people k JOIN p2_calendar_events e ON e.owner_id=k.user_id
        WHERE ${activeLink} AND (k.user_id=$2 OR e.visibility<>'private')
          AND (e.starts_at<o.ends_at OR o.ends_at IS NULL AND e.starts_at<=o.starts_at) AND e.gathering_id IS DISTINCT FROM o.gathering_id AND e.ends_at>o.starts_at) AS "hasKnownConflict"
    FROM p1_gathering_options o JOIN p1_gatherings g ON g.id=o.gathering_id
    WHERE o.gathering_id=$1 AND NOT ${blocked('g.owner_id', '$2::uuid')}
      AND EXISTS(SELECT 1 FROM p1_gathering_members a WHERE a.gathering_id=g.id AND a.user_id=$2)
    ORDER BY o.starts_at,o.id`,
    [id, user],
  );
  return {
    basis: estimateBasis,
    // Keep allFree for older clients. It means no conflict in the available calendars.
    options: rows.map((row) => ({ ...row, allFree: row.durationKnown && !row.hasKnownConflict })),
  };
}
