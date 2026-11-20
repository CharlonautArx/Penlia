import { cleanText, HttpError, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { idsOf, lockUsers } from '../p0/access.mjs';
import { invalidMediaRange, mediaResponse, parseMediaRange } from '../p0/moments.mjs';
import { choose, conflict, invalid, missing, timeOf } from '../p1/common.mjs';
import { capsuleEntryVisible, opened } from './access.mjs';
import { assetList, deleteAssets, membersOf, replaceAssets, revisionOf, spaceOf } from './common.mjs';

async function capsuleOf(db, user, id, lock = false) {
  const space = await spaceOf(db, id, user, 'capsule', lock);
  const {
    rows: [capsule],
  } = await db.query(
    `SELECT c.opens_at AS "opensAt",c.sealed_at AS "sealedAt",
    ${opened('c')} AS opened FROM p2_capsules c WHERE c.space_id=$1`,
    [id],
  );
  return { ...space, ...capsule };
}

export async function getCapsule(user, id) {
  return inTransaction(pool, async (db) => {
    const capsule = await capsuleOf(db, user, id, true);
    const { rows: entries } = await db.query(
      `SELECT e.id,e.body,e.revision,e.author_id AS "authorId",u.name AS author,
      ${assetList('entry', 'e.id')} AS media,EXISTS(SELECT 1 FROM p2_capsule_audio audio WHERE audio.entry_id=e.id) AS "hasAudio"
      FROM p2_capsule_entries e JOIN users u ON u.id=e.author_id JOIN p2_spaces s ON s.id=e.space_id
      JOIN p2_capsules c ON c.space_id=e.space_id WHERE e.space_id=$1 AND ${capsuleEntryVisible('e', 's', 'c', '$2::uuid')}
      ORDER BY u.name,e.id`,
      [id, user],
    );
    const members = (await membersOf(db, id, user)).filter(
      (p) => capsule.ownerId === user || p.state === 'active',
    );
    const {
      rows: [mine],
    } = await db.query('SELECT id FROM p2_capsule_entries WHERE space_id=$1 AND author_id=$2', [id, user]);
    return { capsule, entries, members, ownEntryId: mine?.id ?? null };
  });
}
export async function saveCapsuleEntry(user, id, body) {
  const content = cleanText(body.body ?? '', 2500);
  const ids = body.mediaIds === undefined ? undefined : idsOf(body.mediaIds, 6);
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const capsule = await capsuleOf(db, user, id, true);
    if (capsule.sealedAt) throw conflict('胶囊已封存，可以撤回自己的投稿。');
    const {
      rows: [old],
    } = await db.query('SELECT id,revision FROM p2_capsule_entries WHERE space_id=$1 AND author_id=$2', [
      id,
      user,
    ]);
    if (old && revisionOf(body.revision) !== old.revision) throw conflict();
    const {
      rows: [entry],
    } = await db.query(
      `INSERT INTO p2_capsule_entries AS e(space_id,author_id,body)
      VALUES($1,$2,$3) ON CONFLICT(space_id,author_id) DO UPDATE SET body=excluded.body,revision=e.revision+1
      RETURNING id,revision`,
      [id, user, content],
    );
    if (ids) await replaceAssets(db, 'entry', entry.id, user, ids, true);
    return entry;
  });
}
export async function capsuleAction(user, id, body) {
  const action = choose(body.action, ['seal', 'reschedule']);
  return inTransaction(pool, async (db) => {
    const capsule = await capsuleOf(db, user, id, true);
    if (capsule.ownerId !== user) throw missing();
    if (capsule.sealedAt) {
      if (action === 'seal') return {};
      throw conflict('胶囊已封存。');
    }
    if (action === 'reschedule') {
      const next = timeOf(body.opensAt);
      if (+next <= Date.now()) throw invalid('开启时间须在未来。');
      await db.query('UPDATE p2_capsules SET opens_at=$2 WHERE space_id=$1', [id, next]);
      return {};
    }
    if (body.confirmed !== true) throw invalid('请确认封存规则。');
    const {
      rows: [ready],
    } = await db.query(
      `SELECT EXISTS(SELECT 1 FROM p2_capsule_entries e WHERE e.space_id=$1 AND
      (e.body<>'' OR EXISTS(SELECT 1 FROM p2_assets pa WHERE pa.entry_id=e.id) OR
        EXISTS(SELECT 1 FROM p2_capsule_audio aa WHERE aa.entry_id=e.id))) AS ready`,
      [id],
    );
    if (!ready.ready) throw conflict('至少需要一条有内容的投稿。');
    if (
      !(await db.query('UPDATE p2_capsules SET sealed_at=now() WHERE space_id=$1 AND opens_at>now()', [id]))
        .rowCount
    )
      throw conflict('计划开启时间已过，无法封存。');
    return {};
  });
}
export async function withdrawCapsuleEntry(user, entry) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const {
      rows: [e],
    } = await db.query('SELECT id FROM p2_capsule_entries WHERE id=$1 AND author_id=$2 FOR UPDATE', [
      entry,
      user,
    ]);
    if (!e) throw missing();
    await deleteAssets(db, 'entry', entry);
    await db.query('DELETE FROM p2_capsule_entries WHERE id=$1', [entry]);
    return {};
  });
}
export async function ownedCapsuleEntries(user) {
  const { rows } = await pool.query(
    `SELECT e.id,e.space_id AS "spaceId",s.title FROM p2_capsule_entries e
    JOIN p2_spaces s ON s.id=e.space_id WHERE e.author_id=$1 ORDER BY s.created_at DESC,e.id LIMIT 100`,
    [user],
  );
  return { entries: rows };
}

function audioMime(bytes) {
  if (bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WAVE')
    return 'audio/wav';
  if (bytes.toString('ascii', 4, 8) === 'ftyp' && ['M4A ', 'M4B '].includes(bytes.toString('ascii', 8, 12)))
    return 'audio/mp4';
  if (
    bytes.toString('ascii', 0, 3) === 'ID3' ||
    (bytes[0] === 255 && (bytes[1] & 0xe0) === 0xe0 && (bytes[1] & 0x06) !== 0)
  )
    return 'audio/mpeg';
}

export async function uploadCapsuleAudio(user, entry, body) {
  const { base64 } = body;
  if (
    typeof base64 !== 'string' ||
    base64.length > Math.ceil(2097152 / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)
  )
    throw new HttpError(413, '请选择不超过 2 MB 的音频。');
  const bytes = Buffer.from(base64, 'base64'),
    mime = audioMime(bytes);
  if (bytes.length < 16 || bytes.length > 2097152 || !mime || mime !== body.mime)
    throw invalid('请选择有效的 M4A、MP3 或 WAV 文件。');
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const {
      rows: [e],
    } = await db.query('SELECT space_id FROM p2_capsule_entries WHERE id=$1 AND author_id=$2', [entry, user]);
    if (!e) throw missing();
    const capsule = await capsuleOf(db, user, e.space_id, true);
    if (capsule.sealedAt) throw conflict('胶囊已封存。');
    const {
      rows: [usage],
    } = await db.query(
      `SELECT coalesce(sum(octet_length(a.data)),0)::int AS bytes
      FROM p2_capsule_entries e JOIN p2_capsule_audio a ON a.entry_id=e.id WHERE e.author_id=$1 AND e.id<>$2`,
      [user, entry],
    );
    if (usage.bytes + bytes.length > 32 * 1024 * 1024)
      throw new HttpError(413, '语音空间已达上限，请先清理旧投稿。');
    await db.query(
      `INSERT INTO p2_capsule_audio(entry_id,mime,data) VALUES($1,$2,$3)
      ON CONFLICT(entry_id) DO UPDATE SET mime=excluded.mime,data=excluded.data`,
      [entry, mime, bytes],
    );
    return {};
  });
}

export async function deleteCapsuleAudio(user, entry) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db, user);
    const {
      rows: [e],
    } = await db.query('SELECT space_id FROM p2_capsule_entries WHERE id=$1 AND author_id=$2', [entry, user]);
    if (!e) throw missing();
    const capsule = await capsuleOf(db, user, e.space_id, true);
    if (capsule.sealedAt) throw conflict('胶囊已封存。');
    await db.query('DELETE FROM p2_capsule_audio WHERE entry_id=$1', [entry]);
    return {};
  });
}

export async function readCapsuleAudio(user, id, range, head) {
  const {
    rows: [asset],
  } = await pool.query(
    `SELECT a.mime,octet_length(a.data) AS bytes${head ? '' : ',a.data'} FROM p2_capsule_audio a
    JOIN p2_capsule_entries e ON e.id=a.entry_id JOIN p2_capsules c ON c.space_id=e.space_id JOIN p2_spaces s ON s.id=e.space_id
    WHERE e.id=$2 AND ${capsuleEntryVisible('e', 's', 'c', '$1::uuid')}`,
    [user, id],
  );
  if (!asset) throw missing();
  const bounds = parseMediaRange(range, asset.bytes);
  if (!bounds) return invalidMediaRange(asset.bytes);
  return mediaResponse(
    asset.mime,
    asset.bytes,
    range,
    bounds,
    head ? Buffer.alloc(0) : asset.data.subarray(bounds.first, bounds.last + 1),
  );
}
