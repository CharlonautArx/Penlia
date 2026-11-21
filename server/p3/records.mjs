import { inTransaction, readId } from '../core.mjs';
import { pool } from '../db.mjs';
import { idsOf, lockUsers } from '../p0/access.mjs';
import { unusedMedia } from '../p1/collection-access.mjs';
import { assertAllowed, choose, conflict, invalid, missing } from '../p1/common.mjs';
import { revisionOf, textOf } from '../p2/common.mjs';
import { member, recordVisible, separated } from './access.mjs';
import { findSource, relaySources, sourceMetadata, worldSources } from './sources.mjs';
import { spaceOf } from './spaces.mjs';

const mediaProjection = `coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'mime',b.mime) ORDER BY a.position)
  FROM p3_media a JOIN private_media b ON b.id=a.media_id WHERE a.record_id=r.id),'[]'::jsonb) AS media`;
const projection = `r.id,r.space_id AS "spaceId",r.kind,r.author_id AS "authorId",u.name AS author,r.body,
  r.source_kind AS "sourceKind",r.source_id AS "sourceId",r.icon,r.x,r.y,r.revision,r.created_at AS "createdAt",
  CASE WHEN r.author_id=$1 THEN ARRAY(SELECT v.viewer_id FROM p3_record_viewers v
    WHERE v.record_id=r.id AND NOT ${separated('r.author_id','v.viewer_id')} ORDER BY v.viewer_id) END AS "memberIds",${mediaProjection}`;
const recordKinds = ['contribution','link','decoration'];
const icons = ['flower','lamp','cushion','frame','shell','star'];

function offsetOf(query) {
  const offset = Number(query.get('offset') ?? '0');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 5000) throw invalid();
  return offset;
}

function page(rows,offset) {
  return { records: rows.slice(0,20), next: rows.length > 20 ? offset+20 : null };
}

export async function listRecords(user,id,query) {
  const offset = offsetOf(query);
  await spaceOf(pool,user,id);
  const { rows } = await pool.query(
    `SELECT ${projection},src.title AS "sourceTitle"
    FROM p3_records r JOIN p3_spaces s ON s.id=r.space_id JOIN users u ON u.id=r.author_id
    LEFT JOIN LATERAL (${sourceMetadata('r','$1::uuid')}) src ON r.source_id IS NOT NULL
    WHERE r.space_id=$2 AND ${recordVisible('r','s','$1::uuid')}
      AND (r.source_id IS NULL OR src.title IS NOT NULL)
    ORDER BY r.created_at DESC,r.id DESC LIMIT 21 OFFSET $3`, [user,id,offset],
  );
  return page(rows,offset);
}

export async function ownRecords(user,query) {
  const offset = offsetOf(query);
  const { rows } = await pool.query(
    `SELECT r.id,r.kind,r.body,r.created_at AS "createdAt"
    FROM p3_records r WHERE r.author_id=$1 AND r.removed_at IS NULL ORDER BY r.created_at DESC,r.id DESC LIMIT 21 OFFSET $2`, [user,offset],
  );
  return page(rows,offset);
}

async function setViewers(db,space,user,id,viewers) {
  const { rowCount } = await db.query(
    `SELECT 1 FROM unnest($3::uuid[]) v(id) JOIN p3_spaces s ON s.id=$1
      WHERE v.id<>$2 AND ${member('s','v.id')} AND NOT ${separated('$2::uuid','v.id')}`, [space,user,viewers],
  );
  if (rowCount !== viewers.length) throw invalid('请选择目前可以授权的空间成员。');
  await db.query('DELETE FROM p3_record_viewers WHERE record_id=$1',[id]);
  if (viewers.length)
    await db.query('INSERT INTO p3_record_viewers SELECT $1,id FROM unnest($2::uuid[]) v(id)',[id,viewers]);
}

async function replaceMedia(db,id,user,ids) {
  const { rows: existing } = await db.query('SELECT media_id FROM p3_media WHERE record_id=$1',[id]);
  const wanted = ids.filter((media) => !existing.some((row) => row.media_id === media));
  const drafts = await db.query(
    `SELECT b.id FROM private_media b WHERE b.id=ANY($2::uuid[]) AND b.owner_id=$1
      AND b.created_at>now()-interval '1 day' AND ${unusedMedia('b')} FOR UPDATE OF b`, [user,wanted],
  );
  if (drafts.rowCount !== wanted.length) throw missing();
  await db.query('DELETE FROM p3_media WHERE record_id=$1',[id]);
  await db.query(
    `INSERT INTO p3_media(media_id,record_id,position)
      SELECT media,$1,position FROM unnest($2::uuid[]) WITH ORDINALITY v(media,position)`, [id,ids],
  );
  await db.query('DELETE FROM private_media WHERE owner_id=$1 AND id=ANY($2::uuid[])', [
    user,existing.filter((row) => !ids.includes(row.media_id)).map((row) => row.media_id),
  ]);
}

function placement(kind,body) {
  if (kind !== 'decoration') return [null,null,null];
  if (!Number.isInteger(body.x) || body.x<0 || body.x>3 || !Number.isInteger(body.y) || body.y<0 || body.y>2)
    throw invalid('请选择场景中的格子。');
  return [choose(body.icon,icons),body.x,body.y];
}

export async function saveRecord(user,spaceId,body,id) {
  const kind = choose(body.kind,recordKinds);
  const viewers = idsOf(body.memberIds ?? [],15);
  const text = textOf(body.body, kind==='contribution' ? 1600 : 80);
  const media = idsOf(body.mediaIds ?? [],6);
  const targetKinds = kind==='link' ? relaySources : kind==='decoration' ? worldSources : [];
  const sourceKind = body.sourceKind == null ? null : choose(body.sourceKind,targetKinds);
  const sourceId = sourceKind ? readId(body.sourceId) : null;
  if ((viewers.length || sourceId) && body.confirmed !== true) throw invalid('请先确认本次分享范围。');
  if ((kind==='contribution' && !text && !media.length) || (kind!=='contribution' && media.length) ||
    (kind==='link' && !sourceKind) || (kind==='decoration' && !text && !sourceKind))
    throw invalid('请补充内容。');
  const fields = [text,...placement(kind,body),sourceKind,sourceId];
  return inTransaction(pool, async (db) => {
    await lockUsers(db,user,...viewers);
    const space = await spaceOf(db,user,spaceId,true);
    if ((space.kind==='world') !== (kind==='decoration')) throw missing();
    let saved;
    if (!id) {
      const client = readId(body.clientId);
      const { rows: [previous] } = await db.query(
        'SELECT id,space_id,kind,removed_at FROM p3_records WHERE author_id=$1 AND client_id=$2',[user,client],
      );
      if (previous) {
        if (previous.space_id!==spaceId || previous.kind!==kind) throw conflict();
        if (previous.removed_at) throw conflict('此记录已撤回。');
        return { id:previous.id };
      }
      const { rows: [count] } = await db.query(
        'SELECT count(*)::int AS n FROM p3_records WHERE space_id=$1 AND author_id=$2 AND removed_at IS NULL',[spaceId,user],
      );
      if (count.n >= (space.kind==='world' ? 24 : 120)) throw invalid('此空间中的个人记录已达上限。');
      ({ rows:[saved] } = await db.query(
        `INSERT INTO p3_records(space_id,author_id,kind,client_id,body,icon,x,y,source_kind,source_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`, [spaceId,user,kind,client,...fields],
      ));
    } else {
      ({ rows:[saved] } = await db.query(
        `UPDATE p3_records SET body=$5,icon=$6,x=$7,y=$8,source_kind=$9,source_id=$10,revision=revision+1
        WHERE space_id=$1 AND author_id=$2 AND kind=$3 AND id=$4 AND revision=$11 AND removed_at IS NULL RETURNING id`,
        [spaceId,user,kind,id,...fields,revisionOf(body.revision)],
      ));
      if (!saved) throw conflict();
    }
    if (viewers.length && body.rosterVersion !== space.rosterVersion)
      throw conflict('成员名单已变化，请刷新并重新确认可见成员。');
    if (sourceKind && !(await db.query(findSource(sourceKind,'$1::uuid','$2::uuid'),[user,sourceId])).rowCount)
      throw missing();
    if (viewers.length) await assertAllowed(db,user,['limit_contact','limit_account']);
    await setViewers(db,spaceId,user,saved.id,viewers);
    if (kind==='contribution') await replaceMedia(db,saved.id,user,media);
    return { id:saved.id };
  });
}

export async function deleteRecord(user,id) {
  return inTransaction(pool, async (db) => {
    await lockUsers(db,user);
    const { rows:[record] } = await db.query('SELECT removed_at FROM p3_records WHERE id=$1 AND author_id=$2 FOR UPDATE',[id,user]);
    if (!record) throw missing();
    if (record.removed_at) return {};
    await db.query(`DELETE FROM private_media b USING p3_media a
      WHERE a.record_id=$1 AND a.media_id=b.id AND b.owner_id=$2`, [id,user]);
    await db.query('DELETE FROM p3_record_viewers WHERE record_id=$1',[id]);
    // Keep the idempotency key so a delayed create retry cannot restore withdrawn content.
    await db.query(`UPDATE p3_records SET removed_at=now(),body='',icon=NULL,x=NULL,y=NULL,source_kind=NULL,source_id=NULL
      WHERE id=$1`,[id]);
    return {};
  });
}

export async function sources(user,query) {
  const kind = choose(query.get('kind'),[...relaySources,...worldSources]);
  const { rows } = await pool.query(
    `SELECT id,title FROM (${findSource(kind,'$1::uuid')}) permitted ORDER BY title,id LIMIT 40`, [user],
  );
  return { sources:rows };
}

export async function relatedRelays(user,query) {
  const kind = choose(query.get('kind'),relaySources), id = readId(query.get('id'));
  const { rows } = await pool.query(
    `SELECT DISTINCT s.id,s.title,s.event_day::text AS "eventDay"
    FROM p3_records r JOIN p3_spaces s ON s.id=r.space_id
    WHERE r.kind='link' AND r.source_kind=$2 AND r.source_id=$3 AND s.kind='relay'
      AND ${recordVisible('r','s','$1::uuid')}
      AND EXISTS(SELECT 1 FROM (${findSource(kind,'$1::uuid','$3::uuid')}) v)
      AND EXISTS(SELECT 1 FROM (${findSource(kind,'r.author_id','$3::uuid')}) a)
    ORDER BY "eventDay" DESC,s.id LIMIT 30`, [user,kind,id],
  );
  return { relays:rows };
}
