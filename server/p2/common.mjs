import { cleanText, HttpError } from '../core.mjs';
import { blocked } from '../p0/access.mjs';
import { invalid, missing } from '../p1/common.mjs';
import { unusedMedia } from '../p1/collection-access.mjs';
import { member } from './access.mjs';

export const dayMs = 86_400_000;
export const textOf = (value, max) => cleanText(value ?? '', max);
export function linkOf(value) {
  const text = cleanText(value ?? '', 1000);
  if (!text) return null;
  try {
    const url = new URL(text);
    if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password)
      throw new Error();
    return url.href;
  } catch {
    throw invalid('请输入有效的 http 或 https 链接。');
  }
}
export function revisionOf(value) {
  if (!Number.isSafeInteger(value) || value < 1) throw invalid('请先刷新记录。');
  return value;
}
export async function spaceOf(db, id, user, kind, lock = false) {
  const {
    rows: [space],
  } = await db.query(
    `SELECT s.id,s.title,s.kind,s.owner_id AS "ownerId" FROM p2_spaces s
    WHERE s.id=$1 AND ($3::text IS NULL OR s.kind=$3) AND ${member('s', '$2::uuid')} ${lock ? 'FOR UPDATE OF s' : ''}`,
    [id, user, kind ?? null],
  );
  if (!space) throw missing();
  return space;
}
export async function membersOf(db, id, user) {
  const { rows } = await db.query(
    `SELECT u.id,u.name,m.state FROM p2_members m JOIN users u ON u.id=m.user_id
    WHERE m.space_id=$1 AND NOT ${blocked('$2::uuid', 'm.user_id')} ORDER BY u.name,u.id`,
    [id, user],
  );
  return rows;
}

const slots = { item: 'item_id', itinerary: 'itinerary_id', entry: 'entry_id', status: 'status_id' };
export const assetList = (
  slot,
  id,
) => `coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'mime',m.mime) ORDER BY a.position)
 FROM p2_assets a JOIN private_media m ON m.id=a.media_id WHERE a.${slots[slot]}=${id}),'[]'::jsonb)`;

export async function replaceAssets(db, slot, id, user, ids, allowVideo = false) {
  const column = slots[slot];
  const { rows } = await db.query(
    `SELECT m.id,m.mime,m.owner_id FROM p2_assets a JOIN private_media m ON m.id=a.media_id
    WHERE a.${column}=$1 ORDER BY a.position`,
    [id],
  );
  const kept = rows.filter((r) => ids.includes(r.id));
  if (rows.some((r) => r.owner_id !== user && !ids.includes(r.id)))
    throw new HttpError(403, '附件由上传者管理。');
  const wanted = ids.filter((id) => !kept.some((r) => r.id === id));
  const drafts = await db.query(
    `SELECT b.id,b.mime FROM private_media b WHERE b.id=ANY($1::uuid[]) AND b.owner_id=$2
    AND ${unusedMedia('b')} AND b.created_at>now()-interval '1 day' FOR UPDATE`,
    [wanted, user],
  );
  if (
    drafts.rowCount !== wanted.length ||
    (!allowVideo && [...drafts.rows, ...kept].some((r) => r.mime === 'video/mp4'))
  )
    throw missing();
  await db.query(`DELETE FROM p2_assets WHERE ${column}=$1`, [id]);
  await db.query(
    `INSERT INTO p2_assets(media_id,${column},position)
    SELECT media,$1,position FROM unnest($2::uuid[]) WITH ORDINALITY AS a(media,position)`,
    [id, ids],
  );
  await db.query('DELETE FROM private_media WHERE id=ANY($1::uuid[])', [
    rows.filter((r) => !ids.includes(r.id)).map((r) => r.id),
  ]);
}

export async function deleteAssets(db, slot, id) {
  await db.query(
    `DELETE FROM private_media WHERE id IN (SELECT media_id FROM p2_assets WHERE ${slots[slot]}=$1)`,
    [id],
  );
}
