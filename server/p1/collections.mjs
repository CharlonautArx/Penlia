import { randomUUID } from 'node:crypto';
import { cleanText, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { areFriends, blocked, idsOf, lockUsers, restricted } from '../p0/access.mjs';
import { publishMoment } from '../p0/moments.mjs';
import {
  activeMember,
  collectionReadable,
  contributionReadable,
  contributionScope,
  unusedMedia,
  workspaceGrant,
} from './collection-access.mjs';
import {
  assertAllowed,
  categoryOf,
  choose,
  conflict,
  dateOf,
  invalid,
  inviteesOf,
  missing,
  notify,
} from './common.mjs';

async function access(db, id, user, { lock = false, write = false } = {}) {
  const limit = write ? activeMember('c', '$2::uuid') : collectionReadable('c', '$2::uuid');
  const {
    rows: [row],
  } = await db.query(
    `SELECT c.id,c.owner_id AS "ownerId",c.kind,c.title,c.moment_id AS "momentId",
    c.gathering_id AS "gatheringId",${activeMember('c', '$2::uuid')} AS "canWrite" FROM p1_collections c
    WHERE c.id=$1 AND ${limit} ${lock ? 'FOR UPDATE' : ''}`,
    [id, user],
  );
  if (!row) throw missing();
  return row;
}

export async function listCollections(user) {
  const { rows } = await pool.query(
    `SELECT c.id,c.owner_id AS "ownerId",c.kind,c.title,c.moment_id AS "momentId",u.name owner,
    CASE WHEN c.owner_id=$1 THEN 'active' ELSE m.state END AS state
    FROM p1_collections c JOIN users u ON u.id=c.owner_id LEFT JOIN p1_collection_members m ON m.collection_id=c.id AND m.user_id=$1
    WHERE c.owner_id=$1 OR m.state IN ('active','invited') AND NOT ${blocked('c.owner_id', '$1::uuid')}
    ORDER BY c.created_at DESC,c.id LIMIT 60`,
    [user],
  );
  return { collections: rows };
}

export async function createCollection(user, body, transaction) {
  const clientId = transaction ? randomUUID() : readId(body.clientId);
  const kind = choose(body.kind, ['journal', 'collaboration']);
  const title = cleanText(body.title, 80, true);
  const gathering = body.gatheringId ? readId(body.gatheringId) : null;
  if (gathering && kind !== 'journal') throw invalid();
  const save = async (db) => {
    await lockUsers(db, user);
    const {
      rows: [existing],
    } = await db.query('SELECT id FROM p1_collections WHERE owner_id=$1 AND client_id=$2', [user, clientId]);
    if (existing) return existing;
    const {
      rows: [count],
    } = await db.query('SELECT count(*)::int AS n FROM p1_collections WHERE owner_id=$1', [user]);
    if (count.n >= 40) throw invalid('共同记录数量已达上限。');
    let members;
    if (gathering) {
      const {
        rows: [source],
      } = await db.query(
        "SELECT id,category FROM p1_gatherings WHERE id=$1 AND owner_id=$2 AND state='completed' FOR UPDATE",
        [gathering, user],
      );
      if (!source) throw missing();
      const {
        rows: [duplicate],
      } = await db.query('SELECT id FROM p1_collections WHERE gathering_id=$1', [gathering]);
      if (duplicate) return duplicate;
      const { rows } = await db.query(
        `SELECT m.user_id AS id FROM p1_gathering_members m
        WHERE m.gathering_id=$1 AND m.confirmed AND m.user_id<>$2 AND NOT ${blocked('$2::uuid', 'm.user_id')}`,
        [gathering, user],
      );
      members = rows.map((row) => row.id);
    } else members = await inviteesOf(db, user, body);
    if (members.length) await assertAllowed(db, user, ['limit_contact', 'limit_account']);
    const {
      rows: [record],
    } = await db.query(
      `INSERT INTO p1_collections(owner_id,client_id,kind,title,gathering_id)
      VALUES($1,$2,$3,$4,$5) RETURNING id`,
      [user, clientId, kind, title, gathering],
    );
    const eventTitle = kind === 'collaboration' ? title : undefined;
    if (eventTitle) {
      await db.query(
        `INSERT INTO p1_entries(collection_id,author_id,client_id,title,category,event_date)
        VALUES($1,$2,$3,$4,'other',CURRENT_DATE)`,
        [record.id, user, clientId, eventTitle],
      );
    }
    await addMembers(db, user, record.id, members);
    return record;
  };
  return transaction ? save(transaction) : inTransaction(pool, save);
}

async function addMembers(db, owner, id, members) {
  if (!members.length) return;
  const {
    rows: [count],
  } = await db.query(
    "SELECT count(*)::int n FROM p1_collection_members WHERE collection_id=$1 AND state IN ('invited','active') AND NOT(user_id=ANY($2::uuid[]))",
    [id, members],
  );
  if (count.n + members.length > 29) throw invalid('可邀请成员已达上限。');
  const { rows } = await db.query(
    `INSERT INTO p1_collection_members AS m(collection_id,user_id,state)
    SELECT $1,member,'invited' FROM unnest($2::uuid[]) AS ids(member) ON CONFLICT(collection_id,user_id)
    DO UPDATE SET state='invited' WHERE m.state IN ('left','removed') RETURNING user_id`,
    [id, members],
  );
  await notify(
    db,
    rows.map((row) => row.user_id).filter((user) => user !== owner),
    'collection_invited',
    id,
  );
}

export async function inviteCollection(user, id, body) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const row = await access(db, id, user, { lock: true, write: true });
    if (row.ownerId !== user) throw missing();
    await assertAllowed(db, user, ['limit_contact', 'limit_account']);
    await addMembers(db, user, id, await inviteesOf(db, user, body));
    return {};
  });
}

export async function changeMembership(user, id, body) {
  const action = choose(body.action, ['accept', 'decline', 'leave', 'remove']);
  return inTransaction(pool, async (db) => {
    const {
      rows: [collection],
    } = await db.query('SELECT owner_id FROM p1_collections WHERE id=$1 FOR UPDATE', [id]);
    if (!collection) throw missing();
    const owner = collection.owner_id;
    const target = action === 'remove' ? readId(body.userId) : user;
    if (target === owner || (action === 'remove' && owner !== user)) throw missing();
    const prior =
      action === 'remove'
        ? ['invited', 'active']
        : action === 'accept' || action === 'decline'
          ? ['invited']
          : ['active'];
    const next = { accept: 'active', decline: 'declined', leave: 'left', remove: 'removed' }[action];
    if (action === 'accept' && !(await areFriends(db, owner, user))) throw conflict('邀请已失效。');
    const result = await db.query(
      `UPDATE p1_collection_members SET state=$3 WHERE collection_id=$1 AND user_id=$2 AND state=ANY($4::text[])`,
      [id, target, next, prior],
    );
    if (!result.rowCount) throw missing();
    if (action === 'leave' || action === 'remove') {
      await db.query(
        `DELETE FROM p1_contribution_workspace_readers approved USING p1_contributions k,p1_entries e
        WHERE approved.contribution_id=k.id AND k.entry_id=e.id AND e.collection_id=$1 AND approved.viewer_id=$2`,
        [id, target],
      );
    }
    return {};
  });
}

export async function getCollection(user, id, query) {
  return inTransaction(pool, async (db) => {
    const collection = await access(db, id, user, { lock: true });
    const category = query.get('category') ? categoryOf(query.get('category')) : null;
    const after = query.get('from') ? dateOf(query.get('from')) : null;
    const until = query.get('until') ? dateOf(query.get('until')) : null;
    const before = query.get('before');
    let cursorDate = null,
      cursorId = null;
    if (before) {
      const parts = before.split('|');
      if (parts.length !== 2) throw invalid();
      [cursorDate, cursorId] = [dateOf(parts[0]), readId(parts[1])];
    }
    const { rows } = await db.query(
      `SELECT e.id,e.title,e.category,e.event_date::text AS "eventDate",e.author_id AS "authorId",
      u.name AS author FROM p1_entries e JOIN users u ON u.id=e.author_id
      WHERE e.collection_id=$1 AND ($2::text IS NULL OR e.category=$2) AND ($3::date IS NULL OR e.event_date>=$3)
      AND ($4::date IS NULL OR e.event_date<=$4) AND ($5::date IS NULL OR (e.event_date,e.id)<($5::date,$6::uuid))
      AND NOT ${blocked('$7::uuid', 'e.author_id')} ORDER BY e.event_date DESC,e.id DESC LIMIT 21`,
      [id, category, after, until, cursorDate, cursorId, user],
    );
    const members = collection.canWrite
      ? (
          await db.query(
            `SELECT u.id,u.name,m.state FROM p1_collection_members m JOIN users u ON u.id=m.user_id
        WHERE m.collection_id=$1 AND (m.state='active' OR $2::uuid=$3) AND NOT ${blocked('$2::uuid', 'm.user_id')} ORDER BY u.name,u.id LIMIT 50`,
            [id, user, collection.ownerId],
          )
        ).rows
      : [];
    return {
      collection,
      members,
      entries: rows.slice(0, 20),
      next: rows.length > 20 ? rows[19].eventDate + '|' + rows[19].id : null,
    };
  });
}

export async function createEntry(user, id, body, transaction) {
  const clientId = readId(body.clientId);
  const save = async (db) => {
    const collection = await access(db, id, user, { lock: true, write: true });
    if (collection.kind !== 'journal') throw conflict('共创动态使用现有条目。');
    const {
      rows: [existing],
    } = await db.query('SELECT id FROM p1_entries WHERE collection_id=$1 AND author_id=$2 AND client_id=$3', [
      id,
      user,
      clientId,
    ]);
    if (existing) return existing;
    const {
      rows: [count],
    } = await db.query('SELECT count(*)::int n FROM p1_entries WHERE collection_id=$1', [id]);
    if (count.n >= 250) throw invalid('日记条目数量已达上限。');
    const {
      rows: [row],
    } = await db.query(
      `INSERT INTO p1_entries(collection_id,author_id,client_id,title,category,event_date)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
      [
        id,
        user,
        clientId,
        cleanText(body.title, 80, true),
        categoryOf(body.category),
        dateOf(body.eventDate),
      ],
    );
    return row;
  };
  return transaction ? save(transaction) : inTransaction(pool, save);
}

async function entryAccess(db, id, user, write) {
  const {
    rows: [entry],
  } = await db.query(
    `SELECT e.id,e.collection_id AS "collectionId",e.title,e.author_id AS "authorId"
    FROM p1_entries e WHERE e.id=$1 AND NOT ${blocked('$2::uuid', 'e.author_id')}`,
    [id, user],
  );
  if (!entry) throw missing();
  const collection = await access(db, entry.collectionId, user, { lock: true, write });
  return { entry, collection };
}

export async function getEntry(user, id) {
  return inTransaction(pool, async (db) => {
    const { entry, collection } = await entryAccess(db, id, user, false);
    const { rows } = await db.query(
      `SELECT k.id,k.author_id AS "authorId",u.name AS author,k.body,k.revision,k.created_at AS "createdAt",
      coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'mime',p.mime) ORDER BY m.position)
        FROM p1_contribution_media m JOIN private_media p ON p.id=m.media_id WHERE m.contribution_id=k.id),'[]'::jsonb) AS media
      FROM p1_contributions k JOIN users u ON u.id=k.author_id JOIN p1_entries e ON e.id=k.entry_id
      JOIN p1_collections c ON c.id=e.collection_id WHERE k.entry_id=$1 AND ${contributionReadable('k', '$2::uuid')}
      AND ${contributionScope('k', 'c', '$2::uuid')}
      ORDER BY k.created_at,k.id LIMIT 100`,
      [id, user],
    );
    return { entry, collection, contributions: rows };
  });
}

export async function getAlbum(user, id) {
  return inTransaction(pool, async (db) => {
    const collection = await access(db, id, user, { lock: true });
    const { rows } = await db.query(
      `SELECT p.id,p.mime,e.id AS "entryId",e.title,e.event_date::text AS "eventDate",u.name author
      FROM p1_entries e JOIN p1_contributions k ON k.entry_id=e.id JOIN p1_contribution_media m ON m.contribution_id=k.id
      JOIN private_media p ON p.id=m.media_id JOIN users u ON u.id=k.author_id JOIN p1_collections c ON c.id=e.collection_id
      WHERE e.collection_id=$1 AND ${contributionScope('k', 'c', '$2::uuid')} AND ${contributionReadable('k', '$2::uuid')} AND NOT ${blocked('$2::uuid', 'e.author_id')}
      ORDER BY e.event_date DESC,k.created_at DESC,m.position LIMIT 100`,
      [id, user],
    );
    return { collection, media: rows };
  });
}

function history(db, id, revision, user, body, action) {
  return db.query(
    `INSERT INTO p1_contribution_history(contribution_id,revision,editor_id,body,action) VALUES($1,$2,$3,$4,$5)`,
    [id, revision, user, body, action],
  );
}

export async function addContribution(user, id, body) {
  const clientId = readId(body.clientId);
  const text = cleanText(body.body ?? '', 2000);
  const media = idsOf(body.mediaIds ?? [], 6);
  if (!text && !media.length) throw invalid('请填写记录或选择附件。');
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    await entryAccess(db, id, user, true);
    await assertAllowed(db, user, ['limit_sending', 'limit_account']);
    const {
      rows: [existing],
    } = await db.query(
      'SELECT id FROM p1_contributions WHERE entry_id=$1 AND author_id=$2 AND client_id=$3',
      [id, user, clientId],
    );
    if (existing) return existing;
    const {
      rows: [count],
    } = await db.query('SELECT count(*)::int n FROM p1_contributions WHERE entry_id=$1', [id]);
    if (count.n >= 100) throw invalid('条目补充数量已达上限。');
    const ready = await db.query(
      `SELECT b.id FROM private_media b WHERE b.owner_id=$1 AND b.id=ANY($2::uuid[])
      AND ${unusedMedia('b')} AND b.created_at>now()-interval '1 day'`,
      [user, media],
    );
    if (ready.rowCount !== media.length) throw missing();
    const {
      rows: [value],
    } = await db.query(
      `INSERT INTO p1_contributions(entry_id,author_id,client_id,body)
      VALUES($1,$2,$3,$4) RETURNING id`,
      [id, user, clientId, text],
    );
    await db.query(
      `INSERT INTO p1_contribution_media(media_id,contribution_id,position)
      SELECT media,$1,idx FROM unnest($2::uuid[]) WITH ORDINALITY AS m(media,idx)`,
      [value.id, media],
    );
    await history(db, value.id, 1, user, text, 'created');
    return value;
  });
}

async function currentContribution(db, id) {
  const {
    rows: [row],
  } = await db.query(
    `SELECT k.*,c.owner_id AS collection_owner FROM p1_contributions k
    JOIN p1_entries e ON e.id=k.entry_id JOIN p1_collections c ON c.id=e.collection_id WHERE k.id=$1 FOR UPDATE OF k`,
    [id],
  );
  if (!row) throw missing();
  return row;
}

export async function editContribution(user, id, body) {
  const value = cleanText(body.body ?? '', 2000);
  return inTransaction(pool, async (db) => {
    const {
      rows: [key],
    } = await db.query('SELECT entry_id FROM p1_contributions WHERE id=$1 AND author_id=$2', [id, user]);
    if (!key) throw missing();
    await entryAccess(db, key.entry_id, user, true);
    const row = await currentContribution(db, id);
    if (row.removed_at) throw missing();
    if (row.revision !== body.revision) throw conflict('这条记录已更新。');
    if (
      !value &&
      !(await db.query('SELECT 1 FROM p1_contribution_media WHERE contribution_id=$1', [id])).rowCount
    )
      throw invalid('请输入内容。');
    await assertAllowed(db, user, ['limit_sending', 'limit_account']);
    const revision = row.revision + 1;
    await db.query('UPDATE p1_contributions SET body=$2,revision=$3 WHERE id=$1', [id, value, revision]);
    await history(db, id, revision, user, value, 'edited');
    return { revision };
  });
}

export async function removeContribution(user, id) {
  return inTransaction(pool, async (db) => {
    const row = await currentContribution(db, id);
    if (row.author_id !== user && row.collection_owner !== user) throw missing();
    if (row.removed_at) return {};
    const revision = row.revision + 1;
    await db.query("UPDATE p1_contributions SET removed_at=now(),body='',revision=$2 WHERE id=$1", [
      id,
      revision,
    ]);
    // Preserve authorship and revision metadata while purging withdrawn text and attachments.
    await db.query("UPDATE p1_contribution_history SET body='' WHERE contribution_id=$1", [id]);
    await db.query(
      'DELETE FROM private_media WHERE id IN(SELECT media_id FROM p1_contribution_media WHERE contribution_id=$1)',
      [id],
    );
    await history(db, id, revision, user, '', row.author_id === user ? 'withdrawn' : 'removed');
    return {};
  });
}

export async function contributionHistory(user, id) {
  return inTransaction(pool, async (db) => {
    const {
      rows: [row],
    } = await db.query('SELECT entry_id,author_id,removed_at FROM p1_contributions WHERE id=$1', [id]);
    if (!row) throw missing();
    const { collection } = await entryAccess(db, row.entry_id, user, true);
    if (row.author_id !== user) {
      if (collection.ownerId !== user) throw missing();
      if (
        collection.kind === 'collaboration' &&
        !(
          await db.query(
            `SELECT 1 FROM p1_contributions k
        WHERE k.id=$1 AND ${workspaceGrant('k', '$2::uuid')}`,
            [id, user],
          )
        ).rowCount
      )
        throw missing();
    }
    if (
      (
        await db.query(
          `SELECT (${blocked('$1::uuid', '$2::uuid')} OR ${restricted('$1::uuid', '$2::uuid')}) AS hidden`,
          [row.author_id, user],
        )
      ).rows[0].hidden
    )
      throw missing();
    const { rows } = await db.query(
      `SELECT h.revision,h.body,h.action,u.name editor,h.edited_at AS "editedAt" FROM p1_contribution_history h
      LEFT JOIN users u ON u.id=h.editor_id WHERE h.contribution_id=$1 ORDER BY h.revision DESC LIMIT 50`,
      [id],
    );
    return { history: rows };
  });
}

export async function publishCollaboration(user, id, body) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const row = await access(db, id, user, { lock: true, write: true });
    if (row.kind !== 'collaboration' || row.ownerId !== user) throw missing();
    if (row.momentId) return { id: row.momentId };
    if (
      !(
        await db.query(
          `SELECT 1 FROM p1_contributions k JOIN p1_entries e ON e.id=k.entry_id
      WHERE e.collection_id=$1 AND k.removed_at IS NULL LIMIT 1`,
          [id],
        )
      ).rowCount
    )
      throw conflict('请先添加共创内容。');
    const post = await publishMoment(
      user,
      { ...body, body: row.title, clientId: undefined, mediaIds: [] },
      db,
    );
    await db.query('UPDATE p1_collections SET moment_id=$2 WHERE id=$1', [id, post.id]);
    return post;
  });
}

export async function ownContributions(user) {
  const { rows } = await pool.query(
    `SELECT k.id,k.revision,k.body,k.removed_at AS "removedAt",e.title,c.kind FROM p1_contributions k
    JOIN p1_entries e ON e.id=k.entry_id JOIN p1_collections c ON c.id=e.collection_id WHERE k.author_id=$1 ORDER BY k.created_at DESC,k.id LIMIT 50`,
    [user],
  );
  return { contributions: rows };
}
