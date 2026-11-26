import { cleanText, inTransaction, readId } from '../core.mjs';
import { itemVisible, member } from '../p2/access.mjs';
import { activeMember } from './collection-access.mjs';
import { isResting, preferences } from '../p0/access.mjs';
import { decodeJpeg } from '../p0/profile-cover.mjs';
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
  g.capacity,g.invitation,g.choice_id AS "choiceId",g.ballot_closed AS "ballotClosed",
  ((SELECT count(*) FROM p1_gathering_members roster WHERE roster.gathering_id=g.id AND roster.user_id<>g.owner_id)<3) AS "directProposal"`;

async function gathering(db, id, user, lock = false) {
  const {
    rows: [row],
  } = await db.query(
    `SELECT ${viewFields},g.suggestion_id AS suggestion,g.revision,g.description,g.agreed_choice AS "agreedChoice",g.allow_companion AS "allowCompanion",g.decision,g.choices,m.answer,m.private_note AS "privateNote",
    m.reminder_minutes AS "reminderMinutes",m.preparation,m.waiting_at AS "waitingAt",m.offered,m.companion,
    (SELECT c.id FROM p1_collections c WHERE c.gathering_id=g.id AND ${activeMember('c', 'm.user_id')} LIMIT 1) AS "journalId",
    (SELECT json_build_object('id',i.id,'title',i.title,'location',i.location,'latitude',i.latitude,'longitude',i.longitude) FROM p2_items i
     WHERE i.id=g.source_item_id AND ${itemVisible('i', 'm.user_id')}) AS source,
    (SELECT json_build_object('id',s.id,'title',s.title) FROM p2_spaces s WHERE s.id=g.checklist_id AND s.kind='list' AND ${member('s', 'm.user_id')}) AS checklist,
    g.meeting_note AS "meetingNote",
    CASE WHEN m.can_view_cover THEN replace(encode(g.cover,'base64'),chr(10),'') END AS cover,
    EXISTS(SELECT 1 FROM p2_calendar_events e WHERE e.owner_id=m.user_id AND e.gathering_id=g.id) AS "inCalendar",m.intention,m.votes,m.confirmed
    FROM p1_gatherings g JOIN p1_gathering_members m ON m.gathering_id=g.id
    WHERE g.id=$1 AND m.user_id=$2 AND ${visible} ${lock ? 'FOR UPDATE OF g' : ''}`,
    [id, user],
  );
  if (!row) throw missing();
  return row;
}

const optionList = (db, id) =>
  db.query(
    'SELECT id,starts_at AS "startsAt",ends_at AS "endsAt",place FROM p1_gathering_options WHERE gathering_id=$1 ORDER BY starts_at,id',
    [id],
  );

async function addOptions(db, id, input) {
  if (!Array.isArray(input) || input.length < 1 || input.length > 8)
    throw invalid('请选择 1 至 8 个候选时间与地点。');
  const times = [],
    places = [],
    ends = [];
  for (const item of input) {
    if (!item || typeof item !== 'object') throw invalid();
    const at = timeOf(item.startsAt);
    if (+at <= Date.now()) throw invalid('候选时间需在未来。');
    times.push(at);
    places.push(cleanText(item.place ?? '', 120));
    const end = item.endsAt == null ? null : timeOf(item.endsAt);
    if (end && end <= at) throw invalid('结束时间须晚于开始时间。');
    ends.push(end);
  }
  if (new Set(times.map((time, i) => time.toISOString() + '|' + places[i])).size !== times.length)
    throw invalid('候选项重复。');
  await db.query(
    `INSERT INTO p1_gathering_options(gathering_id,starts_at,place,ends_at)
    SELECT $1,at,place,ending FROM unnest($2::timestamptz[],$3::text[],$4::timestamptz[]) AS t(at,place,ending)`,
    [id, times, places, ends],
  );
}

export async function listGatherings(user) {
  const { rows } = await pool.query(
    `SELECT ${viewFields},g.created_at AS "createdAt",m.confirmed,(SELECT o.starts_at FROM p1_gathering_options o WHERE o.id=g.choice_id) AS "startsAt"
    FROM p1_gatherings g JOIN p1_gathering_members m ON m.gathering_id=g.id
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
  const roster =
    row.ownerId === user
      ? (
          await pool.query(
            `SELECT u.id,u.name,m.private_note AS note,m.preparation FROM p1_gathering_members m JOIN users u ON u.id=m.user_id
     WHERE m.gathering_id=$1 AND u.id<>$2 AND NOT ${blocked('u.id', '$2::uuid')} ORDER BY u.name,u.id`,
            [id, user],
          )
        ).rows
      : undefined;
  const { rows: updates } = await pool.query(
    `SELECT e.id,e.kind,e.created_at AS "createdAt" FROM p1_events e
     JOIN p1_gathering_members m ON m.user_id=e.user_id AND m.gathering_id=e.subject_id
     JOIN p1_gatherings g ON g.id=m.gathering_id
     WHERE e.user_id=$1 AND e.subject_id=$2 AND ${visible}
       AND e.kind IN ('gathering_invited','gathering_updated')
     ORDER BY e.created_at DESC,e.id DESC LIMIT 12`,
    [user, id],
  );
  return {
    updates,
    roster,
    gathering: row,
    options,
    attendees,
    ...(!row.directProposal && row.ownerId === user && suggestion ? { suggestion } : {}),
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
    const source = body.source ? readId(body.source) : null;
    if (
      source &&
      !(
        await db.query(
          `SELECT 1 FROM p2_items i WHERE i.id=$1 AND i.chat_record_id IS NULL AND ${itemVisible('i', '$2::uuid')}`,
          [source, user],
        )
      ).rowCount
    )
      throw missing();
    const checklist = body.checklistId ? readId(body.checklistId) : null;
    if (
      checklist &&
      !(
        await db.query(
          `SELECT 1 FROM p2_spaces s WHERE s.id=$1 AND s.kind='list' AND ${member('s', '$2::uuid')}`,
          [checklist, user],
        )
      ).rowCount
    )
      throw missing();
    const decision = cleanText(body.decision ?? '', 100);
    const choices = body.choices ?? [];
    if (!Array.isArray(choices) || choices.length > 5 || (decision ? choices.length < 2 : choices.length > 0))
      throw invalid('请填写问题和 2 至 5 个不同选项。');
    const labels = choices.map((option) => cleanText(option, 60, true));
    if (new Set(labels).size !== labels.length) throw invalid('选项重复。');
    const capacity = body.capacity ?? null;
    if (capacity != null && (!Number.isInteger(capacity) || capacity < minimum || capacity > 30))
      throw invalid('人数上限须在最低人数与 30 人之间。');
    const cover = body.cover ? decodeJpeg(body.cover, 98304) : null;
    const {
      rows: [row],
    } = await db.query(
      `INSERT INTO p1_gatherings(owner_id,client_id,category,title,mode,minimum,description,meeting_note,cover,capacity,source_item_id,decision,choices,allow_companion,invitation,checklist_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16) RETURNING id`,
      [
        user,
        clientId,
        categoryOf(body.category),
        cleanText(body.title, 80, true),
        mode,
        minimum,
        cleanText(body.description ?? '', 800),
        cleanText(body.meetingNote ?? '', 240),
        cover,
        capacity,
        source,
        decision,
        labels,
        body.allowCompanion === true,
        body.planning === true,
        checklist,
      ],
    );
    if (!(body.planning === true && Array.isArray(body.options) && body.options.length === 0))
      await addOptions(db, row.id, body.options);
    await db.query(
      'INSERT INTO p1_gathering_members(gathering_id,user_id,can_view_cover) SELECT $1,id,true FROM unnest($2::uuid[]) AS invited(id)',
      [row.id, [user, ...targets]],
    );
    await notify(db, targets, 'gathering_invited', row.id);
    return row;
  });
}

export async function updateIntention(user, id, body) {
  return inTransaction(pool, async (db) => {
    const value = await gathering(db, id, user, true);
    if (value.directProposal) throw conflict('这次约局采用直接提议时间。');
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

async function offerNext(db, id) {
  await db.query(
    `UPDATE p1_gathering_members m SET offered=true WHERE (m.gathering_id,m.user_id)=(
    SELECT w.gathering_id,w.user_id FROM p1_gathering_members w JOIN p1_gatherings g ON g.id=w.gathering_id
    WHERE g.id=$1 AND w.waiting_at IS NOT NULL AND NOT w.offered AND NOT w.confirmed AND ${canParticipate('g.owner_id', 'w.user_id')}
      AND g.capacity>(SELECT count(*) FILTER (WHERE confirmed OR offered)+count(*) FILTER (WHERE confirmed AND companion)
        FROM p1_gathering_members WHERE gathering_id=g.id)
    ORDER BY w.waiting_at,w.user_id LIMIT 1)`,
    [id],
  );
}

export async function confirmAttendance(user, id, wantsToJoin, companion = false, choiceId) {
  if (typeof wantsToJoin !== 'boolean') throw invalid();
  return inTransaction(pool, async (db) => {
    const row = await gathering(db, id, user, true);
    if (!['confirming', 'formed'].includes(row.state) || row.ownerId === user || !row.choiceId)
      throw conflict();
    if ((row.invitation || choiceId != null) && choiceId !== row.choiceId)
      throw conflict('活动时间已更改，请重新核对后确认。');
    if (row.confirmed === wantsToJoin) return {};
    if (companion && !row.allowCompanion) throw invalid('本次约局未开放携伴。');
    if (wantsToJoin && row.capacity) {
      const used = await db.query(
        'SELECT (count(*) FILTER (WHERE confirmed OR offered AND user_id<>$2)+count(*) FILTER (WHERE confirmed AND companion))::int AS count FROM p1_gathering_members WHERE gathering_id=$1',
        [id, user],
      );
      if (used.rows[0].count + (companion ? 2 : 1) > row.capacity) throw conflict('本次名额已满。');
    }
    if (!wantsToJoin)
      await db.query('DELETE FROM p2_calendar_events WHERE owner_id=$1 AND gathering_id=$2', [user, id]);
    const candidate = await db.query(
      'SELECT 1 FROM p1_gathering_options WHERE id=$1 AND gathering_id=$2 AND starts_at>now()',
      [row.choiceId, id],
    );
    if (!candidate.rowCount && wantsToJoin) throw conflict('活动时间已开始。');
    await db.query(
      'UPDATE p1_gathering_members SET confirmed=$3,waiting_at=NULL,offered=false,companion=$4,reminder_minutes=NULL WHERE gathering_id=$1 AND user_id=$2',
      [id, user, wantsToJoin, wantsToJoin && companion],
    );
    if (!wantsToJoin) {
      await leaveEventJournals(db, id, user);
      await offerNext(db, id);
    }
    await refreshFormation(db, id, row);
    return {};
  });
}

export async function editInvitation(user, id, body) {
  return inTransaction(pool, async (db) => {
    const row = await gathering(db, id, user, true);
    if (row.ownerId !== user) throw missing();
    if (row.state !== 'interest' || row.ballotClosed || row.revision !== body.revision)
      throw conflict('活动已变化，请重新打开编辑。');
    const voted = await db.query(
      'SELECT 1 FROM p1_gathering_members WHERE gathering_id=$1 AND (intention IS NOT NULL OR answer IS NOT NULL) LIMIT 1',
      [id],
    );
    if (voted.rowCount) throw conflict('已有人填写私密选择，当前邀请内容已锁定。');
    await db.query(
      `UPDATE p1_gatherings SET title=$2,description=$3,meeting_note=$4,cover=$5,revision=revision+1 WHERE id=$1`,
      [
        id,
        cleanText(body.title, 80, true),
        cleanText(body.description ?? '', 800),
        cleanText(body.meetingNote ?? '', 240),
        body.cover ? decodeJpeg(body.cover, 98304) : null,
      ],
    );
    const { rows } = await db.query(
      `SELECT m.user_id FROM p1_gathering_members m JOIN p1_gatherings g ON g.id=m.gathering_id
      WHERE g.id=$1 AND m.user_id<>$2 AND ${visible}`,
      [id, user],
    );
    await notify(
      db,
      rows.map((m) => m.user_id),
      'gathering_updated',
      id,
    );
    return {};
  });
}

export async function organizeGathering(user, id, body) {
  const action = choose(body.action, ['propose', 'seal', 'choose', 'reschedule', 'cancel', 'complete']);
  return inTransaction(pool, async (db) => {
    const row = await gathering(db, id, user, true);
    if (row.ownerId !== user && !(row.preparation === 'accepted' && action === 'propose')) throw missing();
    if (['cancelled', 'completed'].includes(row.state)) throw conflict();
    if (action === 'propose') {
      if (row.state !== 'interest' || (await optionList(db, id)).rowCount) throw conflict();
      await addOptions(db, id, body.options);
      await db.query('UPDATE p1_gatherings SET ballot_closed=false,suggestion_id=NULL WHERE id=$1', [id]);
    }
    if (action === 'seal') {
      if (row.directProposal) throw conflict('这次约局采用直接提议时间。');
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
      if (!row.directProposal && !row.ballotClosed) await lockBallot(db, id, user, row.mode);
      if (row.decision && !row.directProposal) {
        await db.query(
          `UPDATE p1_gatherings SET agreed_choice=(SELECT m.answer FROM p1_gathering_members m
          WHERE m.gathering_id=$1 AND m.answer IS NOT NULL AND m.user_id<>$2 AND NOT ${blocked('m.user_id', '$2::uuid')}
          GROUP BY m.answer HAVING count(*)>=3 ORDER BY count(*) DESC,m.answer LIMIT 1) WHERE id=$1`,
          [id, user],
        );
      }
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
        "UPDATE p1_gatherings SET choice_id=NULL,suggestion_id=NULL,agreed_choice=NULL,ballot_closed=false,state='interest' WHERE id=$1",
        [id],
      );
      await db.query(
        "UPDATE p1_gathering_members SET confirmed=false,intention=NULL,answer=NULL,reminder_minutes=NULL,offered=false,waiting_at=NULL,companion=false,votes='{}' WHERE gathering_id=$1",
        [id],
      );
    }
    if (['cancel', 'reschedule'].includes(action))
      await db.query('DELETE FROM p2_calendar_events WHERE gathering_id=$1', [id]);
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

export async function linkCalendar(user, id, enabled) {
  return inTransaction(pool, async (db) => {
    const row = await gathering(db, id, user, true);
    if (!enabled) {
      await db.query('DELETE FROM p2_calendar_events WHERE gathering_id=$1 AND owner_id=$2', [id, user]);
      return {};
    }
    if (!row.confirmed || !['confirming', 'formed'].includes(row.state)) throw conflict('请先确认参加。');
    const result = await db.query(
      `INSERT INTO p2_calendar_events(owner_id,client_id,title,starts_at,ends_at,visibility,gathering_id)
      SELECT $1,gen_random_uuid(),'约局',starts_at,ends_at,'private',$2 FROM p1_gathering_options
      WHERE id=$3 AND gathering_id=$2 AND ends_at IS NOT NULL
      ON CONFLICT (owner_id,gathering_id) DO UPDATE SET starts_at=excluded.starts_at,ends_at=excluded.ends_at`,
      [user, id, row.choiceId],
    );
    if (!result.rowCount) throw conflict('结束时间尚未确定。');
    return {};
  });
}

async function leaveEventJournals(db, event, user) {
  const { rows } = await db.query(
    'SELECT id FROM p1_collections WHERE gathering_id=$1 AND activity_journal ORDER BY id FOR UPDATE',
    [event],
  );
  for (const journal of rows) {
    await db.query(
      "UPDATE p1_collection_members SET state='left' WHERE collection_id=$1 AND user_id=$2 AND state IN ('active','invited')",
      [journal.id, user],
    );
    await db.query(
      `DELETE FROM p1_contribution_workspace_readers grant_row USING p1_contributions k,p1_entries e
      WHERE grant_row.contribution_id=k.id AND k.entry_id=e.id AND e.collection_id=$1 AND grant_row.viewer_id=$2`,
      [journal.id, user],
    );
  }
}

export async function manageRoster(user, id, body) {
  return inTransaction(pool, async (db) => {
    const row = await gathering(db, id, user, true);
    if (row.ownerId !== user) throw missing();
    // Freeze membership once the ballot has input. Reopening a small ballot could reveal someone's vote.
    if (['completed', 'cancelled'].includes(row.state)) throw conflict();
    if (
      row.state === 'interest' &&
      (row.ballotClosed ||
        (
          await db.query(
            'SELECT 1 FROM p1_gathering_members WHERE gathering_id=$1 AND intention IS NOT NULL LIMIT 1',
            [id],
          )
        ).rowCount)
    )
      throw conflict('本轮已开始收集意向，邀请范围已锁定。');
    if (body.action === 'invite') {
      await assertAllowed(db, user, ['limit_contact', 'limit_account']);
      const ids = await inviteesOf(db, user, body);
      const additions = await db.query(
        `INSERT INTO p1_gathering_members(gathering_id,user_id)
        SELECT $1,member FROM unnest($2::uuid[]) AS u(member) ON CONFLICT DO NOTHING RETURNING user_id`,
        [id, ids],
      );
      await notify(
        db,
        additions.rows.map((r) => r.user_id),
        'gathering_invited',
        id,
      );
    } else if (body.action === 'remove') {
      const member = readId(body.userId);
      if (member === user) throw invalid();
      await leaveEventJournals(db, id, member);
      await db.query('DELETE FROM p1_gathering_members WHERE gathering_id=$1 AND user_id=$2', [id, member]);
    } else throw invalid();
    const count = (
      await db.query('SELECT count(*)::int AS n FROM p1_gathering_members WHERE gathering_id=$1', [id])
    ).rows[0].n;
    if (
      count > 30 ||
      count < 2 ||
      (row.mode === 'open' && count < row.minimum) ||
      (row.mode === 'all' && row.capacity && count > row.capacity)
    )
      throw invalid('请核对受邀人数和成局条件。');
    if (row.mode === 'all') await db.query('UPDATE p1_gatherings SET minimum=$2 WHERE id=$1', [id, count]);
    if (['confirming', 'formed'].includes(row.state)) {
      await refreshFormation(db, id, { ...row, minimum: row.mode === 'all' ? count : row.minimum });
      await offerNext(db, id);
    }
    return {};
  });
}

export async function personalChoice(user, id, body) {
  return inTransaction(pool, async (db) => {
    const row = await gathering(db, id, user, true);
    if (['completed', 'cancelled'].includes(row.state)) throw conflict();
    const update = (field, value) =>
      db.query('UPDATE p1_gathering_members SET ' + field + '=$3 WHERE user_id=$1 AND gathering_id=$2', [
        user,
        id,
        value,
      ]);
    switch (body.action) {
      case 'reminder':
        if (!row.confirmed || !row.choiceId) throw conflict();
        await update('reminder_minutes', choose(body.minutes, [null, 15, 60, 1440]));
        break;
      case 'note':
        await update('private_note', cleanText(body.note ?? '', 240));
        break;
      case 'answer':
        if (!row.decision || row.state !== 'interest' || row.ballotClosed) throw conflict('本轮选择已结束。');
        await update('answer', choose(body.answer, [null, ...row.choices]));
        break;
      case 'offer-role':
        if (row.ownerId !== user) throw missing();
        if (
          !(
            await db.query(
              `UPDATE p1_gathering_members SET preparation='invited' WHERE gathering_id=$1 AND user_id=$2 AND user_id<>$3
          AND preparation IS NULL AND NOT ${blocked('user_id', '$3::uuid')} RETURNING user_id`,
              [id, readId(body.userId), user],
            )
          ).rowCount
        )
          throw conflict();
        break;
      case 'remove-role':
        if (row.ownerId !== user) throw missing();
        await db.query(
          'UPDATE p1_gathering_members SET preparation=NULL WHERE gathering_id=$1 AND user_id=$2',
          [id, readId(body.userId)],
        );
        break;
      case 'role':
        if (body.accept === true && row.preparation !== 'invited') throw conflict();
        await update('preparation', body.accept === true ? 'accepted' : null);
        break;
      case 'wait':
        if (!row.capacity || row.confirmed || !['confirming', 'formed'].includes(row.state)) throw conflict();
        if (body.join === true) {
          await db.query(
            'UPDATE p1_gathering_members SET waiting_at=coalesce(waiting_at,now()) WHERE gathering_id=$1 AND user_id=$2',
            [id, user],
          );
        } else {
          await db.query(
            'UPDATE p1_gathering_members SET waiting_at=NULL,offered=false WHERE gathering_id=$1 AND user_id=$2',
            [id, user],
          );
        }
        await offerNext(db, id);
        break;
      default:
        throw invalid();
    }
    return {};
  });
}

export async function activityReminders(user) {
  if (isResting(await preferences(pool, user))) return { reminders: [] };
  const { rows } = await pool.query(
    `SELECT g.id,g.title,o.starts_at AS "startsAt" FROM p1_gathering_members m
    JOIN p1_gatherings g ON g.id=m.gathering_id JOIN p1_gathering_options o ON o.id=g.choice_id
    WHERE m.user_id=$1 AND m.confirmed AND m.reminder_minutes IS NOT NULL AND g.state IN ('formed','confirming')
    AND o.starts_at>=now() AND o.starts_at<=now()+m.reminder_minutes*interval '1 minute' AND ${visible} ORDER BY o.starts_at`,
    [user],
  );
  return { reminders: rows };
}
