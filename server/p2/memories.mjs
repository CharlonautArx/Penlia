import { timingSafeEqual } from 'node:crypto';
import { cleanText, hash, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { blocked, idsOf, lockUsers, verifyFriends } from '../p0/access.mjs';
import { activeMember, momentVisible } from '../p1/collection-access.mjs';
import { assertAllowed, choose, dateOf, invalid, missing } from '../p1/common.mjs';
import { known, member, opened } from './access.mjs';
import { member as relayMember } from '../p3/access.mjs';

const gatheringView = (g, v) => `(${g}.state='completed' AND NOT ${blocked(g + '.owner_id', v)}
  AND EXISTS(SELECT 1 FROM p1_gathering_members gm WHERE gm.gathering_id=${g}.id AND gm.user_id=${v} AND gm.confirmed))`;
const kindNames = ['gathering', 'journal', 'moment', 'trip', 'capsule', 'relay', 'birthday'];
const sources = {
  gathering: (v) => `SELECT g.id,g.title,(o.starts_at AT TIME ZONE 'UTC')::date AS day FROM p1_gatherings g
      JOIN p1_gathering_options o ON o.id=g.choice_id WHERE ${gatheringView('g', v)}`,
  journal: (
    v,
  ) => `SELECT j.id,j.title,coalesce((SELECT max(e.event_date) FROM p1_entries e WHERE e.collection_id=j.id
      AND NOT ${blocked('e.author_id', v)}),(j.created_at AT TIME ZONE 'UTC')::date) AS day FROM p1_collections j
      WHERE j.kind='journal' AND ${activeMember('j', v)}`,
  moment: (
    v,
  ) => `SELECT p.id,coalesce(nullif(left(p.body,42),''),'图文动态') AS title,(p.created_at AT TIME ZONE 'UTC')::date AS day
      FROM private_moments p WHERE ${momentVisible('p', v)}`,
  trip: (v) => `SELECT s.id,s.title,t.end_day AS day FROM p2_trips t JOIN p2_spaces s ON s.id=t.space_id
      WHERE t.completed_at IS NOT NULL AND ${member('s', v)}`,
  capsule: (v) => `SELECT s.id,s.title,(c.opens_at AT TIME ZONE 'UTC')::date AS day FROM p2_capsules c
      JOIN p2_spaces s ON s.id=c.space_id WHERE ${opened('c')} AND ${member('s', v)}`,
  relay: (v) => `SELECT s.id,s.title,s.event_day AS day FROM p3_spaces s WHERE s.kind='relay' AND ${relayMember('s', v)}`,
};
const sourceVisible = (m, v) =>
  `(${m}.source_kind='birthday' OR ${Object.entries(sources)
    .map(
      ([key, sql]) =>
        `(${m}.source_kind='${key}' AND EXISTS(SELECT 1 FROM (${sql(v)}) authorized WHERE authorized.id=${m}.source_id))`,
    )
    .join(' OR ')})`;
export const memoryVisible = (m, v) => `(${sourceVisible(m, v)} AND (
  ${m}.owner_id=${v} OR (${known(m + '.owner_id', v)} AND ${sourceVisible(m, m + '.owner_id')} AND
    EXISTS(SELECT 1 FROM p2_memory_viewers mv WHERE mv.memory_id=${m}.id AND mv.viewer_id=${v}))))`;

export async function memorySources(user, query) {
  const kind = choose(query.get('kind'), Object.keys(sources));
  const { rows } = await pool.query(
    `SELECT id,title,day::text AS day FROM (${sources[kind]('$1::uuid')}) choices ORDER BY day DESC,id LIMIT 60`,
    [user],
  );
  return { sources: rows };
}

export async function memoryCandidates(user) {
  const authorized = Object.entries(sources)
    .map(([kind, sql]) => `SELECT '${kind}' AS kind,source.* FROM (${sql('$1::uuid')}) source`)
    .join(' UNION ALL ');
  const { rows } = await pool.query(
    `WITH local_day AS (
      SELECT (now() AT TIME ZONE coalesce((SELECT zone FROM privacy_preferences WHERE user_id=$1),'Asia/Shanghai'))::date AS today
    ), eligible AS (
      SELECT s.*,CASE
        WHEN s.day<date_trunc('year',d.today)::date AND to_char(s.day,'MM-DD')=to_char(d.today,'MM-DD')
          THEN 'anniversary'
        WHEN s.day BETWEEN d.today-30 AND d.today THEN 'recent'
      END AS reason
      FROM (${authorized}) s CROSS JOIN local_day d
      WHERE NOT EXISTS(SELECT 1 FROM p2_memories m WHERE m.owner_id=$1 AND m.source_kind=s.kind AND m.source_id=s.id)
    )
    SELECT kind AS "sourceKind",id,title,day::text AS day,reason FROM eligible
    WHERE reason IS NOT NULL ORDER BY reason,eligible.day DESC,kind,id LIMIT 8`,
    [user],
  );
  return { candidates: rows };
}

export async function memories(user) {
  const { rows } = await pool.query(
    `SELECT m.id,m.title,m.owner_id AS "ownerId",m.source_kind AS "sourceKind",
    m.source_id AS "sourceId",m.event_day::text AS "eventDay",u.name AS author,
    CASE WHEN m.owner_id=$1 THEN ARRAY(SELECT viewer_id FROM p2_memory_viewers WHERE memory_id=m.id ORDER BY viewer_id) END AS "memberIds"
    FROM p2_memories m JOIN users u ON u.id=m.owner_id WHERE ${memoryVisible('m', '$1::uuid')}
    ORDER BY m.event_day DESC,m.id LIMIT 100`,
    [user],
  );
  const {
    rows: [pref],
  } = await pool.query('SELECT frequency FROM p2_memory_settings WHERE user_id=$1', [user]);
  return { memories: rows, frequency: pref?.frequency ?? 'off' };
}

export async function saveMemory(user, body) {
  const kind = choose(body.sourceKind, kindNames),
    source = kind === 'birthday' ? null : readId(body.sourceId),
    client = readId(body.clientId);
  const title = cleanText(body.title, 120, true);
  if (body.confirmed !== true) throw invalid('请确认保存为共同回忆。');
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const {
      rows: [old],
    } = await db.query('SELECT id FROM p2_memories WHERE owner_id=$1 AND client_id=$2', [user, client]);
    if (old) return old;
    let day;
    if (source) {
      const {
        rows: [record],
      } = await db.query(`SELECT day::text AS day FROM (${sources[kind]('$1::uuid')}) eligible WHERE id=$2`, [
        user,
        source,
      ]);
      if (!record) throw missing();
      day = record.day;
    } else day = dateOf(body.eventDay);
    const {
      rows: [count],
    } = await db.query('SELECT count(*)::int AS n FROM p2_memories WHERE owner_id=$1', [user]);
    if (count.n >= 300) throw invalid('回忆数量已达上限。');
    const {
      rows: [saved],
    } = await db.query(
      `INSERT INTO p2_memories(owner_id,client_id,title,event_day,source_kind,source_id)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [user, client, title, day, kind, source],
    );
    return saved;
  });
}
export async function shareMemory(user, id, body) {
  if (body.confirmed !== true) throw invalid('请确认这次分享范围。');
  const ids = idsOf(body.memberIds ?? [], 29);
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const {
      rows: [m],
    } = await db.query(
      `SELECT m.id FROM p2_memories m WHERE m.id=$1 AND m.owner_id=$2
      AND ${sourceVisible('m', '$2::uuid')} FOR UPDATE`,
      [id, user],
    );
    if (!m) throw missing();
    await verifyFriends(db, user, ids);
    if (ids.length) await assertAllowed(db, user, ['limit_contact', 'limit_account']);
    const { rows } = await db.query(
      `SELECT target.id FROM unnest($2::uuid[]) target(id)
      JOIN p2_memories m ON m.id=$1 WHERE ${sourceVisible('m', 'target.id')}`,
      [id, ids],
    );
    if (rows.length !== ids.length) throw invalid('部分好友没有原始内容的访问授权。');
    await db.query('DELETE FROM p2_memory_viewers WHERE memory_id=$1', [id]);
    await db.query('INSERT INTO p2_memory_viewers SELECT $1,id FROM unnest($2::uuid[]) AS v(id)', [id, ids]);
    return {};
  });
}
export async function deleteMemory(user, id) {
  return inTransaction(pool, async (db) => {
    if (!(await db.query('DELETE FROM p2_memories WHERE id=$1 AND owner_id=$2', [id, user])).rowCount)
      throw missing();
    await db.query("DELETE FROM p2_reminders WHERE user_id=$1 AND kind='memory' AND subject_id=$2", [
      user,
      id,
    ]);
    return {};
  });
}
export async function memorySettings(user, body) {
  const frequency = choose(body.frequency, ['off', 'monthly', 'anniversary', 'standard']);
  await pool.query(
    `INSERT INTO p2_memory_settings VALUES($1,$2) ON CONFLICT(user_id) DO UPDATE SET frequency=excluded.frequency`,
    [user, frequency],
  );
  return {};
}

export function lifeWorkerAuthorized(header) {
  const secret = process.env.PENLIA_LIFE_JOB_TOKEN;
  return (
    !!secret &&
    secret.length >= 32 &&
    timingSafeEqual(Buffer.from(hash(header ?? '')), Buffer.from(hash('Bearer ' + secret)))
  );
}

export async function runLifeReminders(user = null, at = new Date()) {
  const daily = await pool.query(
    `WITH due AS (
    SELECT m.owner_id,m.id,ms.frequency,local.day,
      row_number() OVER(PARTITION BY m.owner_id ORDER BY m.event_day DESC,m.id) AS priority
    FROM p2_memories m JOIN p2_memory_settings ms ON ms.user_id=m.owner_id AND ms.frequency<>'off'
    LEFT JOIN privacy_preferences pr ON pr.user_id=m.owner_id
    CROSS JOIN LATERAL(SELECT ($2::timestamptz AT TIME ZONE coalesce(pr.zone,'Asia/Shanghai'))::date AS day) local
    WHERE ($1::uuid IS NULL OR m.owner_id=$1) AND m.event_day<local.day AND ${sourceVisible('m', 'm.owner_id')} AND (
      (ms.frequency IN ('anniversary','standard') AND to_char(m.event_day,'MM-DD')=to_char(local.day,'MM-DD')) OR
      (ms.frequency IN ('monthly','standard') AND extract(day FROM m.event_day)=extract(day FROM local.day))
    )
  ) INSERT INTO p2_reminders(user_id,kind,subject_id,due_day,month_bucket)
    SELECT d.owner_id,'memory',d.id,d.day,
      CASE WHEN d.frequency='monthly' THEN date_trunc('month',d.day)::date END FROM due d
    WHERE (d.frequency<>'monthly' OR (d.priority=1 AND NOT EXISTS(SELECT 1 FROM p2_reminders t
          WHERE t.kind='memory' AND t.user_id=d.owner_id AND t.due_day>=date_trunc('month',d.day)::date
            AND t.due_day<=d.day)))
      AND NOT EXISTS(SELECT 1 FROM p2_reminders t WHERE t.user_id=d.owner_id AND t.kind='memory'
        AND t.subject_id=d.id AND t.due_day=d.day)
    ORDER BY d.day,d.owner_id,d.id LIMIT 150 ON CONFLICT DO NOTHING`,
    [user, at],
  );
  const capsules = await pool.query(
    `WITH available AS (
    SELECT c.space_id,s.owner_id AS user_id,c.opens_at FROM p2_capsules c JOIN p2_spaces s ON s.id=c.space_id
    WHERE c.sealed_at IS NOT NULL AND c.opens_at<=$2 AND ($1::uuid IS NULL OR s.owner_id=$1)
    UNION ALL SELECT c.space_id,m.user_id,c.opens_at FROM p2_capsules c JOIN p2_spaces s ON s.id=c.space_id
    JOIN p2_members m ON m.space_id=c.space_id AND m.state='active' AND NOT ${blocked('s.owner_id', 'm.user_id')}
    WHERE c.sealed_at IS NOT NULL AND c.opens_at<=$2 AND ($1::uuid IS NULL OR m.user_id=$1)
  ) INSERT INTO p2_reminders(user_id,kind,subject_id,due_day)
    SELECT a.user_id,'capsule',a.space_id,(a.opens_at AT TIME ZONE 'UTC')::date FROM available a
    WHERE NOT EXISTS(SELECT 1 FROM p2_reminders x WHERE x.user_id=a.user_id AND x.kind='capsule' AND x.subject_id=a.space_id)
    ORDER BY a.opens_at,a.space_id,a.user_id LIMIT 150 ON CONFLICT DO NOTHING`,
    [user, at],
  );
  return { memories: daily.rowCount, capsules: capsules.rowCount };
}

export async function reminders(user) {
  await runLifeReminders(user);
  const { rows } = await pool.query(
    `SELECT r.kind,r.subject_id AS "subjectId",r.due_day::text AS "dueDay",r.read_at AS "readAt",
    coalesce(m.title,s.title) AS title
    FROM p2_reminders r LEFT JOIN p2_memories m ON r.kind='memory' AND m.id=r.subject_id
    LEFT JOIN p2_spaces s ON r.kind='capsule' AND s.id=r.subject_id
    WHERE r.user_id=$1 AND r.due_day<=(now() AT TIME ZONE CASE WHEN r.kind='capsule' THEN 'UTC' ELSE
      coalesce((SELECT zone FROM privacy_preferences WHERE user_id=$1),'Asia/Shanghai') END)::date AND (
      (m.id IS NOT NULL AND EXISTS(SELECT 1 FROM p2_memory_settings ms WHERE ms.user_id=$1 AND ms.frequency<>'off')
        AND ${memoryVisible('m', '$1::uuid')}) OR (s.id IS NOT NULL AND ${member('s', '$1::uuid')}
        AND EXISTS(SELECT 1 FROM p2_capsules cap WHERE cap.space_id=s.id AND ${opened('cap')}))
    ) ORDER BY r.due_day DESC,r.subject_id LIMIT 60`,
    [user],
  );
  return { reminders: rows };
}
export async function readReminder(user, id, body) {
  const kind = choose(body.kind, ['capsule', 'memory']),
    day = dateOf(body.dueDay);
  await pool.query(
    `UPDATE p2_reminders SET read_at=coalesce(read_at,now()) WHERE user_id=$1 AND kind=$2 AND subject_id=$3 AND due_day=$4`,
    [user, kind, id, day],
  );
  return {};
}
