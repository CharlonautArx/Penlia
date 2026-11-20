import { hash, inTransaction } from '../core.mjs';
import { pool } from '../db.mjs';
import { blocked, idsOf, lockUsers, related, restricted } from '../p0/access.mjs';
import { activeMember, momentReaders } from './collection-access.mjs';
import { choose, conflict, missing } from './common.mjs';

const channelOf = (channel) => choose(channel, ['workspace', 'publication']);
const tableFor = (channel) =>
  channel === 'workspace' ? 'p1_contribution_workspace_readers' : 'p1_contribution_public_readers';

async function original(db, user, id) {
  const {
    rows: [record],
  } = await db.query(
    `SELECT c.id AS collection,c.owner_id AS owner,c.moment_id AS moment,k.revision
    FROM p1_contributions k JOIN p1_entries e ON e.id=k.entry_id JOIN p1_collections c ON c.id=e.collection_id
    WHERE k.id=$1 AND k.author_id=$2 AND k.removed_at IS NULL AND c.kind='collaboration'`,
    [id, user],
  );
  if (!record) throw missing();
  return record;
}

async function plan(db, user, id, channel, record) {
  let people = [];
  if (channel === 'workspace') {
    ({ rows: people } = await db.query(
      `SELECT u.id,u.name FROM p1_collections c JOIN users u ON
      (u.id=c.owner_id OR EXISTS(SELECT 1 FROM p1_collection_members m WHERE m.collection_id=c.id
        AND m.user_id=u.id AND m.state='active'))
      WHERE c.id=$1 AND u.id<>$2 AND ${activeMember('c', '$2::uuid')} AND ${activeMember('c', 'u.id')}
        AND NOT ${blocked('$2::uuid', 'u.id')} AND NOT ${restricted('$2::uuid', 'u.id')} ORDER BY u.id`,
      [record.collection, user],
    ));
  } else if (record.moment) {
    ({ rows: people } = await db.query(
      `SELECT r.id,r.name FROM (${momentReaders('$1', '$2::uuid')}) r
      JOIN p1_collections c ON c.id=$4 WHERE r.id<>$3
        AND (${related('$3::uuid', 'r.id')} OR (${activeMember('c', '$3::uuid')} AND ${activeMember('c', 'r.id')}))
        AND NOT ${blocked('$3::uuid', 'r.id')} AND NOT ${restricted('$3::uuid', 'r.id')} ORDER BY r.id`,
      [record.moment, record.owner, user, record.collection],
    ));
  }
  const grants = await db.query(
    `SELECT viewer_id FROM ${tableFor(channel)} WHERE contribution_id=$1
    ${channel === 'publication' ? 'AND moment_id=$2' : ''} ORDER BY viewer_id`,
    channel === 'publication' ? [id, record.moment] : [id],
  );
  const granted = new Set(grants.rows.map((row) => row.viewer_id));
  const viewers = people.map(({ id, name }) => ({ id, name, allowed: granted.has(id) }));
  const version = hash(
    JSON.stringify([
      channel,
      channel === 'publication' ? record.moment : record.collection,
      record.revision,
      viewers.map((viewer) => [viewer.id, viewer.allowed]),
      [...granted],
    ]),
  );
  return {
    version,
    viewers,
    available: channel === 'workspace' || !!record.moment,
    hasConsent: granted.size > 0,
  };
}

export async function getContributionAudience(user, id, channel) {
  channel = channelOf(channel);
  return inTransaction(pool, async (db) => plan(db, user, id, channel, await original(db, user, id)));
}

export async function setContributionAudience(user, id, channel, body) {
  channel = channelOf(channel);
  return inTransaction(pool, async (db) => {
    const initial = await original(db, user, id);
    await lockUsers(db, initial.owner, user);
    if (channel === 'workspace') {
      await db.query('SELECT id FROM p1_collections WHERE id=$1 FOR UPDATE', [initial.collection]);
    } else if (initial.moment) {
      await db.query('SELECT id FROM private_moments WHERE id=$1 FOR UPDATE', [initial.moment]);
    }
    await db.query('SELECT id FROM p1_contributions WHERE id=$1 FOR UPDATE', [id]);
    const current = await original(db, user, id);
    if (channel === 'publication' && current.moment !== initial.moment)
      throw conflict('动态已变更，请重新确认。');
    if (body) {
      const target = await plan(db, user, id, channel, current);
      if (body.version !== target.version) throw conflict('可选读者已变化，请刷新后重新确认。');
      const ids = idsOf(body.viewerIds, target.viewers.length);
      if (ids.some((viewer) => !target.viewers.some((person) => person.id === viewer)))
        throw conflict('请重新选择可见读者。');
      await db.query(`DELETE FROM ${tableFor(channel)} WHERE contribution_id=$1`, [id]);
      if (channel === 'workspace') {
        await db.query(
          `INSERT INTO p1_contribution_workspace_readers(contribution_id,viewer_id)
          SELECT $1,viewer FROM unnest($2::uuid[]) AS v(viewer)`,
          [id, ids],
        );
      } else {
        await db.query(
          `INSERT INTO p1_contribution_public_readers(contribution_id,viewer_id,moment_id)
          SELECT $1,viewer,$3 FROM unnest($2::uuid[]) AS v(viewer)`,
          [id, ids, current.moment],
        );
      }
    } else {
      await db.query(`DELETE FROM ${tableFor(channel)} WHERE contribution_id=$1`, [id]);
    }
    return {};
  });
}
