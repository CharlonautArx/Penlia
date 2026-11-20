import { cleanText, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { blocked, idsOf, lockUsers } from '../p0/access.mjs';
import {
  assertAllowed,
  canParticipate,
  categoryOf,
  choose,
  conflict,
  invalid,
  inviteesOf,
  missing,
  notify,
  timeOf,
} from './common.mjs';

const visible = `(${canParticipate('g.owner_id', 'm.user_id')})`;
const currentState = `CASE WHEN g.state IN ('confirming','formed') THEN
  CASE WHEN coalesce((SELECT count(*) FROM p1_gathering_members c WHERE c.gathering_id=g.id AND c.confirmed
    AND ${canParticipate('g.owner_id', 'c.user_id')}),0)>=g.minimum THEN 'formed' ELSE 'confirming' END
  ELSE g.state END`;
const viewFields = `g.id,g.owner_id AS "ownerId",g.category,g.title,g.mode,g.minimum,${currentState} AS state,
  g.choice_id AS "choiceId",g.ballot_closed AS "ballotClosed"`;

async function gathering(db, id, user, lock = false) {
  const {
    rows: [row],
  } = await db.query(
    `SELECT ${viewFields},g.suggestion_id AS suggestion,m.intention,m.votes,m.confirmed
    FROM p1_gatherings g JOIN p1_gathering_members m ON m.gathering_id=g.id
    WHERE g.id=$1 AND m.user_id=$2 AND ${visible} ${lock ? 'FOR UPDATE OF g' : ''}`,
    [id, user],
  );
  if (!row) throw missing();
  return row;
}

const optionList = (db, id) =>
  db.query(
    'SELECT id,starts_at AS "startsAt",place FROM p1_gathering_options WHERE gathering_id=$1 ORDER BY starts_at,id',
    [id],
  );

async function addOptions(db, id, input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 8)
    throw invalid('请选择 1 至 8 个候选时间与地点。');
  const times = [],
    places = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') throw invalid();
    const at = timeOf(item.startsAt);
    if (+at <= Date.now()) throw invalid('候选时间需在未来。');
    times.push(at);
    places.push(cleanText(item.place, 120, true));
  }
  if (new Set(times.map((time, i) => time.toISOString() + '|' + places[i])).size !== times.length)
    throw invalid('候选项重复。');
  await db.query(
    `INSERT INTO p1_gathering_options(gathering_id,starts_at,place)
    SELECT $1,at,place FROM unnest($2::timestamptz[],$3::text[]) AS t(at,place)`,
    [id, times, places],
  );
}

export async function listGatherings(user) {
  const { rows } = await pool.query(
    `SELECT ${viewFields} FROM p1_gatherings g JOIN p1_gathering_members m ON m.gathering_id=g.id
    WHERE m.user_id=$1 AND ${visible} ORDER BY g.created_at DESC,g.id LIMIT 60`,
    [user],
  );
  return { gatherings: rows };
}

export async function getGathering(user, id) {
  const { suggestion, ...row } = await gathering(pool, id, user);
  const { rows: options } = await optionList(pool, id);
  const attendees = ['formed', 'completed'].includes(row.state)
    ? (
        await pool.query(
          `SELECT u.id,u.name FROM p1_gathering_members m JOIN users u ON u.id=m.user_id
      WHERE m.gathering_id=$1 AND m.confirmed AND NOT ${blocked('$2::uuid', 'u.id')} ORDER BY u.name,u.id`,
          [id, user],
        )
      ).rows
    : [];
  return {
    gathering: row,
    options,
    attendees,
    ...(row.ownerId === user && suggestion ? { suggestion } : {}),
  };
}

export async function createGathering(user, body) {
  const clientId = readId(body.clientId);
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    await assertAllowed(db, user, ['limit_contact', 'limit_account']);
    const {
      rows: [existing],
    } = await db.query('SELECT id FROM p1_gatherings WHERE owner_id=$1 AND client_id=$2', [user, clientId]);
    if (existing) return existing;
    const {
      rows: [count],
    } = await db.query(
      "SELECT count(*)::int n FROM p1_gatherings WHERE owner_id=$1 AND state IN ('interest','confirming','formed')",
      [user],
    );
    if (count.n >= 20) throw invalid('进行中的约局已达上限。');
    const targets = await inviteesOf(db, user, body);
    if (!targets.length) throw invalid('请邀请至少一位好友。');
    const mode = choose(body.mode, ['all', 'open']);
    const minimum = mode === 'all' ? targets.length + 1 : body.minimum;
    if (!Number.isInteger(minimum) || minimum < 2 || minimum > targets.length + 1)
      throw invalid('成局人数须在受邀人数范围内，含发起者。');
    const {
      rows: [row],
    } = await db.query(
      `INSERT INTO p1_gatherings(owner_id,client_id,category,title,mode,minimum)
      VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
      [user, clientId, categoryOf(body.category), cleanText(body.title, 80, true), mode, minimum],
    );
    await addOptions(db, row.id, body.options);
    await db.query(
      'INSERT INTO p1_gathering_members(gathering_id,user_id) SELECT $1,id FROM unnest($2::uuid[]) AS invited(id)',
      [row.id, [user, ...targets]],
    );
    await notify(db, targets, 'gathering_invited', row.id);
    return row;
  });
}

export async function updateIntention(user, id, body) {
  return inTransaction(pool, async (db) => {
    const value = await gathering(db, id, user, true);
    if (value.state !== 'interest' || value.ballotClosed) throw conflict('本轮匿名意向已结束。');
    const intention = choose(body.intention, ['interested', 'undecided', 'unavailable']);
    const votes = intention === 'unavailable' ? [] : idsOf(body.optionIds ?? [], 8);
    const { rows: options } = await optionList(db, id);
    if (votes.some((vote) => !options.some((option) => option.id === vote))) throw invalid('候选时间无效。');
    await db.query(
      'UPDATE p1_gathering_members SET intention=$3,votes=$4 WHERE gathering_id=$1 AND user_id=$2',
      [id, user, intention, votes],
    );
    return {};
  });
}

async function lockBallot(db, id, owner, mode) {
  // Compute the only releasable result after votes have been sealed. The owner is deliberately excluded.
  const {
    rows: [winner],
  } = await db.query(
    `WITH invited AS (
    SELECT m.user_id,m.votes FROM p1_gathering_members m WHERE gathering_id=$1 AND user_id<>$2
      AND NOT ${blocked('$2::uuid', 'm.user_id')}
  ) SELECT o.id FROM p1_gathering_options o LEFT JOIN invited m ON o.id=ANY(m.votes)
    WHERE o.gathering_id=$1 AND o.starts_at>now() GROUP BY o.id,o.starts_at
    HAVING count(m.user_id)>=3 AND ($3<>'all' OR count(m.user_id)=(SELECT count(*) FROM invited))
    ORDER BY count(m.user_id) DESC,o.starts_at,o.id LIMIT 1`,
    [id, owner, mode],
  );
  await db.query('UPDATE p1_gatherings SET ballot_closed=true,suggestion_id=$2 WHERE id=$1', [
    id,
    winner?.id ?? null,
  ]);
  return winner?.id;
}

async function refreshFormation(db, id, value) {
  const {
    rows: [row],
  } = await db.query(
    `SELECT count(*)::int n,count(*) FILTER (WHERE m.confirmed AND ${visible})::int c
    FROM p1_gathering_members m JOIN p1_gatherings g ON g.id=m.gathering_id WHERE g.id=$1`,
    [id],
  );
  const formed = value.mode === 'all' ? row.c === row.n : row.c >= value.minimum;
  await db.query('UPDATE p1_gatherings SET state=$2 WHERE id=$1', [id, formed ? 'formed' : 'confirming']);
  // Invitations are announced when the choice changes. Formation is checked on read to avoid leaking intermediate confirmations.
  return { state: formed ? 'formed' : 'confirming' };
}

export async function confirmAttendance(user, id, wantsToJoin) {
  if (typeof wantsToJoin !== 'boolean') throw invalid();
  return inTransaction(pool, async (db) => {
    const row = await gathering(db, id, user, true);
    if (!['confirming', 'formed'].includes(row.state) || row.ownerId === user || !row.choiceId)
      throw conflict();
    const candidate = await db.query(
      'SELECT 1 FROM p1_gathering_options WHERE id=$1 AND gathering_id=$2 AND starts_at>now()',
      [row.choiceId, id],
    );
    if (!candidate.rowCount && wantsToJoin) throw conflict('活动时间已开始。');
    await db.query('UPDATE p1_gathering_members SET confirmed=$3 WHERE gathering_id=$1 AND user_id=$2', [
      id,
      user,
      wantsToJoin,
    ]);
    await refreshFormation(db, id, row);
    return {};
  });
}

export async function organizeGathering(user, id, body) {
  const action = choose(body.action, ['seal', 'choose', 'reschedule', 'cancel', 'complete']);
  return inTransaction(pool, async (db) => {
    const row = await gathering(db, id, user, true);
    if (row.ownerId !== user) throw missing();
    if (['cancelled', 'completed'].includes(row.state)) throw conflict();
    if (action === 'seal') {
      if (row.state !== 'interest') throw conflict();
      if (!row.ballotClosed) await lockBallot(db, id, user, row.mode);
      return {};
    }
    if (action === 'choose') {
      if (row.state !== 'interest') throw conflict();
      const option = readId(body.optionId);
      if (
        !(
          await db.query(
            'SELECT 1 FROM p1_gathering_options WHERE id=$1 AND gathering_id=$2 AND starts_at>now()',
            [option, id],
          )
        ).rowCount
      )
        throw missing();
      if (!row.ballotClosed) await lockBallot(db, id, user, row.mode);
      await db.query("UPDATE p1_gatherings SET choice_id=$2,state='confirming' WHERE id=$1", [id, option]);
      await db.query('UPDATE p1_gathering_members SET confirmed=(user_id=$2) WHERE gathering_id=$1', [
        id,
        user,
      ]);
    }
    if (action === 'reschedule') {
      // A sealed anonymous ballot may be repeated only after a choice was presented. This avoids iterative probing.
      if (!['confirming', 'formed'].includes(row.state)) throw conflict('请先选择并公布本轮候选时间。');
      await db.query('DELETE FROM p1_gathering_options WHERE gathering_id=$1', [id]);
      await addOptions(db, id, body.options);
      await db.query(
        "UPDATE p1_gatherings SET choice_id=NULL,suggestion_id=NULL,ballot_closed=false,state='interest' WHERE id=$1",
        [id],
      );
      await db.query(
        "UPDATE p1_gathering_members SET confirmed=false,intention=NULL,votes='{}' WHERE gathering_id=$1",
        [id],
      );
    }
    if (action === 'cancel') await db.query("UPDATE p1_gatherings SET state='cancelled' WHERE id=$1", [id]);
    if (action === 'complete') {
      if (row.state !== 'formed') throw conflict('只有已成局活动可以完成。');
      const chosen = await db.query(
        'SELECT 1 FROM p1_gathering_options WHERE gathering_id=$1 AND id=$2 AND starts_at<=now()',
        [id, row.choiceId],
      );
      if (!chosen.rowCount) throw conflict('活动尚未开始。');
      await db.query("UPDATE p1_gatherings SET state='completed' WHERE id=$1", [id]);
    }
    const { rows: members } = await db.query(
      `SELECT user_id FROM p1_gathering_members m JOIN p1_gatherings g ON g.id=m.gathering_id
      WHERE gathering_id=$1 AND m.user_id<>$2 AND ${visible} AND ($3<>'complete' OR m.confirmed)`,
      [id, user, action],
    );
    await notify(
      db,
      members.map((m) => m.user_id),
      'gathering_updated',
      id,
    );
    return {};
  });
}
