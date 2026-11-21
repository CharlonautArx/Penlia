import { p2MediaVisible } from '../p2/access.mjs';
import { p3MediaVisible } from '../p3/access.mjs';
import { randomUUID } from 'node:crypto';
import { cleanText, HttpError, inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { blocked, idsOf, lockUsers, verifyFriends } from './access.mjs';
import { collectionReadable, contributionReadable, contributionScope, momentReaders, momentVisible, unusedMedia } from '../p1/collection-access.mjs';

export const mediaLimit = 4 * 1024 * 1024;
const notFound = () => new HttpError(404, '找不到可查看的内容。');
const canRead = momentVisible('p', '$1::uuid');
const projection = `p.id,p.author_id AS "authorId",u.name AS author,p.body,p.revision,p.created_at AS "createdAt",
  CASE WHEN p.author_id=$1 THEN p.scope END AS scope,
  (SELECT c.id FROM p1_collections c WHERE c.moment_id=p.id) AS "collaborationId",
  CASE WHEN p.author_id=$1 THEN p.audience_group END AS "groupId",
  CASE WHEN p.author_id=$1 THEN ARRAY(SELECT v.user_id FROM private_moment_viewers v WHERE v.moment_id=p.id) END AS "memberIds",
  coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'mime',b.mime) ORDER BY b.position)
    FROM private_media b WHERE b.moment_id=p.id),'[]'::jsonb) AS media`;

export async function listMoments(userId, query) {
  const cursor = query.get('before');
  const author = query.get('author') ?? null;
  if (author) readId(author);
  let time = null,
    id = null;
  if (cursor !== null) {
    const parts = cursor.split('|');
    if (
      parts.length !== 2 ||
      !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3,6})?Z$/.test(parts[0]) ||
      !Number.isFinite(Date.parse(parts[0]))
    )
      throw new HttpError(400, '无效的分页位置。');
    [time, id] = [parts[0], readId(parts[1])];
  }
  const { rows } = await pool.query(
    `SELECT ${projection}, to_char(p.created_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time
    FROM private_moments p JOIN users u ON u.id=p.author_id WHERE ${canRead}
    AND ($2::uuid IS NULL OR p.author_id=$2) AND ($3::timestamptz IS NULL OR (p.created_at,p.id)<($3,$4))
    ORDER BY p.created_at DESC,p.id DESC LIMIT 21`,
    [userId, author, time, id],
  );
  const last = rows[19];
  return {
    moments: rows.slice(0, 20).map(({ cursor_time, ...row }) => row),
    next: rows.length > 20 ? last.cursor_time + '|' + last.id : null,
  };
}

export async function getMoment(userId, id) {
  const {
    rows: [moment],
  } = await pool.query(
    `SELECT ${projection} FROM private_moments p JOIN users u ON u.id=p.author_id
    WHERE p.id=$2 AND ${canRead}`,
    [userId, id],
  );
  if (!moment) throw notFound();
  return { moment };
}

async function audience(db, userId, body) {
  const { scope } = body;
  if (!['private', 'friends', 'circle', 'group', 'selected'].includes(scope))
    throw new HttpError(400, '请选择动态可见范围。');
  if (scope === 'circle' || scope === 'group') {
    const id = scope === 'group' ? readId(body.groupId) : null;
    const {
      rows: [group],
    } = await db.query(
      `SELECT id FROM relationship_groups WHERE owner_id=$1 AND circle=$2
      AND ($3::uuid IS NULL OR id=$3)`,
      [userId, scope === 'circle', id],
    );
    if (!group) throw new HttpError(400, '请先设置对应的关系组。');
    return { scope, group: group.id, ids: [] };
  }
  const ids = scope === 'selected' ? idsOf(body.memberIds) : [];
  if (scope === 'selected' && !ids.length) throw new HttpError(400, '请至少选择一位好友。');
  await verifyFriends(db, userId, ids);
  return { scope, group: null, ids };
}

export async function publishMoment(userId, body, transaction) {
  const clientId = transaction ? randomUUID() : readId(body.clientId);
  const text = cleanText(body.body, 2000);
  const media = idsOf(body.mediaIds, 6);
  if (!text && !media.length) throw new HttpError(400, '写点文字，或选择照片和视频。');
  const save = async (db) => {
    await lockUsers(db, userId);
    const done = await db.query('SELECT id FROM private_moments WHERE author_id=$1 AND client_id=$2', [
      userId,
      clientId,
    ]);
    if (done.rowCount) return { id: done.rows[0].id };
    const value = await audience(db, userId, body);
    const uploaded = await db.query(
      `SELECT id,mime FROM private_media b WHERE owner_id=$1 AND id=ANY($2::uuid[])
      AND ${unusedMedia('b')} AND created_at>now()-interval '1 day'`,
      [userId, media],
    );
    if (uploaded.rowCount !== media.length) throw new HttpError(404, '图片或视频已失效，请重新选择。');
    if (media.length > 1 && uploaded.rows.some((row) => row.mime === 'video/mp4'))
      throw new HttpError(400, '一条视频动态只能包含一段视频。');
    const {
      rows: [saved],
    } = await db.query(
      `INSERT INTO private_moments(author_id,client_id,body,scope,audience_group)
      VALUES ($1,$2,$3,$4,$5) RETURNING id`,
      [userId, clientId, text, value.scope, value.group],
    );
    await db.query(
      `UPDATE private_media b SET moment_id=$1,position=media.position
      FROM unnest($2::uuid[]) WITH ORDINALITY AS media(id,position) WHERE b.id=media.id`,
      [saved.id, media],
    );
    await db.query('INSERT INTO private_moment_viewers SELECT $1,id FROM unnest($2::uuid[]) AS viewer(id)', [
      saved.id,
      value.ids,
    ]);
    return saved;
  };
  return transaction ? save(transaction) : inTransaction(pool, save);
}

export async function updateMoment(userId, id, body) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db, userId);
    const {
      rows: [previous],
    } = await db.query('SELECT body,revision FROM private_moments WHERE id=$1 AND author_id=$2 FOR UPDATE', [id, userId]);
    if (!previous) throw notFound();
    if (body.revision !== previous.revision) throw new HttpError(409, '动态已经更新，请刷新后重试。');
    const value = await audience(db, userId, body);
    const text = body.body === undefined ? previous.body : cleanText(body.body, 2000);
    if (!text && !(await db.query('SELECT 1 FROM private_media WHERE moment_id=$1 LIMIT 1', [id])).rowCount) {
      throw new HttpError(400, '请输入动态内容。');
    }
    const {
      rows: [saved],
    } = await db.query(
      `UPDATE private_moments SET body=$2,scope=$3,audience_group=$4,
      revision=revision+1,edited_at=now() WHERE id=$1 RETURNING revision`,
      [id, text, value.scope, value.group],
    );
    await db.query('DELETE FROM private_moment_viewers WHERE moment_id=$1', [id]);
    await db.query('INSERT INTO private_moment_viewers SELECT $1,id FROM unnest($2::uuid[]) AS viewer(id)', [
      id,
      value.ids,
    ]);
    await db.query(`DELETE FROM p1_contribution_public_readers grant_row WHERE moment_id=$1
      AND NOT EXISTS(SELECT 1 FROM (${momentReaders('$1','$2::uuid')}) r WHERE r.id=grant_row.viewer_id)`,[id,userId]);
    return saved;
  });
}

export async function deleteMoment(userId, id) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db, userId);
    const result = await db.query('DELETE FROM private_moments WHERE id=$1 AND author_id=$2', [id, userId]);
    if (!result.rowCount) throw notFound();
    return {};
  });
}

function* mp4Boxes(data, start, end) {
  for (let offset = start, count = 0; offset + 8 <= end && count < 512; count++) {
    let length = data.readUInt32BE(offset);
    const kind = data.toString('ascii', offset + 4, offset + 8);
    let header = 8;
    if (length === 1) {
      if (offset + 16 > end) return;
      const wideLength = data.readBigUInt64BE(offset + 8);
      if (wideLength > BigInt(end - offset)) return;
      length = Number(wideLength);
      header = 16;
    } else if (length === 0) length = end - offset;
    if (length < header || offset + length > end) return;
    yield { kind, start: offset + header, end: offset + length };
    offset += length;
  }
}

function shortMp4(data) {
  const boxes = [...mp4Boxes(data, 0, data.length)];
  if (boxes[0]?.kind !== 'ftyp' || !boxes.some((box) => box.kind === 'mdat')) return false;
  const movie = boxes.find((box) => box.kind === 'moov');
  if (!movie) return false;
  const header = [...mp4Boxes(data, movie.start, movie.end)].find((box) => box.kind === 'mvhd');
  if (!header) return false;
  const version = data[header.start];
  const wide = version === 1;
  if ((version !== 0 && !wide) || header.end - header.start < (wide ? 32 : 20)) return false;
  const timescale = BigInt(data.readUInt32BE(header.start + (wide ? 20 : 12)));
  const duration = wide ? data.readBigUInt64BE(header.start + 24) : BigInt(data.readUInt32BE(header.start + 16));
  return timescale > 0n && duration > 0n && duration <= timescale * 30n;
}

function mediaType(data) {
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff && data.at(-2) === 0xff && data.at(-1) === 0xd9)
    return 'image/jpeg';
  if (data.subarray(0, 8).equals(Buffer.from('89504e470d0a1a0a', 'hex')) && data.toString('ascii', 12, 16) === 'IHDR')
    return 'image/png';
  if (shortMp4(data)) return 'video/mp4';
}

export async function postMedia(userId, input) {
  const clientId = readId(input.clientId);
  if (
    typeof input.base64 !== 'string' ||
    input.base64.length > Math.ceil(mediaLimit / 3) * 4 ||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)
  )
    throw new HttpError(413, '文件超过 4 MB 或格式无效。');
  const data = Buffer.from(input.base64, 'base64');
  if (data.length < 16 || data.length > mediaLimit) throw new HttpError(413, '文件大小不符合要求。');
  const mime = mediaType(data);
  if (!mime || mime !== input.mime) throw new HttpError(400, '请选择 JPEG、PNG 或 30 秒以内的标准 MP4。');
  return inTransaction(pool, async (db) => {
    await lockUsers(db, userId);
    await db.query(
      `DELETE FROM private_media b WHERE owner_id=$1 AND ${unusedMedia('b')} AND created_at<=now()-interval '1 day'`,
      [userId],
    );
    const {
      rows: [existing],
    } = await db.query(`SELECT id,mime FROM private_media WHERE owner_id=$1 AND client_id=$2`, [userId, clientId]);
    if (existing) return existing;
    const {
      rows: [usage],
    } = await db.query(
      `SELECT coalesce(sum(octet_length(data)),0)::integer AS bytes,
      count(*) FILTER(WHERE ${unusedMedia('b')})::integer AS drafts FROM private_media b WHERE owner_id=$1`,
      [userId],
    );
    if (usage.bytes + data.length > 32 * 1024 * 1024 || usage.drafts >= 18)
      throw new HttpError(413, '媒体空间已达上限，请清理旧内容。');
    const {
      rows: [value],
    } = await db.query(
      'INSERT INTO private_media(owner_id,client_id,mime,data) VALUES ($1,$2,$3,$4) RETURNING id,mime',
      [userId, clientId, mime, data],
    );
    return value;
  });
}

export async function discardMedia(userId, id) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db, userId);
    await db.query(
      `DELETE FROM private_media b WHERE id=$1 AND owner_id=$2 AND ${unusedMedia('b')}`,
      [id, userId],
    );
    return {};
  });
}

export async function getMedia(userId, id, range, head) {
  const acl = `FROM private_media b LEFT JOIN private_moments p ON p.id=b.moment_id
    LEFT JOIN chat_group_messages c ON c.id=b.group_message_id WHERE b.id=$2 AND
    ((p.id IS NOT NULL AND ${canRead}) OR
      (c.id IS NOT NULL AND NOT ${blocked('$1::uuid', 'c.sender_id')} AND EXISTS
        (SELECT 1 FROM chat_group_members gm WHERE gm.group_id=c.group_id AND gm.user_id=$1 AND gm.joined_at<=c.sent_at)) OR
      EXISTS(SELECT 1 FROM p1_contribution_media link JOIN p1_contributions pc ON pc.id=link.contribution_id
        JOIN p1_entries pe ON pe.id=pc.entry_id JOIN p1_collections coll ON coll.id=pe.collection_id
        WHERE link.media_id=b.id AND ${collectionReadable('coll','$1::uuid')} AND
        ${contributionReadable('pc','$1::uuid')} AND ${contributionScope('pc','coll','$1::uuid')} AND NOT ${blocked('pe.author_id','$1::uuid')})
      OR ${p2MediaVisible('b','$1::uuid')} OR ${p3MediaVisible('b','$1::uuid')})`;
  const {
    rows: [metadata],
  } = await pool.query('SELECT b.mime,octet_length(b.data) AS bytes ' + acl, [userId, id]);
  if (!metadata) throw notFound();
  const bounds = parseMediaRange(range, metadata.bytes);
  if (!bounds) return invalidMediaRange(metadata.bytes);
  const { first, last } = bounds;
  const length = last - first + 1;
  let binary = Buffer.alloc(0);
  if (!head) {
    const {
      rows: [row],
    } = await pool.query('SELECT substring(b.data from $3 for $4) AS data ' + acl, [userId, id, first + 1, length]);
    if (!row) throw notFound();
    binary = row.data;
  }
  return mediaResponse(metadata.mime, metadata.bytes, range, bounds, binary);
}

export function parseMediaRange(range, size) {
  let first = 0,
    last = size - 1;
  if (range !== undefined) {
    const match = /^bytes=(\d{0,10})-(\d{0,10})$/.exec(range);
    if (!match || (!match[1] && !match[2]))
      return null;
    if (!match[1]) first = Math.max(0, size - Number(match[2]));
    else {
      first = Number(match[1]);
      if (match[2]) last = Math.min(last, Number(match[2]));
    }
    if (last < first)
      return null;
  }
  return { first, last };
}

export function invalidMediaRange(size) {
  return { statusCode: 416, binary: Buffer.alloc(0), headers: { 'Content-Range': 'bytes */' + size } };
}

export function mediaResponse(mime, size, range, { first,last }, binary) {
  return {
    statusCode: range === undefined ? 200 : 206,
    binary,
    headers: {
      'Content-Type': mime,
      'Content-Length': String(last-first+1),
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff',
      ...(range === undefined ? {} : { 'Content-Range': `bytes ${first}-${last}/${size}` }),
    },
  };
}
