import { HttpError, inTransaction } from '../core.mjs';
import { pool } from '../db.mjs';
import { idsOf, lockUsers, verifyFriends } from './access.mjs';

const empty = { mode: 'friends', ids: [], history: 'all', date: null, zone: null };
const fields = 'mode,viewers AS ids,history,to_char(local_date,\'YYYY-MM-DD\') AS date,zone';

export async function readMomentSpace(owner) {
  const { rows: [row] } = await pool.query('SELECT ' + fields + ' FROM moment_space_preferences WHERE owner_id=$1', [owner]);
  return { privacy: row ?? empty, configured: !!row };
}

export async function writeMomentSpace(owner, body) {
  const { mode, history } = body;
  if (!['friends','self','allow','deny'].includes(mode) || !['all','3d','180d','custom'].includes(history))
    throw new HttpError(400, '请选择有效的空间权限和展示范围。');
  const ids = mode === 'allow' || mode === 'deny' ? idsOf(body.ids) : [];
  if ((mode === 'allow' || mode === 'deny') && !ids.length) throw new HttpError(400, '请先选择好友。');
  let date = null, zone = null;
  if (history === 'custom') {
    date = body.date;
    if (typeof date !== 'string' || !/^(19\d{2}|[2-9]\d{3})-\d{2}-\d{2}$/.test(date))
      throw new HttpError(400, '请选择有效日期。');
    const time = Date.parse(date + 'T00:00:00Z');
    if (!Number.isFinite(time) || new Date(time).toISOString().slice(0,10) !== date)
      throw new HttpError(400, '请选择有效日期。');
    try {
      if (typeof body.zone !== 'string' || !/^[A-Za-z][A-Za-z0-9_+\-/]{0,79}$/.test(body.zone)) throw Error();
      zone = new Intl.DateTimeFormat('en', { timeZone: body.zone }).resolvedOptions().timeZone;
    } catch { throw new HttpError(400, '当前时区无法识别。'); }
  }
  return inTransaction(pool, async (db) => {
    await lockUsers(db, owner);
    await verifyFriends(db, owner, ids);
    const { rows: [row] } = await db.query(`INSERT INTO moment_space_preferences(owner_id,mode,viewers,history,local_date,zone,cutoff)
      VALUES($1,$2,$3,$4,$5::date,$6,($5::date)::timestamp AT TIME ZONE $6)
      ON CONFLICT(owner_id) DO UPDATE SET mode=excluded.mode,viewers=excluded.viewers,history=excluded.history,
        local_date=excluded.local_date,zone=excluded.zone,cutoff=excluded.cutoff
      RETURNING ${fields}`, [owner, mode, ids, history, date, zone]);
    return { privacy: row, configured: true };
  });
}
